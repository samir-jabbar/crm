---
description: "Task list for 002 Customers, Suppliers and Orders"
---

# Tasks: Customers, Suppliers and Orders

**Input**: Design documents from `specs/002-customers-suppliers-orders/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: Included. The constitution requires business rules to be automated, and the quickstart scenarios (V1–V19) are referenced in test names.

**Builds on 001**: reuse these, don't re-create them:
- `route()` and policies: `apps/server/src/policy/route.ts`, `authorize.ts`;
- presenters: `apps/server/src/policy/present.ts`;
- the audit writer: `recordAudit` in `apps/server/src/audit/record.ts`;
- soft delete: `softDeleteColumns` / `notDeleted` / `softDelete` / `restore` in `apps/server/src/softDelete/index.ts`;
- keyset pagination: `apps/server/src/lib/pagination.ts`;
- validation: `parseWith` / `readJsonBody` in `apps/server/src/lib/validate.ts`;
- the test harness: `createTestContext`, `createOwner`, `createWorker`, `auditActions` in `apps/server/tests/helpers.ts`;
- web: `api()` in `apps/web/src/api/http.ts`, `queryKeys` in `apps/web/src/api/queries.ts`, `Field` / `PasswordField`, and the UI components in `apps/web/src/components/ui/`;
- e2e helpers in `apps/web/e2e/helpers.ts`.

**Library docs**: check Context7 before using any library API you haven't used in this repo yet (CLAUDE.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on unfinished tasks)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup

**Purpose**: confirm the 001 baseline is green on this branch before changing anything.

- [X] T001 Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` from the repo root. Record the counts (expect 68 + 7 unit/integration and 30 e2e passing) in the PR notes. Fix nothing in 001 unless a check fails.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: shared vocabulary, money and search helpers, schema and migrations, presenters, test seeds and web building blocks. Every story needs these.

**⚠️ CRITICAL**: no user-story work starts before this phase is complete.

### Shared package

- [X] T002 [P] Extend `packages/shared/src/enums.ts`:
  - `ORDER_STATUSES` (the 12 codes from data-model.md) and the `OrderStatus` type;
  - `OPEN_ORDER_STATUSES` (all except `delivered`, `closed`, `cancelled`);
  - `INCOTERMS` (EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP) and the `Incoterm` type;
  - `POLICY_MODULES = ['orders','customers','suppliers'] as const`;
  - `ORDER_NUMBER_PREFIX_PATTERN = /^[A-Za-z0-9-]{1,10}$/`, `DEFAULT_ORDER_NUMBER_PREFIX = 'HJ'`;
  - `AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/`;
  - `ORDER_NUMBER_TIME_ZONE = 'Asia/Shanghai'`.
