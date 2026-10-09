# Research: Expenses and Exchange-Rate Service (003)

**Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

The stack is unchanged from 001/002, and no npm dependencies are added. Library APIs were checked in Context7: Hono `bodyLimit` and `c.req.parseBody()` multipart `File`, and `c.body()` for binary responses. Rate-provider terms were checked on the providers' own pages, and each provider was called once from this machine to confirm it returns MAD/CNY data.

---

## R1. Exchange-rate provider (ROADMAP D8, FR-014 – FR-018)

**Candidates checked (2026-10-07):**

| Provider | Key | Updates | Dated (historical) rates | MAD + CNY | Terms |
|---|---|---|---|---|---|
| **Currency API** (`@fawazahmed0/currency-api`, served by jsDelivr, fallback `currency-api.pages.dev`) | none | daily | **yes, by date in the URL** | yes (verified: `cny.json` has `usd`, `mad`, `eur`, for latest and 2026-09-01) | CC0-1.0, no rate limits. Asks clients to use the fallback host |
| **ExchangeRate-API open access** (`open.er-api.com/v6/latest/CNY`) | none | daily | no | yes (verified) | commercial use allowed. **Attribution required** ("Rates By Exchange Rate API" + link), no redistribution. About 1 request/hour, else HTTP 429 for 20 min |
| ExchangeRate-API free with key | key | daily | **no** (paid plans only; MAD not in the historical set) | yes | 1,500 requests/month |
| Open Exchange Rates free | key | hourly | no (paid) | yes | USD base only, 1,000 requests/month |
| Frankfurter / ECB | none | daily | yes | **no MAD** | excluded by D8 |
| Bank Al-Maghrib reference rates | portal key or a third-party reseller | business days | yes (paid via resellers) | yes | official MAD rate. Worth revisiting for customs/accounting (021) |

- **Decision**: ship a small **provider adapter** interface with three choices in Settings:
  1. **Currency API (default)**: no key, and dated rates for past expense dates. Tries jsDelivr first, then the `pages.dev` fallback host, as its README asks.
  2. **ExchangeRate-API (open access)**: no key, latest only. When it is selected, the attribution line appears wherever its rates are shown.
  3. **Manual only**: no automatic rates.
  The "access key" field is kept generic, for future keyed providers.
- **Rationale**:
  - The only free source that covers MAD *and* answers by date is the default. Without dated rates, a back-dated expense would get today's rate (FR-015).
  - A second provider gives the Owner a switch if the first one is down.
  - Manual-only keeps the app usable with no provider at all (FR-018).
- **Risks**: Currency API is a community project. It is mitigated by the fallback host, the second provider, the cache, and manual entry always being available. All rates are suggestions (brief §6).
- **Alternatives considered**: keyed plans (no dated rates for free, and the Owner would need to sign up); Bank Al-Maghrib (no free direct API found; reseller keys needed).

## R2. Rate direction, precision and conversion (FR-003)

- **Decision**:
  - Rates are stored as **integer micro-units**: `rate_micro = rate × 1,000,000`, meaning "1 unit = X CNY", up to 6 decimals.
  - Accepted input: `^\d{1,7}(\.\d{1,6})?$`, with a value above 0.
  - The CNY amount is computed in **BigInt**: `cny_minor = (amount_minor × rate_micro + 500,000) ÷ 1,000,000`, so half a cent rounds up.
  - Totals add the stored `cny_minor` values, so totals equal the sum of the lines shown (spec edge case).
  - Providers quote "1 CNY = x foreign". The adapter inverts this once: `rate_micro = round(1,000,000 ÷ x)`. Floats are only used here, and only to produce a suggestion.
- **Rationale**: exact, reproducible cents (constitution I). BigInt removes any overflow concern: 10¹⁴ minor × 10¹³ micro.
- **Alternatives considered**: a decimal library (not needed for one multiplication); float math (rejected for money).

## R3. Cache and fetch policy (FR-016, SC-005)

- **Decision**:
  - An `exchange_rates(provider, rate_date, currency, rate_micro, fetched_at)` table. One provider call returns all three currencies, so a whole date costs one call.
  - **Latest**: reuse the rows of the provider's last "latest" call (flagged `latest`) if it was made today (UTC), otherwise fetch. Rows stored by a back-dated lookup are never reused as the latest, even when fetched today (found while writing the tests).
  - **Dated**: reuse the cached date if present. Otherwise fetch that date (Currency API), or fall back to the latest, labelled with its own date.
  - "Refresh rates" always fetches the latest.
  - Each call has a **5 s timeout** (`AbortSignal.timeout`). A failure is recorded in the settings status (last error, time) and returned as `rates_unavailable`.
- **Rationale**: SC-004 (message within 5 s), SC-005 (at most one call per day), and it respects the open-access provider's hourly limit.

## R4. Expense-time snapshots (FR-004)

- **Decision**:
  - When an expense is saved, the server fills `usd_cny_micro` and `mad_cny_micro` from the **cache only**: the expense date's cached rates, or the nearest earlier cached date. It never calls the provider during a save.
  - Missing values stay null.
  - The client never sends these fields.
- **Rationale**: saving must never depend on the provider (FR-018). Snapshots are for later USD/MAD reports (011) and must not slow down the phone flow.

