# Research: Customers, Suppliers and Orders (002)

**Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

The stack is fixed by 001 ([../001-platform-foundation/research.md](../001-platform-foundation/research.md)), and no new libraries are added. API details were checked in Context7:
- better-sqlite3 v12 `db.function(name, { deterministic }, fn)`;
- Drizzle SQLite `onConflictDoUpdate` with an increment expression;
- synchronous `db.transaction` with `behavior: 'immediate'`.

---

## R1. Money representation

- **Decision**: store every amount as an **integer number of minor units** (cents) in SQLite `INTEGER` columns. All four currencies (CNY, USD, MAD, EUR) have 2 decimals.
  - The API carries amounts as **decimal strings** such as `"190000.00"`, matching `^\d{1,12}(\.\d{1,2})?$`.
  - The shared package parses and formats them (`parseAmount` → minor units, `formatAmount` → string). There is no float arithmetic anywhere.
  - Line totals are `quantity × unitPriceMinor`, computed as integers. Values stay far below `Number.MAX_SAFE_INTEGER`: the CHECK ceiling is 10¹⁴ minor units.
- **Rationale**:
  - Constitution I requires exact money.
  - Integer cents are exact, sort and sum correctly in SQL, and need no decimal library.
  - Strings in JSON avoid the float rounding that a client could otherwise introduce.
- **Alternatives considered**:
  - A decimal library such as decimal.js: unnecessary while there is no multiplication by fractional rates. It will be revisited in 003 when exchange rates arrive.
  - JSON numbers: an invisible float risk at every hop.

## R2. Order numbers `HJ-YYYY-NNN` (FR-009, SC-003)

- **Decision**:
  - An `order_number_counters(year PRIMARY KEY, last_value)` table.
  - Creating an order runs in a single **`BEGIN IMMEDIATE`** transaction that:
    1. upserts the counter row with `last_value = last_value + 1 … RETURNING last_value`;
    2. builds the number as `${prefix}-${year}-${String(n).padStart(3, '0')}`;
    3. inserts the order, which has a `UNIQUE` index on `number`.
  - The year is the creation instant's calendar year in **Asia/Shanghai**, computed with `Intl.DateTimeFormat` from the injectable clock.
  - The counter is shared across prefixes. Deleted orders keep their number, and counters never go down.
- **Rationale**:
  - SQLite allows one writer at a time. An immediate transaction takes the write lock before reading the counter, so two simultaneous creates (phone + laptop) get consecutive numbers with no retry logic.
  - The unique index is a second guard.
- **Alternatives considered**:
  - `MAX(seq)+1` from `orders`: can reuse the numbers of hard-deleted rows, and races without a lock.
  - Per-prefix counters: changing the prefix back would collide with existing numbers.

## R3. Search across Latin, Arabic and Chinese (FR-014, SC-006)

