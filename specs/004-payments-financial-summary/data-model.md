# Data Model: Payments and Order Financial Summary (004)

Conventions from 001–003 apply:
- UUIDv7 ids;
- epoch-ms instants;
- `YYYY-MM-DD` calendar dates;
- money as integer minor units;
- rates as integer micro-units ("1 unit = X CNY");
- recoverable deletion.

New here: percentages in **basis points** (30% = 3000).

---

## payments

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 |
| order_id | text FK → orders.id | required (FR-002) |
| channel | text | `direct` \| `bank` |
| type | text | `deposit` \| `balance` \| `other` |
| amount_minor | integer | 1 … 10¹⁴ |
| currency | text | CHECK in CNY/USD/MAD/EUR |
| payment_date | text | `YYYY-MM-DD` |
| reference | text NULL | ≤ 80 |
| usd_cny_micro | integer | > 0, required (R2) |
| mad_cny_micro | integer | > 0, required (R2) |
| eur_cny_micro | integer NULL | > 0. Required when the payment or the order is in EUR |
| rate_source | text | `manual` \| `auto` \| `auto_edited` |
| rates_fetched_at | integer NULL | when the rates were fetched (auto, auto_edited) |
| market_rate_micro | integer NULL | the payment currency's market rate, from the cache (R3). Null for CNY |
| market_rate_date | text NULL | its published date |
| bank_rate_micro | integer NULL | the bank's rate to CNY for the payment currency |
| bank_name | text NULL | ≤ 60 |
| bank_rate_type | text NULL | `buying` \| `selling` \| `other` |
| bank_rate_at | integer NULL | date and time of the bank rate |
| cny_minor | integer | computed (R1): bank rate if present, else the customer rate |
| order_minor | integer | "counts as", in the order's currency (R1) |
| order_minor_manual | integer (bool) | 1 when "counts as" was typed |
| usd_minor | integer | USD value (R1) |
| mad_minor | integer | MAD value (R1) |
| proof_file_id | text NULL FK → files.id | |
| notes | text NULL | ≤ 2000 |
| created_at, updated_at, created_by, updated_by | | |
| deleted_at, deleted_by | | recoverable deletion |

**Indexes**: `(order_id, deleted_at, payment_date)`, `(proof_file_id)`.

**CHECK constraints**:
- channel, type, currency, rate source and bank rate type are within their lists;
- `amount_minor`, `cny_minor`, `order_minor`, `usd_minor` and `mad_minor` are between 0 and 10¹⁴ (amount ≥ 1);
- the bank fields are all set or all null: `(bank_rate_micro IS NULL) = (bank_name IS NULL) = (bank_rate_type IS NULL) = (bank_rate_at IS NULL)`;
- `currency <> 'CNY' OR bank_rate_micro IS NULL`;
- `currency <> 'EUR' OR eur_cny_micro IS NOT NULL`.

## order_payment_stages

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 |
| order_id | text FK → orders.id | |
| position | integer | 0 … n−1 |
| type | text | `deposit` \| `balance` \| `other` |
| channel | text | `direct` \| `bank` |
| percent_bp | integer | 1 … 10,000. The stages of an order total exactly 10,000 |
| due_before_status | text NULL | an order status, e.g. `in_production`, `on_vessel` |
| due_date | text NULL | `YYYY-MM-DD` |

Unique `(order_id, position)`. Every order has at least one stage: the seed migration backfills existing orders, and create and duplicate copy one.

## default_payment_stages

The same columns without `order_id` and `due_date`. Seeded:
- 0: Deposit, 3000 bp, direct, `in_production`;
- 1: Balance, 7000 bp, bank, `on_vessel`.

## payment_settings (single row, id = 1)

| Column | Type | Rules |
|---|---|---|
| id | integer PK | CHECK `id = 1` |
| direct_channel_name | text NULL | ≤ 40. Null = translated "Direct payments" |
| bank_channel_name | text NULL | ≤ 40. Null = translated "Bank payments (invoiced)" |
| updated_at, updated_by | | |