- [X] T003 [P] Add the new error codes to `ERROR_CODES` in `packages/shared/src/errors.ts`: `name_invalid`, `text_too_long`, `email_invalid`, `title_invalid`, `customer_invalid`, `amount_invalid`, `currency_invalid`, `incoterm_invalid`, `status_invalid`, `date_invalid`, `product_name_invalid`, `quantity_invalid`, `year_invalid`, `hs_code_invalid`, `supplier_invalid`, `note_invalid`, `prefix_invalid`, `customer_name_exists`, `in_use`, `customer_deleted`. Add `existingId?: string` and `count?: number` to `ApiErrorBody.error.details`.
- [X] T004 [P] Create `packages/shared/src/money.ts` (R1):
  - `parseAmount(s: string): number` (minor units; throws on a string that doesn't match `AMOUNT_PATTERN`);
  - `formatAmount(minor: number): string` (always 2 decimals, e.g. `"182500.00"`);
  - `lineTotalMinor(quantity, unitMinor)`, `sumMinor(values)`.
  There is no float math: parsing splits on `.` and pads the decimals. Export it from `packages/shared/src/index.ts`.
- [X] T005 [P] Create `packages/shared/src/search.ts` with `normalizeForSearch(s)`: NFKD, remove `\p{M}`, remove U+0640 (tatweel), `toLowerCase()`, trim. Also export `likePattern(q)`: normalized, `%`/`_`/`\` escaped with `\`, wrapped in `%…%`. Export both from `index.ts`.
- [X] T006 Create the zod request schemas and response types in `packages/shared/src/api/customers.ts`, `packages/shared/src/api/suppliers.ts` and `packages/shared/src/api/orders.ts`, following contracts/api.md and the validation table in data-model.md:
  - customer/supplier create (with `confirmDuplicate`) and patch;
  - order create/update with `items[]`, including the optional item `id`;
  - status patch, note create, duplicate (`titleSuffix`);
  - list query schemas (`q`, `status` as a comma list, `customerId`, `from`, `to`, `deleted`, `cursor`, `limit`);
  - the response types `Customer`, `Supplier`, `OrderListItem`, `Order`, `OrderItem`, `OrderNote`, `OrdersSummary`.
  Every issue message must be an error code. Export everything from `index.ts`, and extend `api/settings.ts` with `orderNumberPrefix` (request) and `orderNumberPrefix` / `nextOrderNumber` (response).

### Server schema and infrastructure

- [X] T007 Define the Drizzle schemas in `apps/server/src/db/schema/`, exactly per data-model.md, with CHECK constraints (raw SQL column names, as in 001) and indexes:
  - `customers.ts`;
  - `suppliers.ts`;
  - `orders.ts`;
  - `orderItems.ts`;
  - `orderNotes.ts`;
  - `orderNumberCounters.ts`.
  Use `...softDeleteColumns()` from `apps/server/src/softDelete/index.ts` on customers, suppliers, orders and order notes. Add `orderNumberPrefix` (text, not null, default `'HJ'`) to `apps/server/src/db/schema/companySettings.ts`, and export everything from `schema/index.ts`.
- [X] T008 Run `npm run db:generate -w @hanjing/server -- --name customers_suppliers_orders` and review the generated SQL in `apps/server/drizzle/`. If drizzle-kit recreates `company_settings` to add the column, check that the existing row and the 001 triggers on other tables are preserved, and that the migration applies cleanly to a database created by 001 (`createTestContext` runs every migration).
- [X] T009 Register the SQL function `hj_norm` in `openDb()` in `apps/server/src/db/client.ts`: `sqlite.function('hj_norm', { deterministic: true }, (v) => v == null ? null : normalizeForSearch(String(v)))`, importing from `@hanjing/shared`. Add a unit test in `apps/server/tests/unit/search.test.ts` that SQL `hj_norm` and `normalizeForSearch` agree on a corpus:
  - `"Éloïse"`, `"DOOSAN DX225"`;
  - `"شَرِكَة"` / `"شركة"`;
  - `"汉景机械"`;
  - `"ـالدار"` (with tatweel);
  - and that `likePattern('50%_x')` escapes.
- [X] T010 [P] Add unit tests for money in `apps/server/tests/unit/money.test.ts`:
  - parse `"190000"`, `"190000.5"` and `"0.01"`;
  - reject `"1.234"`, `"-5"`, `"1e5"` and `"abc"`;
  - format back to 2 decimals;
  - line totals and sums of large values stay exact (e.g. 99,999 × `"999999999.99"`).
- [X] T011 Extend `apps/server/src/policy/present.ts` with presenters:
  - `presentCustomer` (with `orderCount`), `presentSupplier` (with `orderCount`);
  - `presentOrderListItem`, `presentOrder` (items with `lineTotal`, plus `itemsTotal` and `priceDifference` computed with `@hanjing/shared` money helpers), `presentOrderNote`.
  Add an exported `SENSITIVE_FIELDS` map (R7): `order: ['agreedPrice','budgetCny','itemsTotal','priceDifference']` and `orderItem: ['unitPrice','lineTotal','supplier']`. Run every body through `applyFieldRules` (hidden set is empty for the Owner).
- [X] T012 [P] Add seed helpers to `apps/server/tests/helpers.ts`:
  - `seedCustomer(client, overrides)`, `seedSupplier(client, overrides)`, `seedOrder(client, overrides)`. Each posts through the API and returns the body.
  - Default order: title `"2 Doosan excavators"`, USD `"190000"`, two items (2 × `"85000"`, 1 × `"12500"`).

### Web building blocks

- [X] T013 [P] Create `apps/web/src/components/AmountText.tsx`: `Intl.NumberFormat(localeFor(lng), { style: 'currency', currency, numberingSystem: 'latn' })` from a decimal string, with a `signed` prop for differences (`+7,500.00`). Create `apps/web/src/components/MoneyInput.tsx`: `inputMode="decimal"`, `dir="ltr"`, accepts `,` or `.` as the decimal separator and normalizes to `.`, validates with `AMOUNT_PATTERN`.
- [X] T014 [P] Create `apps/web/src/components/StatusBadge.tsx` (translated status with a tone per group: draft = neutral, in progress = primary, delivered/closed = success, cancelled = danger) and `apps/web/src/components/ComingSoon.tsx` (a translated "Available with <feature>" card).
- [X] T015 [P] Create the query hooks in `apps/web/src/api/orders.ts`, `apps/web/src/api/customers.ts` and `apps/web/src/api/suppliers.ts`:
  - list (infinite), get, create, update/patch, delete, restore;
  - order status, duplicate, notes, summary;
  - related orders.
  Extend `queryKeys` in `apps/web/src/api/queries.ts`, and invalidate the affected lists, details and the summary on every mutation.
- [X] T016 Add the navigation and base translations:
  - "Orders", "Customers" and "Suppliers" links in `apps/web/src/components/AppShell.tsx`;
  - the route skeletons from contracts/api.md (client routes) in `apps/web/src/router.tsx`, with placeholder pages under `apps/web/src/routes/orders/`, `customers/` and `suppliers/`;
  - in all three locale files `apps/web/src/locales/{en,fr,ar}/common.json`: `nav.orders/customers/suppliers`, `orderStatus.<code>` (12), `incoterm.<code>` (11 short descriptions), `comingSoon.*`, and every new `errors.<code>` from T003.
  The i18n parity test must keep passing.

**Checkpoint**: migrations apply over a 001 database, `hj_norm` works in SQL, money and search unit tests pass, the new nav links open placeholder pages, and translation parity passes.

---

## Phase 3: User Story 1 — Create an order from the phone (Priority: P1) 🎯 MVP

**Goal**: create an order with a customer (picked or created inline), items with suppliers (picked or created inline), a typed agreed price, an automatic `HJ-YYYY-NNN` number, and its overview page.

**Independent Test**: on a 360px phone, create an order with a new customer and two items; it gets the next number and opens on its page (V1–V4).

### Tests for User Story 1

- [X] T017 [P] [US1] Unit tests for numbering in `apps/server/tests/unit/numbering.test.ts`:
  - `chinaYear()` returns the next year for `2026-12-31T16:30Z` (00:30 in Shanghai) and the same year for `2026-12-31T15:59Z`;
  - `formatOrderNumber('HJ', 2026, 7)` is `HJ-2026-007`, and `1000` gives `HJ-2026-1000`.
- [X] T018 [P] [US1] Integration tests for creating orders (V1–V4) in `apps/server/tests/integration/orders.create.test.ts`:
  - the first order is `HJ-2026-001` and the next `-002`;
  - items total `182500.00` and difference `7500.00`;
  - `400` field codes for a missing title, customer, item product name and quantity, and a bad amount (`"1.234"`), with keys like `items.0.quantity`;
  - an unknown `customerId` or `supplierId` gives `customer_invalid` / `supplier_invalid`;
  - 50 orders created with `Promise.all` all get unique consecutive numbers;
  - after `clock.set` to 1 January 00:05 China time, the counter restarts at `001`;
  - one audit `record.created` per order.
- [X] T019 [P] [US1] Integration tests for inline creates in `apps/server/tests/integration/customers.create.test.ts`:
  - create a customer with an Arabic name, stored exactly;
  - the same name again (different case and spacing) → `409 customer_name_exists { existingId }`; with `confirmDuplicate: true` → `201`;
  - create a supplier with `country` defaulting to `China`;
  - each create is audited.
- [X] T020 [P] [US1] Playwright e2e test (V1, SC-001) in `apps/web/e2e/orders.spec.ts`. On the mobile project:
  1. open `/orders/new`, type a title;
  2. in the customer picker, type a new name and choose "Create …"; the dialog saves;
  3. add two items (the second with a supplier created inline);
  4. type 190000 USD, choose CIF, port Casablanca, save;
  5. assert the URL `/orders/<id>`, a header number matching `/^HJ-\d{4}-\d{3}$/`, item total `$182,500.00` and difference `+$7,500.00`;
  6. assert the whole flow took under 120 s.

### Implementation for User Story 1

- [X] T021 [US1] Implement `apps/server/src/orders/numbering.ts`:
  - `chinaYear(ms)` with `Intl.DateTimeFormat('en-US', { timeZone: ORDER_NUMBER_TIME_ZONE, year: 'numeric' })`;
  - `formatOrderNumber(prefix, year, seq)`;
  - `nextOrderNumber(tx, clock, prefix)`, which upserts `order_number_counters` (`last_value = last_value + 1`, `RETURNING last_value`) and returns `{ number, year, seq }`.
- [X] T022 [US1] Implement creation in `apps/server/src/customers/service.ts` and `apps/server/src/suppliers/service.ts`:
  - `createCustomer(tx, clock, input, actor, ctx)` with the duplicate-name check via `hj_norm(name) = ?` among non-deleted customers (R6);
  - `createSupplier(...)`;
  - `getCustomer` / `getSupplier` (non-deleted).
  Each create writes the audit entry `record.created`.
- [X] T023 [US1] Implement `createOrder` and `getOrder` in `apps/server/src/orders/service.ts`.
  - **createOrder(deps, input, actor, ctx)** runs in `db.transaction(fn, { behavior: 'immediate' })`:
    1. check that the customer and every `supplierId` exist and are not deleted;
    2. call `nextOrderNumber` with the settings prefix;
    3. insert the order (`status` default `draft`, amounts via `parseAmount`) and its items (`position` = index);
    4. audit `record.created` with `{ number, title, customerId, agreedPrice, currency, itemCount }`.
  - **getOrder(db, id, { includeDeleted })** returns the order, items (ordered by position, with suppliers) and the customer.
- [X] T024 [US1] Add the routes:
  - `apps/server/src/routes/customers.ts`: `POST /api/customers` (customers:create), `GET /api/customers/:id` (customers:view);
  - `apps/server/src/routes/suppliers.ts`: `POST /api/suppliers`, `GET /api/suppliers/:id`;
  - `apps/server/src/routes/orders.ts`: `POST /api/orders` (orders:create), `GET /api/orders/:id` (orders:view).
  Also add a minimal `GET /api/customers?q=` and `GET /api/suppliers?q=` (name search, limit 20) for the pickers; US3 completes them. Register all in `apps/server/src/routes/index.ts`, using `route()` with `{ module, action }` policies only.
- [X] T025 [P] [US1] Create `apps/web/src/components/CustomerPicker.tsx`:
  - a search-as-you-type combobox over `GET /api/customers?q=` (debounced 250 ms), with a "Create «text»" option;
  - the option opens a Dialog with name, city, country (default Morocco) and phone;
  - on `409 customer_name_exists` it shows the translated warning and a "Create anyway" button that resends with `confirmDuplicate`;
  - on save it selects the new customer and calls `onSelect(customer)`.
  The parent form's state must never reset.
- [X] T026 [P] [US1] Create `apps/web/src/components/SupplierPicker.tsx`, the same pattern as the customer picker, with no duplicate check and country default China.
- [X] T027 [P] [US1] Create `apps/web/src/components/ItemsEditor.tsx`, one stacked card per item:
  - product name, brand/model, year (number), quantity (numeric, min 1), unit price (`MoneyInput`), HS code, specs (textarea), supplier (`SupplierPicker`);
  - a line total via `AmountText`;
  - "Add item", "Remove" and "Move up/down" buttons with 44px targets;
  - errors shown per field from `items.<index>.<field>` codes.
- [X] T028 [US1] Create the shared order form `apps/web/src/routes/orders/OrderForm.tsx`:
  - title;
  - `CustomerPicker` (pre-fills the delivery city from the customer unless the user already typed one);
  - delivery city, agreed price (`MoneyInput`) and currency (select, default USD);
  - Incoterm (select with translated descriptions), destination port (input with a `<datalist>` of the suggested ports), expected delivery date (`type="date"`), budget in CNY (`MoneyInput`);
  - `ItemsEditor`;
  - a live box with the item total and the difference (agreed − items) in the order currency, information only.
  Validate client-side with the shared schemas; map server errors to fields; never clear inputs on error. Then create the page `apps/web/src/routes/orders/new.tsx`, which posts and navigates to `/orders/:id`.
- [X] T029 [US1] Create the order page `apps/web/src/routes/orders/detail.tsx`. In this story:
  - a header with number, title, customer, `StatusBadge` and the agreed price;
  - a summary area with the item total, difference and budget;
  - the Overview content: details plus a read-only item list with line totals.
  US2 adds the tabs and actions.
- [X] T030 [US1] Add every US1 string in all three locale files `apps/web/src/locales/{en,fr,ar}/common.json`: the order form labels and hints, picker texts, item editor, the duplicate warning, and the summary labels (`orders.itemsTotal`, `orders.difference`, …). Use real French and Arabic.

**Checkpoint**: V1–V4 pass. The Owner can create orders with inline customers and suppliers on a phone.

---

## Phase 4: User Story 2 — Find any order and work from its page (Priority: P2)

**Goal**: an order list with filters and cross-script search, an order page with all tabs, edit, status change, and dashboard counts.

**Independent Test**: with 30 seeded orders, find one by a customer-name fragment, by item model and by status filter; open it, change its status, edit one item (V5–V8).

### Tests for User Story 2

- [X] T031 [P] [US2] Integration tests for search and filters (V5, V6) in `apps/server/tests/integration/orders.search.test.ts`:
  - `q=doosan` matches title and item model, regardless of case;
  - `q=eloise` finds the customer "Éloïse Diallo";
  - `q=汉景` and Arabic with or without harakat match;
  - `q=50%` is treated literally;
  - `status=confirmed,on_vessel` combined with `customerId`, and `from`/`to` bounds;
  - keyset pagination (limit 2), newest first;
  - deleted orders are excluded.
- [X] T032 [P] [US2] Integration tests for edit and status (V7) in `apps/server/tests/integration/orders.update.test.ts`:
  - `PATCH /status` updates and audits `{ status }` before/after;
  - `PUT` with one item changed, one removed and one added (no `id`) produces the new positions, and one audit entry whose before/after includes `items`;
  - the number is unchanged;
  - an invalid status gives `status_invalid`;
  - `GET /api/orders/summary` counts only open, non-deleted orders per status.
- [X] T033 [P] [US2] Playwright e2e test (V5, V7, V8) in `apps/web/e2e/orders-list.spec.ts`. Seed 3 orders via the API, then:
  - search "doosan" → the expected rows;
  - filter by status → a subset; clear;
  - open an order, change its status from the header → the badge updates;
  - open every tab at 360px → no sideways scroll, and "coming soon" text on unbuilt tabs;
  - edit an item's quantity → the totals update.

### Implementation for User Story 2

- [X] T034 [US2] Implement `apps/server/src/orders/query.ts`:
  - `listOrders(db, query)`: join the customer; filters for status list, `customerId` and created-at bounds; `q` via `hj_norm(...) LIKE ? ESCAPE '\'` on number, title and customer name, plus `EXISTS` over items (product name, brand/model); `notDeleted` or deleted-only; keyset `(created_at DESC, id DESC)` via `lib/pagination.ts`.
  - `ordersSummary(db)`: open statuses only.
- [X] T035 [US2] Implement `updateOrder` (full replace with an items diff by `id`; one audit entry with the changed fields plus `items` before/after when changed; number untouched) and `setOrderStatus` in `apps/server/src/orders/service.ts`.
- [X] T036 [US2] Add these routes to `apps/server/src/routes/orders.ts`. Register `summary` **before** `:id`.
  - `GET /api/orders` (orders:view);
  - `GET /api/orders/summary` (orders:view);
  - `PUT /api/orders/:id` (orders:edit);
  - `PATCH /api/orders/:id/status` (orders:edit).
- [X] T037 [US2] Create the list page `apps/web/src/routes/orders/list.tsx`:
  - a search box (debounced) and a filters panel: status multi-select as chips, `CustomerPicker` in filter mode, and from/to dates as local-day bounds sent as instants (like the 001 audit page);
  - result cards with number, title, customer, `StatusBadge`, `AmountText` and date;
  - "Load more" (infinite query), a "New order" button, and an empty state.
- [X] T038 [US2] Complete `apps/web/src/routes/orders/detail.tsx`:
  - tabs Overview / Expenses / Payments / Shipment / Documents / Invoices / Notes / Reminders, synced to `?tab=` and horizontally scrollable *inside* the tab bar only;
  - `ComingSoon` for Expenses (003), Payments (004), Invoices (006), Shipment / Documents (007) and Reminders (008);
  - a status select in the header, using `PATCH /status`;
  - an "Edit" action → `/orders/:id/edit`.
  Then create `apps/web/src/routes/orders/edit.tsx`, which reuses `OrderForm` prefilled and sends `PUT`.
- [X] T039 [US2] Extend the dashboard in `apps/web/src/routes/dashboard.tsx` (FR-026):
  - "Orders", "Customers" and "Suppliers" cards;
  - an "Open orders" block from `GET /api/orders/summary`, showing a count per status that links to `/orders?status=<code>`.
  The list page must read `status` from the URL.
- [X] T040 [US2] Add every US2 string (list, filters, tabs, coming-soon texts, dashboard) to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: V5–V8 pass.

---

## Phase 5: User Story 3 — Address book (Priority: P3)

**Goal**: full customer and supplier management with searchable lists, and pages showing related orders.

**Independent Test**: create a customer and a supplier with mixed-script details, link the supplier to an order item, and open both pages to see the order (V9, V10).

### Tests for User Story 3

- [X] T041 [P] [US3] Integration tests in `apps/server/tests/integration/addressBook.test.ts`:
  - customers list sorted by name, with `q` over name, company, city and phone (normalized) and offset-cursor pagination;
  - `PATCH` updates and audits only the changed fields;
  - `GET /api/customers/:id/orders` lists newest first, non-deleted only;
  - suppliers: the same list and patch behaviour, and `GET /api/suppliers/:id/orders` lists the orders having an item from that supplier;
  - `orderCount` values are correct.
- [X] T042 [P] [US3] Playwright e2e test (V9, V10) in `apps/web/e2e/customers-suppliers.spec.ts`:
  - create the customer "شركة الدار البيضاء للمعدات", then try to create it again → warning → "Create anyway";
  - create a supplier with a WeChat ID;
  - open the customer page → its orders list;
  - search the customer list by an Arabic fragment.

### Implementation for User Story 3

- [X] T043 [US3] Complete `apps/server/src/customers/service.ts` and `apps/server/src/suppliers/service.ts`:
  - `listCustomers` / `listSuppliers` (normalized `q`, sort by `hj_norm(name)`, offset cursor, `orderCount` via a subquery over non-deleted orders);
  - `updateCustomer` / `updateSupplier` (audit the changed fields);
  - `customerOrders` / `supplierOrders` (supplier: `EXISTS` over items).
- [X] T044 [US3] Complete the routes:
  - in `apps/server/src/routes/customers.ts`: `GET /api/customers` (full list contract), `PATCH /api/customers/:id`, `GET /api/customers/:id/orders` (customers:view; also check orders:view);
  - in `apps/server/src/routes/suppliers.ts`: the same for suppliers.
- [X] T045 [P] [US3] Create the customer pages (implemented once in `apps/web/src/routes/addressBook/shared.tsx` for both kinds; the route files are thin wrappers):
  - `apps/web/src/routes/customers/list.tsx`: search, cards with name, company, city, phone (as a `tel:` link) and order count, "New customer";
  - `apps/web/src/routes/customers/form.tsx`: new and edit, with the same duplicate-warning flow;
  - `apps/web/src/routes/customers/detail.tsx`: details, an orders list, "Edit", and "New order for this customer", which opens `/orders/new?customerId=`.
- [X] T046 [P] [US3] Create the supplier pages:
  - `apps/web/src/routes/suppliers/list.tsx`;
  - `apps/web/src/routes/suppliers/form.tsx`;
  - `apps/web/src/routes/suppliers/detail.tsx`: details including WeChat ID and contact person, and the related orders.
- [X] T047 [US3] Make `apps/web/src/routes/orders/new.tsx` honour `?customerId=` (preselect it). Add every US3 string to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: V9–V10 pass.

---

## Phase 6: User Story 4 — Duplicate an order and keep notes (Priority: P4)

**Goal**: one-tap duplication and timestamped notes on the order's Notes tab.

**Independent Test**: duplicate an order with 3 items and check the copy; add two notes and delete one (V11, V12).

### Tests for User Story 4

- [X] T048 [P] [US4] Integration tests in `apps/server/tests/integration/orders.duplicate-notes.test.ts`:
  - the duplicate gets a new number and status `draft`, the title plus the suffix, and the same customer, delivery city, price, currency, Incoterm, port, budget and items (new item ids, same suppliers);
  - it has no notes and no `expectedDeliveryDate`;
  - audit `record.created` with `duplicatedFrom`;
  - notes: create (author = the Owner), list newest first, delete → hidden plus audit `record.deleted`;
  - an empty or over-long body gives `note_invalid`;
  - a note on a deleted order gives `404`.
- [X] T049 [P] [US4] Playwright e2e test (V11, V12) in `apps/web/e2e/orders.spec.ts` (append):
  - duplicate from the order page → it lands on the new order with the next number and "(copy)" in the title;
  - the Notes tab: add two notes, they appear newest first with time; delete one with confirmation.

### Implementation for User Story 4

- [X] T050 [US4] Implement `duplicateOrder(deps, id, titleSuffix, actor, ctx)` in `apps/server/src/orders/service.ts`. It runs in an immediate transaction: a new number, a copy of the fields and items per FR-016, then the audit entry. Then implement `apps/server/src/orders/notes.ts`:
  - `listNotes`;
  - `addNote` (audit `record.created`, target `order_note`);
  - `deleteNote` (via `softDelete`).
- [X] T051 [US4] Add these routes to `apps/server/src/routes/orders.ts`:
  - `POST /api/orders/:id/duplicate` (orders:create);
  - `GET /api/orders/:id/notes` (orders:view);
  - `POST /api/orders/:id/notes` (orders:edit);
  - `DELETE /api/orders/:id/notes/:noteId` (orders:edit).
- [X] T052 [US4] In `apps/web/src/routes/orders/detail.tsx`:
  - add a "Duplicate" action; it sends the translated `titleSuffix` and navigates to the copy;
  - build the Notes tab in `apps/web/src/routes/orders/NotesTab.tsx`: a textarea with "Add note", a list showing author, `formatDateTime` and the body (`dir="auto"`), and delete with a confirm Dialog.
  Add the US4 strings to the locale files.

**Checkpoint**: V11–V12 pass.

---

## Phase 7: User Story 5 — Delete and restore safely (Priority: P5)

**Goal**: recoverable deletion for orders, customers and suppliers, with "in use" protection and restore views.

**Independent Test**: delete an order, see it disappear from the list and search, restore it with the same number (V13). Try to delete a customer with orders (V14).

### Tests for User Story 5

- [X] T053 [P] [US5] Integration tests in `apps/server/tests/integration/deleteRestore.test.ts`:
  - deleting an order hides it from the list, search, `customerOrders` and the summary; `GET` gives `404`; `?deleted=true` lists it; restore brings it back identical;
  - a new order never reuses its number;
  - deleting a customer with orders → `409 in_use { count: N }`; the same for a supplier used by items;
  - deleting a customer without orders works and it can be restored;
  - restoring an order whose customer is deleted → `409 customer_deleted`;
  - every delete and restore is audited;
  - deleted customers and suppliers disappear from the picker search.
- [X] T054 [P] [US5] Playwright e2e test (V13, V14) in `apps/web/e2e/orders.spec.ts` (append):
  - delete an order (confirm) → gone from the list; the "Deleted" toggle shows it; restore → back;
  - deleting a customer with orders shows the translated "used by N orders" message.

### Implementation for User Story 5

- [X] T055 [US5] Implement delete and restore with the 001 helpers:
  - `deleteOrder` / `restoreOrder` (the restore checks that the customer is not deleted) in `apps/server/src/orders/service.ts`;
  - `deleteCustomer` / `restoreCustomer` with the in-use count in `apps/server/src/customers/service.ts`;
  - `deleteSupplier` / `restoreSupplier` with the in-use count over items of non-deleted orders in `apps/server/src/suppliers/service.ts`.
  Make the list functions accept `deleted: true`.
- [X] T056 [US5] Add the `DELETE /api/<entity>/:id` and `POST /api/<entity>/:id/restore` routes (`<module>:delete`), and support `?deleted=true` on the lists and `GET /api/orders/:id?deleted=true`, in:
  - `apps/server/src/routes/orders.ts`;
  - `apps/server/src/routes/customers.ts`;
  - `apps/server/src/routes/suppliers.ts`.
- [X] T057 [US5] Web:
  - "Delete" (with a confirm Dialog) on the order, customer and supplier detail pages;
  - a "Show deleted" toggle on the three lists, where deleted cards show "Restore";
  - a translated `in_use` message with the count, and a `customer_deleted` message with a link to the customer.
  Files: `apps/web/src/routes/orders/{list,detail}.tsx`, `apps/web/src/routes/customers/{list,detail}.tsx` and `apps/web/src/routes/suppliers/{list,detail}.tsx`. Add the US5 strings to the locale files.

**Checkpoint**: V13–V14 pass.

---

## Phase 8: User Story 6 — Order-number prefix (Priority: P6)

**Goal**: an editable prefix in Settings, with a preview of the next number.

**Independent Test**: change the prefix to `HJM`; the next order uses it and continues the counter; older numbers are unchanged (V15).

### Tests for User Story 6

- [X] T058 [P] [US6] Integration tests in `apps/server/tests/integration/settings.prefix.test.ts`:
  - `GET /api/settings` shows `orderNumberPrefix: 'HJ'` and `nextOrderNumber` (`HJ-2026-001`, then `-003` after two orders);
  - `PATCH { orderNumberPrefix: 'HJM' }` → the next order is `HJM-2026-003`, and old orders keep `HJ-…`;
  - `'H J'` or `'TOOLONGPREFIX1'` → `prefix_invalid`;
  - the change is audited in `settings.updated`.

### Implementation for User Story 6

- [X] T059 [US6] Extend `apps/server/src/settings/service.ts` (patch with `orderNumberPrefix` and audit it; `nextOrderNumberPreview(db, clock)` from the counter + 1 without writing) and `presentSettings` in `apps/server/src/policy/present.ts` (add `orderNumberPrefix` and `nextOrderNumber`). `PATCH /api/settings` accepts the new field via the extended shared schema.
- [X] T060 [US6] Add an "Order numbers" section to `apps/web/src/routes/settings.tsx`: a prefix input (uppercase hint, `dir="ltr"`) and a live preview of `nextOrderNumber` that updates with the typed prefix client-side. Add the US6 strings to the locale files.

**Checkpoint**: V15 passes. All six stories work.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T061 [P] Integration test for permissions (V17, FR-024) in `apps/server/tests/integration/policies002.test.ts`:
  - every route added in 002 is registered with a `{ module, action }` policy (assert via `registeredRoutes()`: the policy string matches `/^(orders|customers|suppliers):(view|create|edit|delete)$/`);
  - a worker (`createWorker`) gets `403 forbidden` on each;
  - signed out, each gives `401` (the 001 deny-by-default test also covers this automatically);
  - `SENSITIVE_FIELDS` lists exactly the fields in research R7.
- [X] T062 [P] Integration test for search performance (V18, SC-002) in `apps/server/tests/integration/orders.performance.test.ts`: seed 5,000 orders with 3 items each directly through the service in one transaction; assert that a `q` search, a status filter and the first page all respond in under 1000 ms.
- [X] T063 [P] Add `/orders`, `/orders/new`, an order page (every tab), `/customers`, `/customers/<id>`, `/suppliers` and `/settings` to `SIGNED_IN_SCREENS` in `apps/web/e2e/i18n-rtl.spec.ts` (V19). Seed a customer and an order first via the API, so the detail pages render.
- [X] T064 [P] Add a "Customers, suppliers and orders" section to `README.md` (order numbers and prefix, the typed agreed price, how deletion and restore work), and update `ROADMAP.md` by ticking 001 if it was merged meanwhile. Do not tick 002 until it is merged.
- [X] T065 Run the full validation: lint, typecheck, `npm test`, `npm run test:e2e` (all projects), and the quickstart scenarios V1–V19. Take Arabic screenshots of the order form and the order page at 360px (throwaway spec, deleted afterwards) and check the RTL layout visually. Fix every failure.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → **Foundational (T002–T016)** → user stories.
- **US1** (P1, MVP) needs Foundational.
- **US2** needs US1: it lists and edits the orders US1 creates, and extends `detail.tsx` and `orders.ts`.
- **US3** needs US1 (customer/supplier creation, pickers). It is independent of US2.
- **US4** needs US1 (order page) and is easiest after US2 (tabs exist). If done before US2, put the Notes UI on the US1 overview.
- **US5** needs US1–US3: it adds actions to their pages.
- **US6** needs US1 (numbering). It is independent of US2–US5.
- **Polish** comes after all stories.

```text
Setup → Foundational → US1 ─┬─→ US2 ─→ US4 ─┐
                            ├─→ US3 ────────┼─→ US5 ─→ Polish
                            └─→ US6 ────────┘
```

### Shared files (edit sequentially, never in parallel)

- `apps/server/src/routes/orders.ts` (T024 → T036 → T051 → T056)
- `apps/server/src/orders/service.ts` (T023 → T035 → T050 → T055)
- `apps/web/src/routes/orders/detail.tsx` (T029 → T038 → T052 → T057)
- `apps/web/src/locales/*/common.json` (T016, T030, T040, T047, T052, T057, T060)
- `apps/server/src/policy/present.ts` (T011 → T059)

### Parallel opportunities

- Foundational: T002–T005 together; T010, T012, T013, T014 and T015 alongside the schema work (T007–T009).
- US1: the tests T017–T020 together; T025, T026 and T027 (pickers and items editor) together.
- After US1: US3 and US6 can run alongside US2.

## Parallel Example: User Story 1

```text
Task: "T017 numbering unit tests in apps/server/tests/unit/numbering.test.ts"
Task: "T018 order creation integration tests in apps/server/tests/integration/orders.create.test.ts"
Task: "T019 inline create tests in apps/server/tests/integration/customers.create.test.ts"
Task: "T020 create-order e2e in apps/web/e2e/orders.spec.ts"
# then, alongside the server work T021–T024:
Task: "T025 CustomerPicker", "T026 SupplierPicker", "T027 ItemsEditor"
```

---

## Implementation Strategy

### MVP first (US1)

1. T001 → T002–T016.
2. US1 (T017–T030). **Stop and validate** V1–V4: orders can be created from the phone. This is already useful for the Owner.

### Incremental delivery

1. US2: find and manage orders, which makes it usable day to day.
2. US3: the full address book. US6: the prefix (small, can come anytime).
3. US4: duplicate and notes. US5: delete and restore.
4. Polish and full validation. Commit 001 + 002 (as agreed with the user, after this feature), merge, tick 001 and 002 in `ROADMAP.md`.

### Notes

- Money never goes through floats: parse with `parseAmount`, compute in integers, format with `formatAmount` / `AmountText`.
- Every new route goes through `route()` with a module/action policy, or the server refuses to start.
- Every change to a business record writes its audit entry in the same transaction.