- **Decision**: register a deterministic SQL function **`hj_norm(text)`** on every connection (in `openDb`). It returns `text` with:
  1. NFKD normalization;
  2. combining marks removed (`\p{M}`), which strips French accents and Arabic harakat;
  3. tatweel (U+0640) removed;
  4. lower-casing with `toLowerCase()`.
  - Queries compare `hj_norm(column) LIKE '%' || :q || '%' ESCAPE '\'`, where `:q` is normalized the same way in JS, with `%`, `_` and `\` escaped.
  - Order search checks the order number, the title, the customer name (via a join), and an `EXISTS` on the order's items (product name, brand/model).
- **Rationale**:
  - SQLite's `LIKE` is case-insensitive only for ASCII.
  - One shared normalization makes "eloise" find "Éloïse", "doosan" find "DOOSAN", and Arabic with or without vowel marks match. Chinese is matched by plain substring, since it has no case.
  - At the target volume (5,000 orders, about 15,000 items), a full scan with a JS function takes tens of milliseconds, well under SC-002's 1 second.
- **Alternatives considered**:
  - FTS5 with the `unicode61` / `trigram` tokenizers: trigram cannot match 1–2 character Chinese queries, and FTS adds triggers and sync complexity.
  - Stored normalized columns: these must be kept in sync when a customer is renamed.

## R4. Editing an order and its items (FR-013)

- **Decision**: `PUT /api/orders/:id` takes the **complete editable order**, including its `items` array. Items with an `id` are updated, items without one are inserted, and missing ones are removed. Item `position` follows the array order.
  - It all runs in one transaction with **one audit entry** (`record.updated`, target `order`). The audit entry carries the changed order fields, plus `items` as compact before/after arrays when the lines changed.
  - Status has its own quick action, `PATCH /api/orders/:id/status`, for the order page header.
- **Rationale**:
  - The phone form edits everything at once, so a full replace keeps client and server logic simple and atomic.
  - One audit entry per save is readable in the audit log.
  - Item lines are parts of the order, not records with their own lifecycle, so removing a line is an order edit; its old values live in the audit entry.
- **Alternatives considered**:
  - Per-item endpoints: more requests on slow links, and partially saved orders.

## R5. Recoverable deletion and "in use" rules (FR-019 – FR-021)

- **Decision**:
  - `customers`, `suppliers`, `orders` and `order_notes` get the 001 `softDeleteColumns()`. Every list and lookup filters with `notDeleted()`.
  - Delete and restore use the 001 `softDelete` / `restore` helpers, which also write the audit entry.
  - Deleting a customer is refused with `409 in_use { count }` while non-deleted orders use it. Deleting a supplier is refused while any order item of a non-deleted order uses it.
  - Restoring an order whose customer is deleted is refused with `409 customer_deleted`; the customer must be restored first.
- **Rationale**: this reuses the platform mechanism from 001 and keeps the data consistent without cascades.

## R6. Duplicate customer warning (FR-002)

- **Decision**:
  - `POST /api/customers` checks `hj_norm(trim(name))` against existing non-deleted customers. On a match, without `confirmDuplicate: true`, it answers `409 customer_name_exists { existingId }`.
  - The client shows the warning and can resend with `confirmDuplicate: true`.
  - The same rule applies when a customer is created inline from the order form.
- **Rationale**: the warning is explicit and testable, and the server stays the source of truth.

## R7. Permissions and sensitive fields (FR-024, D6)

- **Decision**:
  - Routes use the module/action policies `{ module: 'orders' | 'customers' | 'suppliers', action: 'view' | 'create' | 'edit' | 'delete' }`. Restore uses `delete`.
  - The 001 `authorize()` lets only the Owner through until 005.
  - `policy/present.ts` gets presenters for customers, suppliers, orders, items and notes, plus a **declared sensitive-field list**:
    - `order.agreedPrice`, `order.budgetCny`, `order.itemsTotal`, `order.priceDifference`;
    - `item.unitPrice`, `item.lineTotal`, `item.supplier`.
  - Feature 005 only has to supply the per-user hidden set.
- **Rationale**: this keeps the D6 single choke point, and 005 will not need to touch these routes.

## R8. Order statuses, Incoterms, dates

- **Decision**:
  - **Statuses** are stored as stable codes: `draft`, `confirmed`, `purchased`, `in_production`, `inland_transport`, `at_port`, `on_vessel`, `arrived`, `customs_cleared`, `delivered`, `closed`, `cancelled`. Labels come from translations.
  - **Open orders** are those not `delivered`, `closed` or `cancelled`.
  - **Incoterms**: the 11 Incoterms 2020 codes.
  - **Expected delivery date** is a calendar date stored as `YYYY-MM-DD` text. It is a date, not an instant, so it never shifts across time zones.
  - **Creation time** is an epoch-ms instant, as in 001.
- **Rationale**: codes stay stable across languages and over time, and labels translate.

## R9. Pagination

- **Decision**:
  - **Orders**: keyset pagination on `(created_at DESC, id DESC)`, reusing 001's `lib/pagination.ts`.
  - **Customers and suppliers**: sorted by normalized name with **offset** pagination (`cursor` = opaque offset). Lists stay small, and name sorting with keyset would need a stored sort key.
  - Notes are not paginated, since there are few per order.

## R10. Web screens

- **Decision**: new routes:
  - `/orders` (list with filters, search and a "deleted" toggle), `/orders/new`, `/orders/:id` (tabs in a `?tab=` query, so the back button works), `/orders/:id/edit`;
  - `/customers`, `/customers/new`, `/customers/:id`, `/customers/:id/edit`;
  - the same four for `/suppliers`.
- **Shared components**:
  - `CustomerPicker` and `SupplierPicker`: search, plus a "create" dialog that keeps the parent form's state;
  - `ItemsEditor`: stacked cards on phones, with move up/down;
  - `MoneyInput`: decimal keypad, Western digits;
  - `StatusBadge`;
  - `AmountText`: `Intl` currency format with `numberingSystem: 'latn'`.
- The dashboard gets **open orders by status** (FR-026) from `GET /api/orders/summary`.
- **Rationale**: a mobile-first stack of full-screen forms rather than modals for big edits, and a native `<select>`/`<input type="date">` for the best touch input.
