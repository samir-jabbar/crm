# Data Model: Customers, Suppliers and Orders (002)

Conventions from 001 apply:
- UUIDv7 text ids;
- epoch-ms timestamps;
- UTF-8 text stored exactly as entered;
- recoverable deletion through `deleted_at` / `deleted_by`;
- money as **integer minor units** (R1).

New tables are created by one generated migration. A custom migration adds `company_settings.order_number_prefix`.

---

## customers

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 |
| name | text | required, trimmed, 1–120 chars |
| company | text NULL | ≤ 120 |
| city | text NULL | ≤ 80 |
| country | text NULL | ≤ 80 (default shown in the UI: "Morocco") |
| phone | text NULL | ≤ 40, free format (`+212 6…`) |
| email | text NULL | ≤ 120, light format check |
| notes | text NULL | ≤ 2000 |
| created_at, updated_at | integer | |
| created_by | text FK → users.id | |
| deleted_at, deleted_by | integer NULL, text NULL FK | recoverable deletion |

**Index**: `(deleted_at)`.

**Rules**:
- A name matching an existing non-deleted customer (`hj_norm(trim(name))`) needs `confirmDuplicate` (FR-002).
- Delete is refused while non-deleted orders reference the customer (FR-021).

## suppliers

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 |
| name | text | required, 1–120 |
| company | text NULL | ≤ 120 |
| contact_person | text NULL | ≤ 80 |
| phone | text NULL | ≤ 40 |
| wechat | text NULL | ≤ 60 |
| email | text NULL | ≤ 120 |
| city | text NULL | ≤ 80 |
| country | text NULL | ≤ 80, default "China" |
| notes | text NULL | ≤ 2000 |
| created_at, updated_at, created_by, deleted_at, deleted_by | | as for customers |

**Index**: `(deleted_at)`.

**Rule**: delete is refused while any item of a non-deleted order references the supplier.

## orders

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 |
| number | text UNIQUE | `<prefix>-<year>-<seq>`, never changes |
| number_year | integer | China-time year at creation |
| number_seq | integer | counter value |
| title | text | required, 1–160 |
| customer_id | text FK → customers.id | required |
| delivery_city | text NULL | ≤ 80, pre-filled from the customer |
| status | text | CHECK in the 12 codes (R8), default `draft` |
| agreed_price_minor | integer | ≥ 0, ≤ 10¹⁴ |
| currency | text | CHECK in (`CNY`,`USD`,`MAD`,`EUR`) |
| incoterm | text NULL | CHECK in the 11 Incoterms 2020 codes |
| destination_port | text NULL | ≤ 80 |
| expected_delivery_date | text NULL | `YYYY-MM-DD` |
| budget_cny_minor | integer NULL | ≥ 0, ≤ 10¹⁴ (planned total cost, CNY) |
| created_at, updated_at | integer | |
| created_by | text FK → users.id | |
| deleted_at, deleted_by | | recoverable deletion |

**Indexes**: `UNIQUE(number)`, `(deleted_at, created_at)`, `(customer_id)`, `(status)`.

**Status codes**: `draft`, `confirmed`, `purchased`, `in_production`, `inland_transport`, `at_port`, `on_vessel`, `arrived`, `customs_cleared`, `delivered`, `closed`, `cancelled`.
- Any status can move to any other in this feature (manual).
- *Open* = not `delivered`, `closed` or `cancelled`.

**Derived values (computed, never stored)**:
- `items_total_minor = Σ quantity × unit_price_minor`;
- `price_difference_minor = agreed_price_minor − items_total_minor`.

## order_items

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 |
| order_id | text FK → orders.id | |
| position | integer | 0-based display order |
| product_name | text | required, 1–160 |
| brand_model | text NULL | ≤ 120 |
| year | integer NULL | 1950 – (current year + 1) |
| quantity | integer | ≥ 1, ≤ 100000 |
| unit_price_minor | integer | ≥ 0, ≤ 10¹⁴ |
| hs_code | text NULL | 4–14 chars, digits and dots |
| specs | text NULL | ≤ 4000 |
| supplier_id | text NULL FK → suppliers.id | |

**Indexes**: `(order_id, position)`, `(supplier_id)`.

Items are replaced as part of an order edit (R4). They have no deletion of their own: their history lives in the order's audit entries.

## order_notes

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 |
| order_id | text FK → orders.id | |
| body | text | required, 1–2000 |
| author_user_id | text FK → users.id | |
| created_at | integer | |
| deleted_at, deleted_by | | recoverable deletion |

**Index**: `(order_id, created_at)`.

Notes are immutable: they can only be added or deleted.

## order_number_counters

| Column | Type | Rules |
|---|---|---|
| year | integer PK | |
| last_value | integer | ≥ 0. Incremented in the order-creation transaction (R2) and never decremented |

## company_settings (extended)

| Column | Type | Rules |
|---|---|---|
| order_number_prefix | text | default `HJ`. Format (1–10 chars of `A–Z`, `a–z`, `0–9`, `-`) is enforced by the shared validation schema, not a database CHECK: adding a CHECK in SQLite would mean rebuilding the settings table |

---

## Relationships

```text
customers 1 ── * orders 1 ── * order_items * ── 0..1 suppliers
                 orders 1 ── * order_notes * ── 1 users (author)
```

## Validation (shared zod schemas, `packages/shared/src/api/{customers,suppliers,orders}.ts`)

| Field | Rule | Error code |
|---|---|---|
| customer/supplier `name` | trimmed 1–120 | `name_invalid` |
| optional text fields | within their length | `text_too_long` |
| `email` | empty or a light `x@y.z` check | `email_invalid` |
| order `title` | trimmed 1–160 | `title_invalid` |
| `customerId` | an existing, non-deleted customer | `customer_invalid` |
| `agreedPrice`, `unitPrice`, `budgetCny` | decimal string `^\d{1,12}(\.\d{1,2})?$` | `amount_invalid` |
| `currency` | one of the 4 | `currency_invalid` |
| `incoterm` | empty or one of the 11 | `incoterm_invalid` |
| `status` | one of the 12 | `status_invalid` |
| `expectedDeliveryDate` | empty or a valid `YYYY-MM-DD` | `date_invalid` |
| item `productName` | trimmed 1–160 | `product_name_invalid` |
| item `quantity` | integer 1–100000 | `quantity_invalid` |
| item `year` | empty or 1950 – current+1 | `year_invalid` |
| item `hsCode` | empty or `^[0-9.]{4,14}$` | `hs_code_invalid` |
| item `supplierId` | empty or an existing, non-deleted supplier | `supplier_invalid` |
| note `body` | trimmed 1–2000 | `note_invalid` |
| `orderNumberPrefix` | `^[A-Za-z0-9-]{1,10}$` | `prefix_invalid` |

**Conflict codes**:
- `customer_name_exists` (409, FR-002);
- `in_use` (409, details `{ count }`, FR-021);
- `customer_deleted` (409, restoring an order whose customer is deleted).
