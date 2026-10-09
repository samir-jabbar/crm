# Research: Workers and Permissions (005)

No new libraries. Everything builds on the 001 permission gate (`route()` + `authorize`), the presentation layer (`policy/present.ts`, `applyFieldRules`, `SENSITIVE_FIELDS`) and the 004 channel hooks (`channelRules`, `requireChannel`, `visibleChannels`). Context7 check (2026-10-08): Drizzle's `inArray(column, db.select(...))` produces `IN (SELECT …)` and is the building block for scope filters (R3).

## R1 — Where permissions live

- **Decision**: a worker's module grants and hidden groups are one JSON value, `users.permissions`, validated by a shared zod schema (`permissionSetSchema`). Scope is stored in columns (`order_scope`, `own_entries_only`, `access_ends_on`) plus two link tables (`order_assignments`, `user_customers`). Templates store the same JSON plus a default scope.
- **Rationale**:
  - Grants and hidden groups are always read and written whole, and are checked in memory.
  - One JSON value gives an atomic save and a simple before/after audit entry.
  - Scope must be joined in SQL, so it lives in real columns and tables.
- **Alternatives**:
  - Normalized grant rows (`user_grants(user, module, actions)`): more tables and diffing for a 13 × 5 matrix, with no query benefit.
  - Scope in JSON: it could not be used in SQL subqueries.

## R2 — Evaluating permissions on each request

- **Decision**: the session middleware already reloads the user row on every request (`validateSessionToken`). From it, `accessFor(user)` builds an `Access` object once per request (stored in the request context):
  - the Owner gets `FULL_ACCESS`;
  - a worker gets their grants, hidden groups and scope.

  `can(user, module, action)` reads it.
  - `authorize({ module, action })` uses `can` instead of "Owner only".
  - `'owner'` policies stay Owner-only.
- **Module keys**: `orders`, `customers`, `suppliers`, `expenses`, `payments.direct`, `payments.bank`, `shipments`, `documents`, `invoices`, `dashboard`, `advisor`, `rates`, `settings`.
  - Existing `payments:*` route policies mean "either channel". `requireChannel` and `visibleChannels` then narrow to the channel.
- **Order routes**: `{ module: 'orders', action: 'view' }` on order reads means *order access*, which is `orders.view` or any order-bound module (FR-010). A viewer without `orders.view` gets the **basic order view**, a presentation rule (R4) that keeps only `id, number, title, customer {id, name}, status`.
- **Rationale**:
  - Permission changes apply on the next request with no cache to invalidate (FR-014, SC-005).
  - The 001 gate stays the single entry point.
- **Alternatives**: caching permissions in the session row, which would need invalidation on every change.

## R3 — Data scope in queries

- **Decision**: `policy/scope.ts` exports SQL predicates built from the `Access`:
  - `orderVisible(access)`:
    - `all`: no filter;
    - `assigned`: `orders.id IN (SELECT order_id FROM order_assignments WHERE user_id = ?)`;
    - `customers`: `orders.customer_id IN (SELECT customer_id FROM user_customers WHERE user_id = ?)`.
  - `ownEntries(access, table)`: `created_by = ?` when "own entries only" is on.
  - `customerVisible` and `supplierVisible`:
    - with the "all" scope, everything;
    - otherwise, linked to a visible order (customers through `orders.customer_id`; suppliers through `order_items.supplier_id` or `expenses.paid_to_supplier_id`), or `created_by = viewer` (FR-022).

  Every list, page, picker, search, total and file lookup of orders, items, notes, expenses, payments, plan stages, customers, suppliers and reimbursements takes the `Access` and adds the predicate. Single-record lookups use the same predicate, so an out-of-scope id gives `404 not_found`, the same as a missing record (FR-013).
- **Rationale**:
  - Filtering in SQL keeps pagination correct and never loads hidden rows.
  - A single module per predicate keeps the rules in one place.
- **Safety net**: a route-sweep integration test (R12) calls every registered route as a restricted worker, using the ids of out-of-scope records, and fails on anything other than 403/404 or on leaked ids.
- **Alternatives**: filtering after loading, which breaks paging and risks leaks through totals.

## R4 — Hiding values and inheritance (D6)

- **Decision**: six hidden groups: `sellingPrice`, `supplierPrices`, `supplierIdentity`, `customerContacts`, `paymentAmounts`, `bankDetails`.
  - `SENSITIVE_FIELDS` becomes `HIDDEN_FIELDS: Record<HiddenGroup, Partial<Record<Resource, string[]>>>`.
  - `applyFieldRules` removes the keys of the viewer's hidden groups. Keys are **omitted**, never sent as `null`, because `null` already means "not set", for example a missing agreed rate.