## R5. Agreed rate on orders (FR-011 – FR-013, D2)

- **Decision**:
  - Add `orders.agreed_rate_micro` (nullable).
  - The shared order schema requires `agreedRate` when `currency ≠ CNY`, with error `rate_required` on `agreedRate`. For CNY orders it is ignored and stored as null (meaning 1).
  - Orders created in 002 keep null until they are edited. The order view then returns `profit: null` with `profitUnavailableReason: 'agreed_rate_missing'`.
  - Duplicate (002) copies the agreed rate.
  - Agreed-rate changes are audited like any order field.
- **Impact on 002**: test seeds and e2e order creation now send an agreed rate for USD orders. This is expected, since the 002 tests start from the 002 contract.

## R6. Financial summary (FR-012)

- **Decision**: computed on every order read, never stored:
  - `expensesTotal = Σ cny_minor` of non-deleted expenses;
  - `unpaid = Σ` of those with status `to_pay`;
  - `agreedPriceCny = agreed_price_minor × agreed_rate` (CNY orders × 1), using the same BigInt rounding;
  - `profit = agreedPriceCny − expensesTotal`;
  - `marginPercent = profit ÷ agreedPriceCny` with one decimal (null if the price is 0);
  - `budgetUsedPercent = expensesTotal ÷ budget` with one decimal (null without a budget).
  - The client invalidates the order after every expense mutation, so figures update without a reload (SC-006).
- **Rationale**: derived values can never drift from their inputs (constitution I).

## R7. Receipts (FR-006)

- **Decision**:
  - **Upload first, attach on save**: `POST /api/receipts` (multipart, `bodyLimit` 10 MB) stores the file and returns a `receiptId`. The expense create/update then references it. This keeps the form and the photo intact if the save fails (spec US1-5), and avoids a half-saved expense.
  - **Storage**: `DATA_DIR/receipts/<uuid>` with no extension, plus a `files` row (id, kind, mime, size, sha256, created_by, created_at). Covered by the 009 backups of `DATA_DIR`.
  - **Type check by magic bytes**, never by extension: JPEG, PNG, WebP, HEIC/HEIF, PDF. Anything else gets `file_type_invalid`. Over 10 MB gets `file_too_large`.
  - **Phone-side reduction**: images are decoded with `createImageBitmap`, scaled to at most 1600 px on the long side, and re-encoded as JPEG at quality 0.82 through a canvas. If decoding fails (e.g. HEIC outside Safari), the original is sent as long as it is within 10 MB.
  - **Serving**: `GET /api/expenses/:id/receipt`, through the permission gate (`expenses:view`), with:
    - the stored `Content-Type`;
    - `Content-Disposition: inline` for images, and `attachment` for PDFs (decided during implementation, T033: browsers do not run their built-in PDF viewer inside a `sandbox`ed document, so PDFs are downloaded and opened by the phone's own viewer);
    - `Cache-Control: private, no-store`;
    - `X-Content-Type-Options: nosniff`;
    - `Content-Security-Policy: sandbox` (neutralizes scripts in PDFs).
  - **Orphans**: uploads never attached within 24 h are deleted by a cleanup that runs at server start and after each upload.
- **Alternatives considered**: storing files inside SQLite (bloats the DB and its backups); one combined multipart request for the whole expense (loses the photo when validation fails, and is harder to retry on slow links).

## R8. Categories (FR-021, FR-022)

- **Decision**:
  - An `expense_categories(id, key, name, position, hidden)` table.
  - The 13 defaults are seeded with a stable `key` and `name = null`; the label comes from `expenseCategory.<key>` translations.
  - Add or rename stores `name`, which then wins over the translation.
  - Hide and show toggle `hidden`. There is no delete.
  - Creation, rename, hide and show are Owner-only (settings) and audited.
- **Rationale**: defaults follow the user's language, and custom names show exactly as typed.

## R9. Reimbursements (FR-019, FR-020)

- **Decision**:
  - `expenses.advanced_by` (text) and `reimbursed` (boolean).
  - **Grouping** is by `hj_norm(advanced_by)` (002's normalization), so "Ahmed", "ahmed " and "Ahmed" with an accent count as one person. The label is the most recently used spelling.
  - **Suggestions** come from `GET /api/expenses/advanced-by?q=` (distinct names).
  - **Dashboard**: `GET /api/expenses/reimbursements` returns the amounts owed (non-reimbursed, non-deleted expenses of non-deleted orders) per person.

## R10. Permissions, audit, supplier rule (FR-023 – FR-025)

- **Decision**:
  - Add an `expenses` policy module.
  - Expense routes use `expenses:view|create|edit|delete`.
  - Category changes and rate settings use `owner`.
  - `GET /api/rates` is `authenticated`: market rates are not sensitive, and both the expense and the order forms need them.
  - Sensitive fields (D6):
    - `expense`: `amount`, `rateToCny`, `cnyAmount`;
    - `order` adds `agreedRate` and the whole `financials` block.
  - The audit snapshot of rate settings omits the key.
  - Supplier in-use counting (002) adds non-deleted expenses whose `paid_to_supplier_id` is the supplier.