## chinese_banks

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUIDv7 (seeds use `bank-boc`, `bank-icbc`, `bank-abc`, `bank-ccb`) |
| name | text | 1–60, unique after `hj_norm` |
| position | integer | display order |
| created_at | integer | |

Seeded: Bank of China, ICBC, ABC, CCB.

## files (changed from 003)

`kind` CHECK widened to `receipt` \| `payment_proof`. The table is rebuilt by the generated migration, using the safe migration procedure (research R7). An unattached file is one referenced by no expense **and** no payment.

---

## Derived values (never stored, research R5)

With `rate(order)` = the agreed rate for non-CNY orders and 1,000,000 for CNY orders:

| Value | Formula |
|---|---|
| stage amount | `mulDivRound(agreed, percent_bp, 10000)`; the last stage = agreed − Σ others |
| channel planned / received / remaining | Σ stage amounts / Σ `order_minor` / planned − received |
| received | Σ `order_minor` (non-deleted payments) |
| remaining | `max(0, agreed − received)` |
| overpaid | `max(0, received − agreed)` |
| percentPaid | `percent1(received, agreed)` |
| receivedCny / receivedUsd / receivedMad | Σ `cny_minor` / Σ `usd_minor` / Σ `mad_minor` |
| average rate (currency X) | `round(Σ cny_minor[X] × 10⁶ ÷ Σ amount_minor[X])` |
| remainingCny | `convertToCnyMinor(remaining, rate(order))`. Null when the rate is missing |
| profit (D2) | `receivedCny + remainingCny − expensesTotal`. Null if `remainingCny` is null and remaining > 0 |
| margin | `percent1(profit, receivedCny + remainingCny)` |
| exchange result | `receivedCny − convertToCnyMinor(received, rate(order))` |
| gap from market (per payment) | `amount × bank_rate − amount × market_rate` (CNY), `percent1(bank − market, market)` |
| warnings | `overpaid > 0`; bank received > agreed price (the invoice total until 006) |

---

## Validation (shared zod, `packages/shared/src/api/payments.ts`)

| Field | Rule | Error code |
|---|---|---|
| `channel` | `direct` \| `bank` | `channel_invalid` |
| `type` | `deposit` \| `balance` \| `other` | `payment_type_invalid` |
| `amount` | decimal string, > 0 | `amount_invalid` |
| `currency` | one of 4 | `currency_invalid` |
| `paymentDate` | valid date | `date_invalid` |
| `reference` | ≤ 80 | `text_too_long` |
| `usdRate`, `madRate` | rate, required | `rate_invalid` / `rate_required` |
| `eurRate` | rate. Required when the payment or the order is in EUR (checked on the server for the order) | `rate_invalid` / `rate_required` |
| `rateSource` | `manual` \| `auto` \| `auto_edited` | `invalid_value` |
| `bank` | `{ rate, name, rateType, at }` or null. All four together; not allowed for CNY | `bank_rate_incomplete` / `rate_invalid` |
| `countsAs` | decimal string or null (null = computed). Only allowed when the payment currency ≠ the order currency | `amount_invalid` |
| `proofId` | a `payment_proof` file uploaded by the same user, not attached elsewhere | `proof_invalid` |
| `notes` | ≤ 2000 | `text_too_long` |
| plan `stages[]` | 1–10 stages; each `percent` 0.01–100 with up to 2 decimals; total exactly 100 | `plan_total_invalid` |
| settings channel names | ≤ 40, empty = translated default | `name_invalid` |
| settings banks | 0–30 names, 1–60 characters each, unique | `name_invalid` |
| order `currency` change with payments | — | `currency_locked` |
| order status → `closed` with a balance and no `confirmOutstanding` | — | `409 balance_outstanding` |