- **Derived figures**: a `FIGURES` table in `policy/figures.ts` lists, for each figure, the visibility conditions it needs. `figureVisible(access, figure)` evaluates them:

  | Figure | Needs |
  |---|---|
  | `profit`, `marginPercent` | `sellingPrice`, `paymentAmounts`, `supplierPrices` visible; both channels; Expenses view on all entries |
  | `remaining`, `percentPaid`, `overpaid`, `warnings`, closing outstanding | `sellingPrice`, `paymentAmounts`; both channels |
  | `received`, `receivedTotals`, `averageRates`, `fxResultCny` | `paymentAmounts`; both channels (`fxResult` also needs `sellingPrice` for the agreed rate) |
  | channel `planned`, plan stage `amount` | `sellingPrice` |
  | channel `received` | `paymentAmounts` |
  | channel `remaining` | `sellingPrice`, `paymentAmounts` |
  | expense `grand`, `unpaid`, `budgetUsed` | Expenses view on all entries; `supplierPrices` |
  | category total | Expenses view on all entries; `supplierPrices`, unless the category holds no purchase expense |
  | customer balance | `sellingPrice`, `paymentAmounts`; both channels |

  Purchase expenses are those in the `cat-equipment_purchase` category or with a supplier as "paid to" (FR-025). With `supplierPrices` hidden, their `amount`, `rate`, `cnyAmount` and receipt link are removed per row, and the category totals that contain them are removed. This is the only data-dependent rule.
- **Own entries** (FR-028): totals are recomputed over the viewer's own rows and returned as `yourEntries: {...}` in place of the order totals.
- **Types**: shared response types mark sensitive and derived fields optional (`agreedPrice?: string`). Web components render a figure only when it is present.
- **Rationale**: the table is unit-testable and lives in one place. Omitting keys guarantees that "never sent" holds at the JSON level.
- **Alternatives**: per-endpoint `if` checks, which are scattered and unprovable; `null` placeholders, which are ambiguous.

## R5 — Search on hidden values (FR-030)

- **Decision**: the searches built in 001–004 match on:
  - orders: number, title, customer name, item product and model;
  - customers: name, company, city, phone;
  - suppliers: name, company, contact person, city;
  - "advanced by" names.

  Only `customers.phone` is in a hidden group (`customerContacts`), so it is dropped from the customer search predicate for those viewers. Supplier search is unreachable when `supplierIdentity` is hidden, because the module is refused.
- **Rationale**: the set is small and explicit, and a test pins it (searching for a phone number finds nothing).

## R6 — Registration and rejection (D9, FR-001–FR-006)

- **Decision**:
  - `POST /api/auth/register` is public. It creates `users(role='worker', status='pending', permissions=null)` and a `registrations` row (ip, user agent, device, approximate location, time).
  - **Throttle**: count `registrations` rows from the same ip in the last hour; the 6th is refused with `429 too_many_attempts`.
  - **Closing registration**: `company_settings.registration_open` (default 1) is Owner-only. While it is 0, the endpoint answers `403 registration_closed` and `GET /api/auth/registration` reports `{ open: false }` so the sign-in screen hides the link.
  - **Rejection** marks the account `status='deleted'`, sets `rejected_at`, and tombstones `username_normalized` to `!rejected:<id>`, which can never match the username pattern. The username is free again. The row stays because the audit log and sign-in history reference users by foreign key.
  - **Deletion** (FR-039) also sets `status='deleted'` but keeps `username_normalized`, so the username is never reused.
- **Alternatives**:
  - Hard-deleting rejected users is impossible: `audit_entries.actor_user_id` references `users`.
  - A new `rejected` status would need a rebuild of the users table to change its CHECK.

## R7 — Sign-in outcomes for non-active accounts (FR-002, FR-023, FR-036)

- **Decision**: after a correct password:
  - `pending` → `403 account_pending`;
  - `suspended` → `403 account_suspended`;
  - access ended → `403 access_ended { date }`;
  - `deleted` → the generic `401 invalid_credentials`.

  A wrong password always gives the generic answer (001 FR-010). `SIGN_IN_REASONS` gains `account_pending`, `account_suspended` and `access_ended`.
- **Access end**: `accessEnded(user, now)` compares `access_ends_on` with today's China date (UTC+8, like order numbering). `validateSessionToken` refuses sessions of users who are not active or whose access has ended, so sessions end at the next request with no background job.

## R8 — Temporary passwords (FR-037)

