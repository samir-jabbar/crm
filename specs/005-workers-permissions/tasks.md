---
description: "Task list for 005 Workers and Permissions"
---

# Tasks: Workers and Permissions

**Input**: Design documents from `specs/005-workers-permissions/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: Included. The constitution requires the brief's acceptance criteria to be automated, and SC-001 and SC-003 require sweeps that prove nothing leaks. Test names reference the quickstart scenarios W1–W24.

**Builds on 001–004**: reuse these, don't re-create them:
- `route()` with policies and `registeredRoutes(app)` (`apps/server/src/policy/route.ts`);
- `authorize`, `can`, `requirePermission`, `channelRules`, `requireChannel` and `visibleChannels` (`policy/authorize.ts`);
- `applyFieldRules`, `SENSITIVE_FIELDS` and every `present*` (`policy/present.ts`);
- `validateSessionToken`, `revokeAllForUser` and `createSession` (`auth/sessions.ts`); `signIn` (`auth/signIn.ts`); `checkThrottle` (`auth/throttle.ts`); `recordSignInAttempt`; the password rules and argon2 helpers (`auth/password.ts`);
- `recordAudit` (with before/after diffing), `newId()`, `AppError`, `notFound`, `forbidden`, `parseWith` / `readJsonBody`;
- `chinaYear` and the China time zone logic (`orders/numbering.ts`);
- the 004 safe migrations (`runMigrations`: pre-migration copy, foreign keys off, `foreign_key_check`);
- the test harness: `createTestContext`, `ctx.createOwner()`, `ctx.createWorker()`, `ctx.client()`, `seedOrder`, `seedExpense`, `seedPayment`, `TINY_JPEG`, `clock.advance`;
- web: `api()`, `useMe`, `guards.tsx`, `AppShell`, `AddressPicker`, `ConfirmDelete`, `ComingSoon`, `AmountText`;
- e2e: `signIn`, `setLanguage`, `expectNoHorizontalScroll`, `apiCustomer`, `apiOrder`, `apiExpense`, `apiPayment`, `ORIGIN`, `OWNER`.

**Library docs**: check Context7 before using any library API not yet used in this repo (CLAUDE.md).

**Shell note**: write code that contains backslashes with Write/Edit, never through a Bash heredoc (see memory).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on unfinished tasks)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup

**Purpose**: confirm the 004 baseline is green on this branch.

- [X] T001 Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` from the repo root. Expect 249 server + 7 web unit/integration tests and 74 e2e tests passing. Fix nothing in 001–004 unless a check fails.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the permission vocabulary and rules, the schema and seeds, per-request access, scope predicates, the field-rule infrastructure, test helpers and web access helpers.

**⚠️ CRITICAL**: no user-story work starts before this phase is complete.

### Shared package

- [X] T002 [P] Extend `packages/shared/src/enums.ts`:
  - `MODULES` (13 keys: `orders, customers, suppliers, expenses, payments.direct, payments.bank, shipments, documents, invoices, dashboard, advisor, rates, settings`) and `MODULE_ACTIONS` (dashboard: view, export; advisor: view; rates and settings: view, edit; others: all five);
  - `ORDER_BOUND_MODULES`, `HIDDEN_GROUPS` (`sellingPrice, supplierPrices, supplierIdentity, customerContacts, paymentAmounts, bankDetails`), `ORDER_SCOPES` (`all, assigned, customers`), `TEMPLATE_KEYS` (`logistics, site_assistant, accountant, sales_assistant, read_only`), each with its type;
  - `SIGN_IN_REASONS` += `account_pending, account_suspended, access_ended`;
  - `AUDIT_ACTIONS` += the data-model.md list;
  - `REGISTRATION_THROTTLE = { max: 5, windowMs: 3_600_000 }`, `PURCHASE_CATEGORY_ID = 'cat-equipment_purchase'`.
