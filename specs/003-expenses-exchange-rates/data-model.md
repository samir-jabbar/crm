# Data Model: Expenses and Exchange-Rate Service (003)

Conventions from 001/002 apply:
- UUIDv7 ids;
- epoch-ms instants;
- `YYYY-MM-DD` calendar dates;
- money as integer minor units;
- recoverable deletion.

New here: **rates are integer micro-units** (`rate × 1,000,000`, "1 unit = X CNY", R2).

---

## expenses

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 |
| order_id | text FK → orders.id | required (FR-002) |
| name | text | trimmed 1–160 |
| category_id | text FK → expense_categories.id | required |
| amount_minor | integer | 1 … 10¹⁴ |
| currency | text | CHECK in CNY/USD/MAD/EUR |
| rate_micro | integer | > 0. Exactly 1,000,000 when currency = CNY |
| rate_source | text | `manual` \| `auto` \| `auto_edited` (CNY: `manual`) |
| cny_minor | integer | computed on save: `(amount_minor × rate_micro + 500,000) ÷ 1,000,000` |
| usd_cny_micro | integer NULL | snapshot from the cache (R4), never sent by clients |
| mad_cny_micro | integer NULL | snapshot from the cache (R4) |
| expense_date | text | `YYYY-MM-DD` |
| paid_to_supplier_id | text NULL FK → suppliers.id | either this… |
| paid_to_name | text NULL | …or this (≤ 120). Both null = not given |
| payment_method | text | `cash` \| `bank` \| `other`, default `cash` |
| advanced_by | text NULL | ≤ 80 |
| reimbursed | integer (bool) | default 0. Only meaningful when `advanced_by` is set |
| status | text | `paid` \| `to_pay`, default `paid` |
| due_date | text NULL | `YYYY-MM-DD` |
| receipt_file_id | text NULL FK → files.id | |
| notes | text NULL | ≤ 2000 |
| created_at, updated_at | integer | |
| created_by, updated_by | text FK → users.id | |
| deleted_at, deleted_by | | recoverable deletion |

**Indexes**: `(order_id, deleted_at, expense_date)`, `(category_id)`, `(paid_to_supplier_id)`, `(advanced_by)`.

**CHECK constraints**:
- currency is one of the 4;
- `rate_micro > 0`;
- `currency <> 'CNY' OR rate_micro = 1000000`;
- `NOT (paid_to_supplier_id IS NOT NULL AND paid_to_name IS NOT NULL)`;
- status, method and rate source are within their lists.

**States**: status `paid` ↔ `to_pay` (free switching); reimbursed `false` ↔ `true`.

## expense_categories

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 (seeded defaults use fixed ids `cat-<key>`) |
| key | text NULL UNIQUE | default category key, e.g. `equipment_purchase`. Null for user-added |
| name | text NULL | custom or renamed label (wins over the translation). Required when `key` is null |
| position | integer | display order |
| hidden | integer (bool) | default 0 |
| created_at, updated_at | integer | |

**Seeded keys** (in order):
- `equipment_purchase`
- `inland_transport_china`
- `port_loading`
- `sea_freight`
- `insurance`
- `customs_clearance_china`
- `customs_duties_morocco`
- `labor`
- `hotel_accommodation`
- `local_travel`
- `commission`
- `bank_fees`
- `other`

There is no deletion (FR-022).

## files

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 = name of the stored file under `DATA_DIR/receipts/` |
| kind | text | `receipt` (more kinds arrive with documents in 007) |
| mime | text | sniffed: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf` |
| size_bytes | integer | ≤ 10,485,760 |
| sha256 | text | |
| created_by | text FK → users.id | |
| created_at | integer | |

A file is *attached* when an expense references it. Unattached files older than 24 h are removed (R7).

## exchange_rates (cache)

| Column | Type | Rules |
|---|---|---|
| provider | text | `currency_api` \| `exchangerate_api_open` |
| rate_date | text | `YYYY-MM-DD` as published by the provider |
| currency | text | `USD` \| `MAD` \| `EUR` |
| rate_micro | integer | "1 unit = X CNY" |
| fetched_at | integer | |
| latest | integer (bool) | true on the rows of the provider's most recent "latest" call (migration 0005). A back-dated lookup never sets it, so it is never mistaken for today's rate |

**PK**: `(provider, rate_date, currency)`.

## rate_settings (single row, id = 1)

| Column | Type | Rules |
|---|---|---|
| id | integer PK | CHECK `id = 1` |
| provider | text | `currency_api` (default) \| `exchangerate_api_open` \| `manual` |
| api_key | text NULL | never returned or audited in full (masked to the last 4 characters) |
| auto_fill | integer (bool) | default 1 |
| last_fetch_at | integer NULL | last successful fetch |
| last_error | text NULL | error code of the last failed fetch |
| last_error_at | integer NULL | |
| updated_at, updated_by | | |

## orders (extended from 002)

| Column | Type | Rules |
|---|---|---|
| agreed_rate_micro | integer NULL | required by the API when `currency ≠ 'CNY'`. Null for CNY orders (meaning 1). Null on orders created before 003 until edited |

## Derived values (never stored, R6)

- `expensesTotal = Σ cny_minor` (non-deleted expenses of the order)
- `unpaid = Σ cny_minor where status = 'to_pay'`
- `agreedPriceCny = convert(agreed_price_minor, agreed_rate_micro ?? 1,000,000)`
- `profit = agreedPriceCny − expensesTotal`. **null** when a non-CNY order has no agreed rate
- `marginPercent = round1(profit / agreedPriceCny × 100)`. Null if the price is 0 or the profit is null
- `budgetUsedPercent = round1(expensesTotal / budget_cny_minor × 100)`. Null without a budget
- Category totals, per-person (`advanced_by`) totals and reimbursements are sums over the same rows.

---

## Validation (shared zod, `packages/shared/src/api/expenses.ts`)

| Field | Rule | Error code |
|---|---|---|
| `name` | trimmed 1–160 | `name_invalid` |
| `categoryId` | an existing category (hidden allowed only if it is unchanged on edit) | `category_invalid` |
| `amount` | decimal string, > 0 | `amount_invalid` |
| `currency` | one of 4 | `currency_invalid` |
| `rate` | `^\d{1,7}(\.\d{1,6})?$`, > 0. Required unless CNY | `rate_invalid` / `rate_required` |
| `rateSource` | `manual` \| `auto` \| `auto_edited` | `invalid_value` |
| `expenseDate`, `dueDate` | valid `YYYY-MM-DD` | `date_invalid` |
| `paidToSupplierId` / `paidToName` | at most one. The supplier must exist and not be deleted | `supplier_invalid` / `text_too_long` |
| `paymentMethod` | `cash` \| `bank` \| `other` | `invalid_value` |
| `advancedBy` | ≤ 80 | `text_too_long` |
| `status` | `paid` \| `to_pay` | `invalid_value` |
| `receiptId` | an existing file uploaded by the same user, not attached to another expense | `receipt_invalid` |
| order `agreedRate` | as `rate`. Required when the order currency ≠ CNY | `rate_invalid` / `rate_required` |
| category `name` | trimmed 1–60 | `name_invalid` |
| upload | ≤ 10 MB, sniffed type in the allowed list | `file_too_large` / `file_type_invalid` |
| rates fetch failure | — | `rates_unavailable` (503) |