- **Decision**: `POST /api/users/:id/password { temporaryPassword }` (Owner) hashes the temporary password and sets `must_change_password = 1`. It also revokes every session of the worker (`revokeAllForUser`, reason `owner_reset`).
- While the flag is set, the authorize middleware refuses every authenticated route except `GET /api/me`, `POST /api/me/password` and sign-out, with `403 password_change_required`. The web app then shows the change-password screen. A successful change clears the flag.

## R9 — Templates (FR-015–FR-017)

- **Decision**:
  - `role_templates(id, default_key, name, permissions, order_scope, own_entries_only, …, deleted_at)`.
  - The migration seeds five rows with a `default_key` (`logistics`, `site_assistant`, `accountant`, `sales_assistant`, `read_only`) and `name = null`. A null name displays the translated default; renaming sets `name`.
  - Applying a template copies `permissions`, `order_scope` and `own_entries_only` to the user, and sets `users.template_id` and `permissions_adjusted = 0`. Any later edit of the user's access sets `permissions_adjusted = 1`.
  - Deleting a template is soft. Users keep their copy, and their page shows the template as deleted.

## R10 — Combinations that cannot work (FR-008, FR-032)

- **Decision**: `permissionSetSchema` (shared, used by the server and the web editor) normalizes and validates a permission set:
  - Normalizes: Create, Edit, Delete and Export add View. Only the actions allowed per module are kept.
  - Rejects, with error `permission_conflict` and a reason code:
    - `orders.create` without `sellingPrice` visible or without `customers.view`;
    - payment `create`/`edit` with `paymentAmounts` hidden;
    - `suppliers.*` with `supplierIdentity` hidden;
    - `expenses.create`/`edit` with `supplierPrices` or `supplierIdentity` hidden: allowed, but the server refuses saving a purchase expense (equipment-purchase category or supplier "paid to") with `403 purchase_hidden`, and the form does not offer them.
  - Closing: the "Closed" status needs `figureVisible(access, 'remaining')`. Otherwise the server answers `403 forbidden` and the web app does not offer it.
- **Rationale**: the same rules are explained in the editor and enforced on the server.

## R11 — Saving never changes hidden values (FR-031)

- **Decision**: for viewers with hidden groups, update routes parse a partial input schema in which hidden fields are optional and ignored. The service then fills them from the current record before validating.
  - **Orders**: with `sellingPrice` hidden, `agreedPrice`, `agreedRate`, `budget` and `items` are taken from the current order. Item lines are read-only, and the web form shows them without prices or edit controls.
  - **Payments**: editing needs `paymentAmounts` (R10), so no merge is needed.
  - **Expenses**: purchase expenses cannot be edited by a viewer with `supplierPrices` hidden. Other expenses carry no hidden fields.
  - **Customers**: with `customerContacts` hidden, phone, email and notes are kept.

## R12 — Testing strategy

- **Unit**: `permissionSetSchema` (normalization, conflicts), `FIGURES`/`figureVisible`, `accessEnded` (China date), and the scope predicates' SQL on a seeded in-memory DB.
- **Integration**:
  - registration, approval and rejection;
  - account actions;
  - templates;
  - per-module enforcement;
  - scope;
  - hidden groups;
  - **sentinel sweeps**:
    - seed records whose values are unique sentinels (agreed price 777,123.45, payment 31,415.92, phone `+212 600 99 88 77`, and so on);
    - call every registered GET route as each restricted worker;
    - assert that no response body contains a hidden sentinel or an id of an out-of-scope record (SC-001, SC-003).
  - A route registry check also asserts that every route has a module policy, or is `owner` for user management.
- **E2E** (mobile and desktop):
  - register → approve → the worker signs in;
  - the AC6 worker sees exactly two orders and two tabs;
  - the permission editor;
  - the three example workers' main paths;
  - the new screens in EN/FR/AR at 360 px.

## R13 — Performance (SC-007)

- **Decision**: indexes on:
  - `order_assignments(user_id, order_id)`;
  - `user_customers(user_id, customer_id)`;
  - `orders(customer_id)` (existing);
  - `expenses(created_by)` and `payments(created_by)`;
  - `order_items(supplier_id)`.

  The scope subqueries are then index lookups. `Access` is built once per request.

## R14 — Exports and later modules

- **Decision**: the Export action is stored, and the `can(..., 'export')` check exists. No export route exists in 001–004. Shipments, Documents, Invoices and Advisor grants are stored, and the order page shows their tabs as "coming in a later update" only when they are granted. The AC6 sweep checks that the Shipments and Documents tabs are the only tabs.