- [X] T003 [P] Add to `ERROR_CODES` in `packages/shared/src/errors.ts`: `account_pending`, `account_suspended`, `access_ended`, `registration_closed`, `password_change_required`, `permission_conflict`, `purchase_hidden`, `already_decided`, `username_taken`. Add `details.date?: string` and `details.reason?: string`, also in `apps/server/src/lib/errors.ts`.
- [X] T004 [P] Create `packages/shared/src/permissions.ts` (export it from `index.ts`):
  - `permissionSetSchema` (zod) for `{ modules, hidden }`:
    - normalizes: Create, Edit, Delete and Export add View; actions a module doesn't offer are dropped; arrays are sorted;
    - rejects conflicts with `permission_conflict` and a `reason` (research R10): `orders_create_needs_prices`, `orders_create_needs_customers`, `payments_write_needs_amounts`, `suppliers_need_identity`;
  - the `Access` type and `ownerAccess()`;
  - `FIGURES`, a map from each figure to its requirements (research R4 table), and `figureVisible(access, figure)`;
  - `bothChannels(access)` and `isPurchaseExpense({ categoryId, paidToSupplierId })`.
- [X] T005 [P] Unit tests in `apps/server/tests/unit/permission-set.test.ts` and `apps/server/tests/unit/figures.test.ts`:
  - normalization (`{ expenses: ['create'] }` → `['create','view']`; `dashboard: ['edit']` is dropped);
  - each conflict reason;
  - every `FIGURES` row, including: profit hidden by `supplierPrices`, by a missing channel and by `ownEntriesOnly`; channel `received` visible with `sellingPrice` hidden; `fxResultCny` needs both channels and `sellingPrice`.

### Schema and migrations

- [X] T006 Update `apps/server/src/db/schema/`:
  - `users.ts` gains `permissions`, `orderScope` (CHECK), `ownEntriesOnly`, `accessEndsOn`, `templateId`, `permissionsAdjusted`, `mustChangePassword`, `approvedAt`, `approvedBy`, `rejectedAt` and `deletedAt`;
  - `companySettings.ts` gains `registrationOpen` (default 1);
  - new files `roleTemplates.ts`, `orderAssignments.ts`, `userCustomers.ts` and `registrations.ts`, with the PKs and indexes from data-model.md;
  - `expenses_created_by` and `payments_created_by` indexes;
  - all exported from `index.ts`.
- [X] T007 Run `npm run db:generate -w @hanjing/server` to create `apps/server/drizzle/0008_workers_permissions.sql`. Review it: it must only `ALTER TABLE … ADD COLUMN` and `CREATE TABLE/INDEX`, with no rebuild of `users`. If drizzle-kit rebuilds a table, replace that part with `ADD COLUMN` statements as in 003. Remove any `PRAGMA` lines (004 R7).
- [X] T008 Write the custom migration `apps/server/drizzle/0009_role_templates.sql` and its journal entry. It inserts the five templates (`tpl-logistics`, `tpl-site_assistant`, `tpl-accountant`, `tpl-sales_assistant`, `tpl-read_only`) with `name = NULL`, the normalized `permissions` JSON of spec FR-015, and their scope.
- [X] T009 Integration test in `apps/server/tests/integration/migration005.test.ts` (W24). On a 004-shaped database with an Owner and an order:
  - the migration leaves the Owner unchanged and creates 5 templates whose permissions pass `permissionSetSchema`;
  - `foreign_key_check` is empty, and a pre-migration copy is made.

### Access, policy and scope

- [X] T010 Create `apps/server/src/policy/access.ts`:
  - `accessFor(user)`: the Owner gets `ownerAccess()`; a worker gets their parsed permissions, scope, `ownEntriesOnly`, `customerIds` (loaded lazily) and `basicOrdersOnly`;
  - `chinaToday(ms)` and `accessEnded(user, now)`.

  Unit test in `apps/server/tests/unit/access-end.test.ts`: the end date is inclusive, and the day changes at 16:00 UTC.
- [X] T011 Rewrite `can`, `authorize` and `channelRules` in `apps/server/src/policy/authorize.ts`:
  - `c.set('access', accessFor(user))` once per request;
  - `can(access, module, action)`; `'payments'` means either channel;
  - the order *read* policy accepts `orders.view` or any order-bound module;
  - `'owner'` stays Owner-only;
  - while `mustChangePassword` is set, everything is refused with `403 password_change_required`, except `GET /api/me`, `POST /api/me/password` and `POST /api/auth/sign-out`.

  Update `requirePermission`, `requireChannel` and `visibleChannels` to take the `Access`. Add `access` to `AppEnv` in `apps/server/src/env.ts`.
- [X] T012 [P] Create `apps/server/src/policy/scope.ts` with `orderVisible(access)`, `ownEntries(access, table)`, `customerVisible(access)` and `supplierVisible(access)` (research R3), using `inArray(column, db.select(...))`, and `undefined` for unrestricted access. Unit test in `apps/server/tests/unit/scope.test.ts` on a seeded in-memory database: assigned, customers, own entries, and customers and suppliers linked or created.
- [X] T013 Restructure `apps/server/src/policy/present.ts`:
  - `PresentCtx` gains `access`;
  - replace `SENSITIVE_FIELDS` with `HIDDEN_FIELDS: Record<HiddenGroup, Partial<Record<Resource, string[]>>>` and a helper `omitFigures(body, access, figureKeys)`;
  - add the basic order view (`id, number, title, customer {id,name}, status, deletedAt`) when `access.basicOrdersOnly`.

  Leave the per-resource lists empty for now (they are filled in US4). Owner output must stay byte-identical: run the 001–004 suites.
- [X] T014 Extend `apps/server/tests/helpers.ts`:
  - `ctx.createWorker({ permissions, orderScope, ownEntriesOnly, customerIds, assignedOrderIds, hidden, accessEndsOn })`, which inserts an approved worker directly;
  - `seedSentinels(owner)`: quickstart's seed with the sentinel values;
  - `sweepGetRoutes(ctx, client, ids)`: calls every registered GET route, with `:id` params filled from `ids`, and returns `{ route, status, text }[]`.

### Web building blocks

- [X] T015 Extend `GET /api/me` (`apps/server/src/routes/me.ts`, `packages/shared/src/api/me.ts`) with `access` and `user.mustChangePassword` (contracts). Create `apps/web/src/lib/access.ts` with `useAccess()`, `can(module, action)`, `hidden(group)` and `figure(name)`, using the shared `figureVisible`. Add `RequireModule` and the password-change redirect to `apps/web/src/components/guards.tsx`, and a generic "You don't have access to this page" screen.
- [X] T016 [P] Add base translations in `apps/web/src/locales/{en,fr,ar}/common.json`:
  - module, action and hidden-group names, with each group's one-line explanation (FR-044);
  - default template names, user statuses, scope labels;
  - the new error codes, "access denied" and "coming in a later update" (reused).

**Checkpoint**: all 001–004 tests still pass with the Owner. The migration works on a 004 database.

---

## Phase 3: User Story 1 — A new worker registers and the Owner lets them in (Priority: P1) 🎯 MVP

**Goal**: self-registration, pending accounts, Owner approval with a template, rejection, closing registration.

**Independent Test**: register, cannot sign in, approved with "Read-only", signs in and can only view; a second registration is rejected and its username is free again.

### Tests for User Story 1

- [X] T017 [P] [US1] Integration test in `apps/server/tests/integration/register.test.ts` (W1–W4):
  - `201 pending`;
  - sign-in outcomes: `account_pending` with the right password, `invalid_credentials` with a wrong one;
  - a username taken by pending, suspended or deleted accounts;
  - the Owner list and `pendingCount`;
  - approve with `tpl-read_only` (permissions copied, `template_id` set, worker sign-in works, a write is refused);
  - `already_decided` on a second approval;
  - reject → the username can be registered again;
  - `registration_closed`;
  - the 6th registration from one ip in an hour → `429`; after the window it works;
  - audit entries.
- [X] T018 [P] [US1] E2E in `apps/web/e2e/workers.spec.ts`: register from the sign-in screen on a phone, see the pending message, then the Owner approves from Users with "Read-only", and the worker signs in and sees no Add/Edit buttons.

### Implementation for User Story 1

- [X] T019 [US1] Create `apps/server/src/auth/register.ts` and `apps/server/src/routes/register.ts`:
  - `GET /api/auth/registration` and `POST /api/auth/register` (public);
  - the throttle counts `registrations` by ip within the window;
  - username rules and uniqueness as in 001 setup;
  - the user is inserted as `role=worker, status=pending`, with a `registrations` row (ip, user agent, device, location) and `user.registered` audit.
- [X] T020 [US1] Update `apps/server/src/auth/signIn.ts` and `auth/sessions.ts`:
  - after a correct password: `403 account_pending` / `account_suspended` / `access_ended { date }`, recorded with the new reasons; deleted → generic;
  - `validateSessionToken` refuses users who are not active or whose access has ended.
- [X] T021 [US1] Create `apps/server/src/users/{query,service,templates}.ts` and `apps/server/src/routes/users.ts` (`owner` policy):
  - `GET /api/users` (filters, `pendingCount`) and `GET /api/users/:id` (`UserDetail`);
  - `POST /api/users/:id/approve` (copy the template's permissions and scope, an optional `access` override validated by `permissionSetSchema`, audit);
  - `POST /api/users/:id/reject` (status deleted, `rejected_at`, tombstoned `username_normalized`, audit).

  Add `presentUserListItem` and `presentUserDetail` to `present.ts`, and shared types in `packages/shared/src/api/users.ts`.
- [X] T022 [US1] Add `registrationOpen` to the settings service and route (`apps/server/src/settings/service.ts`, `routes/settings.ts`, the shared settings schema), Owner-only, audited as `settings.updated`.
- [X] T023 [P] [US1] Web `apps/web/src/routes/register.tsx` (username, display name, password twice, language; then the pending message) and the Register link on `sign-in.tsx` when `GET /api/auth/registration` says open. Show the account_pending, suspended and ended messages on sign-in. Add the route in `router.tsx`.
- [X] T024 [US1] Web `apps/web/src/routes/users/list.tsx` (pending first, with registration time, device and location; statuses) and `routes/users/approve.tsx` (template picker → Approve; Reject with confirmation). Add a "Users" entry with the pending count badge in `AppShell.tsx` (Owner only), the "Registration open" switch in the Settings security section, and `apps/web/src/api/users.ts`.
- [X] T025 [US1] Add the US1 translations (EN/FR/AR) to `apps/web/src/locales/*/common.json`.

**Checkpoint**: W1–W4 pass. A worker can join and sign in.

---

## Phase 4: User Story 2 — Modules and actions per worker (Priority: P1)

**Goal**: the matrix is enforced on every route and reflected in the UI; templates can be edited and applied.

**Independent Test**: a worker with Expenses View + Create sees only the Expenses tab, can add but not edit or delete, and direct requests elsewhere are refused.

### Tests for User Story 2

- [X] T026 [P] [US2] Integration test in `apps/server/tests/integration/modules.test.ts` (W5–W7, W9):
  - per module and action, an allowed request succeeds and the others give `403`;
  - order reads with only an order-bound module return the basic view;
  - Bank-only: no Direct payments, stages or combined figures (`received`, `remaining`, `percentPaid`, `averageRates`, `fxResultCny`, `profit`);
  - a change applies on the next request (W6);
  - user management, the audit log, `sessionIdleTimeoutMinutes` and `registrationOpen` are refused even with every module granted.
- [X] T027 [P] [US2] Integration test in `apps/server/tests/integration/templates.test.ts` (W8):
  - CRUD; a renamed default and `name: null` restoring it;
  - conflicts → `400 permission_conflict`;
  - an edit doesn't change existing users until `apply-template`; `permissions_adjusted` after `PUT /access`;
  - a deleted template is shown as deleted on its users;
  - audit.

### Implementation for User Story 2

- [X] T028 [US2] Review the policy of every 001–004 route against contracts/api.md and fix them:
  - `PATCH /api/settings` becomes `settings:edit`, with an Owner check for `sessionIdleTimeoutMinutes` and `registrationOpen`; `GET` omits those fields for workers;
  - the order-number prefix: `settings:edit`;
  - category changes: `settings:edit` + `requirePermission(expenses, view)`;
  - payment settings: `settings:*` + both channels;
  - exchange-rate settings: `rates:view/edit`.

  Files: `apps/server/src/routes/{settings,expenseCategories,paymentSettings,rates,orders}.ts`.
- [X] T029 [US2] Basic order view: order list and detail routes (`apps/server/src/routes/orders.ts`, `orders/query.ts`, `present.ts`) return the basic view for `basicOrdersOnly`. Notes, items, financials, duplicate, edit and status need the Orders actions.
- [X] T030 [US2] Combined payment figures: `apps/server/src/payments/query.ts` and `orders/financials.ts` omit, through `FIGURES`, the figures that need both channels when the viewer lacks one. The plan and channels are already filtered by `visibleChannels`; check that warnings are filtered too.
- [X] T031 [US2] Templates and access routes:
  - `apps/server/src/users/templates.ts` and `apps/server/src/routes/roleTemplates.ts` (`GET/POST/PUT/DELETE /api/role-templates`);
  - `PUT /api/users/:id/access` and `POST /api/users/:id/apply-template` in `routes/users.ts`, with audit `user.access_changed` (before/after).
- [X] T032 [US2] Web `apps/web/src/routes/users/PermissionEditor.tsx`:
  - one row per module with action chips, plus No access;
  - a hidden-group switch list with explanations;
  - inline conflict messages from `permissionSetSchema`;
  - "Start from template";
  - a sticky Save.

  Also `routes/users/detail.tsx`, which shows the template the worker started from and an "adjusted" mark, and wires the US6 actions later.
- [X] T033 [P] [US2] Web `apps/web/src/routes/users/templates.tsx`: list, create, rename, edit with `PermissionEditor`, delete; shows `usedBy`.
- [X] T034 [US2] Web gating from `useAccess()`:
  - `AppShell.tsx` navigation;
  - order page tabs (`routes/orders/detail.tsx`): later modules show `ComingSoon` only when granted;
  - Add/Edit/Delete/Restore/Duplicate/status buttons in the orders, customers, suppliers, expenses and payments screens;
  - `RequireModule` on routes in `router.tsx`, so a forbidden screen shows the access-denied page.
- [X] T035 [US2] Add the US2 translations to the locales.

**Checkpoint**: W5–W9 pass.

---

## Phase 5: User Story 3 — Orders, own entries and an end date (Priority: P2)

**Goal**: scope applied everywhere; assignments; selected customers; own entries; access end.

**Independent Test**: two of five orders assigned → only those reachable everywhere; own entries only → only own expenses with "Your entries" totals; an end date in the past → no sign-in.

### Tests for User Story 3

- [X] T036 [P] [US3] Integration test in `apps/server/tests/integration/scope.test.ts` (W10–W13):
  - lists, search, pickers, customer and supplier pages, details, notes, expenses, payments, plan, receipts, proofs and reimbursements for assigned and customers scopes; out-of-scope ids give `404`;
  - auto-assign on create; a customer created under the customers scope joins the selection;
  - own entries: rows and `yourEntries` totals, with no order totals;
  - access end at the China-day boundary (using `clock`): sessions refused, sign-in `access_ended`, a later date restores access;
  - unassigning applies on the next request.

### Implementation for User Story 3

- [X] T037 [US3] Create `apps/server/src/users/assignments.ts` and `apps/server/src/routes/assignees.ts`:
  - `GET/PUT /api/orders/:id/assignees` and `PUT /api/users/:id/orders` (Owner), with audit `order.assignees_changed`;
  - in `orders/service.ts`, `createOrder`/`duplicateOrder` auto-assign a worker with the assigned scope;
  - in `customers/service.ts`, `createCustomer` adds to `user_customers` under the customers scope.
- [X] T038 [US3] Apply `orderVisible(access)` in `apps/server/src/orders/{query,service,notes}.ts`:
  - `listOrders` (including search), `loadOrderView`, `ordersOfCustomer`, `ordersOfSupplier`, `ordersSummary`;
  - every update, delete, restore, status, duplicate and notes path (`404` when out of scope).

  Pass `access` from `routes/orders.ts`.
- [X] T039 [US3] Apply scope and `ownEntries` in `apps/server/src/expenses/{query,service}.ts` and `routes/{expenses,receipts}.ts`:
  - lists, totals, `yourEntries`, `reimbursements`, `toReimburse`, `advancedByNames`, receipts, and every write;
  - writes to an order out of scope give `404`.
- [X] T040 [US3] Apply scope and `ownEntries` in `apps/server/src/payments/{query,service,plan}.ts` and `routes/{payments,paymentProofs}.ts`: list, summary (`yourEntries` when own entries), detail, proof and writes.
- [X] T041 [US3] Apply `customerVisible` and `supplierVisible` in `apps/server/src/customers/service.ts`, `suppliers/service.ts` and their routes: lists, search, pages, pickers, and `404` out of scope.
- [X] T042 [US3] Web:
  - `apps/web/src/routes/users/ScopeEditor.tsx`: the scope kind, a customer multi-picker, own entries, an end date with the "China time" note; assigned orders listed on the user detail page with add and remove;
  - `apps/web/src/routes/orders/AssigneesPanel.tsx` on the order page (Owner only);
  - "Your entries" totals shown in the Expenses and Payments tabs;
  - the cross-order "To reimburse" label when the scope is partial.
- [X] T043 [US3] Add the US3 translations to the locales.

**Checkpoint**: W10–W13 pass.

---

## Phase 6: User Story 4 — Hidden values and inheritance (Priority: P2)

**Goal**: the six groups omitted everywhere, with D6 inheritance, search, files, saves and the closing rule.

**Independent Test**: for each group, no hidden value or derived figure in any response; searching for a hidden value finds nothing; saves keep hidden values.

### Tests for User Story 4

- [X] T044 [P] [US4] Integration test in `apps/server/tests/integration/hidden.test.ts` (W14–W18), one block per group:
  - the exact keys omitted per resource (order, list item, item, customer, expense, totals, payment, summary, plan stage, financials, reimbursement);
  - the purchase-expense rule, with per-category totals;
  - the customer phone search;
  - receipt and proof `404`;
  - the save merge (price, items and contacts unchanged) and `purchase_hidden`;
  - `closed` refused without `remaining`.

### Implementation for User Story 4

- [X] T045 [US4] Fill `HIDDEN_FIELDS` and the figure omission in `apps/server/src/policy/present.ts` for every resource, following research R4:
  - order: `agreedPrice`, `agreedRate`, `budgetCny`, `itemsTotal`, `priceDifference`, and figures inside `financials`;
  - `orderItem`: price fields, and `supplier` under `supplierIdentity`;
  - customer: phone, email, notes;
  - expense: the purchase rule and `paidTo` supplier;
  - totals, payment, summary, plan stage, reimbursement;
  - the bank name under `bankDetails`.
- [X] T046 [US4] In `packages/shared/src/api/*.ts`, make the sensitive and derived fields optional in the response types (`Order`, `OrderListItem`, `OrderItem`, `OrderFinancials`, `Customer`, `Expense`, `ExpenseTotals`, `Payment`, `PaymentSummary`, `PlanStage`, `Reimbursement`). Fix the compile errors in the server and web that this causes, without changing Owner behaviour.
- [X] T047 [US4] Search and files:
  - drop the phone match in `customers/service.ts` `listCustomers` when `customerContacts` is hidden;
  - in `routes/receipts.ts` and `routes/payments.ts`, serve a receipt only if the expense is visible and not a hidden purchase, and a proof only if `paymentAmounts` is visible.
- [X] T048 [US4] Saves (research R11):
  - relaxed update schemas;
  - merge hidden values in `orders/service.ts` `updateOrder`, keeping items when `sellingPrice` is hidden, and in `customers/service.ts` `updateCustomer`;
  - `403 purchase_hidden` in `expenses/service.ts`;
  - `closed` needs `figureVisible(access,'remaining')` in `setOrderStatus` and `updateOrder`.
- [X] T049 [US4] Web, rendering only what is present in every 001–004 screen:
  - `OrderForm.tsx` omits hidden fields, and item lines are read-only without prices;
  - order list and detail, `FinancialSummary.tsx`, `PaymentsTab.tsx`, the payment detail;
  - the expense list, form (no purchase category or supplier "paid to" when hidden) and detail;
  - customer and supplier pages; the dashboard;
  - the status select without "Closed" when `remaining` is not visible.
- [X] T050 [US4] Add the US4 translations to the locales.

**Checkpoint**: W14–W18 pass.

---

## Phase 7: User Story 5 — The brief's example workers (Priority: P2)

**Goal**: AC6 and the three §4.9 examples, proved by automated tests.

**Independent Test**: the example workers made from the default templates pass their checks, and the sweeps find no leak.

- [X] T051 [P] [US5] Integration test in `apps/server/tests/integration/examples.test.ts` (W20):
  - Logistics: assigned orders, items without prices, no payments, expenses or profit;
  - Site/trip assistant: adds hotel, transport and labour expenses to the assigned order and sees only their own, with no payments;
  - Accountant: views expenses, Bank payments and the dashboard on all orders; every write, Settings and Direct payments are refused.

  Each worker is built from its template exactly as approval does.
- [X] T052 [P] [US5] Sentinel sweeps in `apps/server/tests/integration/sweeps005.test.ts` (SC-001, SC-003):
  - with `seedSentinels`, run `sweepGetRoutes` as the AC6 worker (W19);
  - then as one worker per hidden group, and as a Bank-only worker;
  - then as an assigned-scope worker, using the ids of out-of-scope records.

  Assert that no response text contains a hidden sentinel or an out-of-scope id. Fix every leak in the code it points to.
- [X] T053 [US5] E2E in `apps/web/e2e/permissions-ac6.spec.ts` (AC6 on a phone: two orders, two tabs, no amounts, search limited) and `apps/web/e2e/example-workers.spec.ts` (the site assistant adds an expense and sees "Your entries"; the accountant sees a read-only Payments tab with no Direct section).

**Checkpoint**: W19–W20 pass, and the sweeps are clean.

---

## Phase 8: User Story 6 — Managing worker accounts (Priority: P3)

**Goal**: suspend, reactivate, reset password, force logout, delete, edit, sessions and history.

**Independent Test**: suspending refuses the next request; a reset forces a new password; deletion keeps the worker's name on records and the username is never reused.

- [X] T054 [P] [US6] Integration test in `apps/server/tests/integration/users.manage.test.ts` (W21):
  - force logout of 2 sessions;
  - suspend → `account_suspended` and sessions refused; reactivate;
  - temporary password → sessions revoked, `password_change_required` everywhere except me/password/sign-out, cleared after the change;
  - delete → sign-in generic, records keep `createdBy`, assignments removed, the username refused at registration;
  - PATCH display name and language;
  - a worker's sessions and sign-in history;
  - every action on the Owner `403`;
  - audit entries.
- [X] T055 [US6] Server in `apps/server/src/users/service.ts` and `routes/users.ts`:
  - `PATCH /api/users/:id`, suspend, reactivate;
  - `POST /password` (001 password rules, `must_change_password`, `revokeAllForUser`);
  - `POST /sign-out-everywhere`;
  - `DELETE` (status deleted, `deleted_at`, assignments and customer selection removed, sessions revoked);
  - `GET /sessions` and `GET /sign-in-history` (001 presenters).
- [X] T056 [US6] Web:
  - account actions on `apps/web/src/routes/users/detail.tsx`: suspend/reactivate; a reset dialog with a temporary password and its rules; force logout; delete, whose confirmation suggests suspending; the sessions and history lists;
  - `apps/web/src/routes/change-password.tsx`, the forced change screen the guard redirects to.
- [X] T057 [US6] Add the US6 translations to the locales.

**Checkpoint**: W21 passes.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T058 [P] Integration test in `apps/server/tests/integration/policies005.test.ts`:
  - every registered route has a module policy, or is `owner` (user management, templates, assignees, audit, security settings) or `public`/`authenticated` as before;
  - the new route count;
  - a worker with every module still gets `403` on each `owner` route.

  Update `policies002`, `policies003` and `policies004` for the new semantics (`SENSITIVE_FIELDS` → `HIDDEN_FIELDS`; workers now pass module routes they're granted).
- [X] T059 [P] Integration test in `apps/server/tests/integration/audit005.test.ts` (W22): after a scripted run of registration, approval, rejection, access change, template change, assignment, suspension, reset, force logout and deletion, the audit log holds each action with before/after values, filterable by person and type.
- [X] T060 [P] Performance check in `apps/server/tests/integration/perf005.test.ts` (SC-007): seed 1,000 orders and 300 assignments; an assigned-scope worker's order list and order page stay under 300 ms server time each. Use `EXPLAIN QUERY PLAN` to confirm that the scope subqueries use the new indexes.
- [X] T061 Extend `apps/web/e2e/i18n-rtl.spec.ts` with Register, Users, a worker's page with the permission editor, Templates and the change-password screen (W23), and add them to `apps/web/e2e/no-external-requests.spec.ts`.
- [X] T062 [P] Add a "Workers and permissions (feature 005)" section to `README.md`:
  - registration and approval; templates;
  - the matrix, scope and hidden groups with inheritance; what stays Owner-only;
  - account actions;
  - the Owner's checklist: keep prices out of free text; Direct payments are not in any template.

  Update "Data, security and backups". In `CLAUDE.md`, drop "(planned)" from the 005 Recent Changes line once validated. Do not tick 005 in `ROADMAP.md` until it is merged.
- [X] T063 Run the full validation:
  - lint, typecheck, `npm test` and `npm run test:e2e` on all projects;
  - every quickstart scenario W1–W24;
  - **W24 on real data**: copy `apps/server/data/app.db` with a SQLite backup into the scratchpad, run `npm run db:migrate` with `DATA_DIR` set to it, and check the Owner, the 5 templates, `foreign_key_check` and the pre-migration copy;
  - Arabic screenshots at 360px of Register, Users, the permission editor, a worker's page and the AC6 worker's order page (a throwaway spec, deleted afterwards).

  Fix every failure.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → **Foundational (T002–T016)** → user stories.
- **US1** (P1, MVP) needs Foundational.
- **US2** needs US1 (approved workers exist; the user detail page).
- **US3** needs US2 (the access update route and editor).
- **US4** needs US2. It can run alongside US3, but both edit `present.ts` and the domain services, so do them in sequence when working alone.
- **US5** needs US3 and US4 (its sweeps cover scope and hidden values).
- **US6** needs US1. It can run any time after US1.
- **Polish** comes after all stories.

```text
Setup → Foundational → US1 ─┬─→ US2 ─┬─→ US3 ─┐
                            │        └─→ US4 ─┴─→ US5 ─┐
                            └─→ US6 ────────────────────┴─→ Polish
```

### Shared files (edit sequentially, never in parallel)

- `apps/server/src/policy/present.ts` (T013 → T021 → T029 → T045)
- `apps/server/src/policy/authorize.ts` (T011 → T028)
- `apps/server/src/routes/users.ts` (T021 → T031 → T037 → T055)
- `apps/server/src/users/service.ts` (T021 → T031 → T055)
- `apps/server/src/orders/service.ts` (T037 → T038 → T048)
- `apps/server/src/customers/service.ts` (T037 → T041 → T047 → T048)
- `apps/server/src/expenses/{query,service}.ts` (T039 → T048)
- `apps/server/src/payments/{query,service}.ts` (T030 → T040)
- `apps/web/src/routes/users/detail.tsx` (T032 → T042 → T056)
- `apps/web/src/components/AppShell.tsx` (T024 → T034)
- `apps/web/src/locales/*/common.json` (T016, T025, T035, T043, T050, T057)
- `apps/server/tests/helpers.ts` (T014)

### Parallel opportunities

- **Foundational**: T002–T005 together; T012 alongside T010 and T011; T016 any time.
- **US1**: T017 and T018 together; T023 alongside T021 and T022.
- **US2**: T026 and T027 together; T033 alongside T032.
- **After US2**: US6 alongside US3 or US4.
- **US5**: T051 and T052 together.
- **Polish**: T058–T060 and T062 together.

## Parallel Example: User Story 1

```text
Task: "T017 registration tests in apps/server/tests/integration/register.test.ts"
Task: "T018 registration e2e in apps/web/e2e/workers.spec.ts"
# then, alongside T019–T022:
Task: "T023 web Register screen in apps/web/src/routes/register.tsx"
```

---

## Implementation Strategy

### MVP first (US1 + US2)

1. T001 → T002–T016. **Stop and check** that all 001–004 tests still pass unchanged for the Owner, and that migration005 passes.
2. US1 (T017–T025): workers can join. **Validate W1–W4.**
3. US2 (T026–T035): what each worker may do is enforced. **Validate W5–W9.** This is the first usable release: a worker with module-level permissions.

### Incremental delivery

1. **US3**: scope. **US4**: hidden values. Each is validated by its own scenarios.
2. **US5**: AC6, the examples and the sweeps. Every leak found here is fixed at its source.
3. **US6**: account management.
4. **Polish**, then full validation including W24 on a copy of the real dev database. Commit only when the user asks: 003, 004 and the 005 spec are still uncommitted on this branch. Then merge and tick 005 in `ROADMAP.md`.

### Notes

- The Owner's output must stay identical through every phase. The 001–004 suites are the regression guard.
- Scope is applied in SQL, never by filtering after loading.
- Hidden keys are omitted, never sent as `null`.
- Every new route goes through `route()` with a policy. Every account and permission change writes its audit entry in the same transaction.
