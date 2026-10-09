# Implementation Plan: Expenses and Exchange-Rate Service

**Branch**: `003-expenses-exchange-rates` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/003-expenses-exchange-rates/spec.md`

## Summary

Record every real cost against its order, from a phone, in four currencies. Each expense:
- stores its rate to CNY, frozen;
- keeps optional receipt photos;
- can be marked paid or to pay;
- can say who advanced the money, for reimbursement tracking.

The order shows exact CNY totals and profit, converting its agreed price at a new **agreed rate** (D2, decided). An exchange-rate service suggests rates with a daily cache and a manual fallback.

Technical approach:
- the same stack as 002;
- rates as integer micro-units, converted with BigInt;
- a three-choice provider adapter: Currency API by default (no key, dated rates), ExchangeRate-API open access, or manual;
- receipts uploaded before the expense is saved, then attached, stored under `DATA_DIR`, type-checked by magic bytes and served only through the permission gate;
- financial figures derived on every read.

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node.js 24 LTS. Unchanged.
**Primary Dependencies**: as 002. Uses Hono `bodyLimit` and `parseBody` for uploads, and Node `fetch` with `AbortSignal.timeout` for providers. No new packages.
**Storage**: SQLite. A migration adds 5 tables (`expenses`, `expense_categories`, `files`, `exchange_rates`, `rate_settings`), one column `orders.agreed_rate_micro`, and seeds the categories. Receipt files go in `DATA_DIR/receipts/`.
**Testing**: Vitest. The server's HTTP client is injected into `Deps`, so the provider adapters are tested against fakes (no network in tests). Playwright for phone flows, including a camera-style file input.
**Target Platform**: as before.
**Project Type**: web application (unchanged workspaces).
**Performance Goals**:
- CNY expense in < 30 s, with a photo in < 60 s at about 1 Mbps (SC-001);
- rates-unavailable message in ≤ 5 s (SC-004);
- profit refresh without a reload (SC-006).

**Constraints**:
- exact cents;
- rates never change after saving;
- the provider is never called during a save;
- at most one provider call per date;
- the access key is never returned or audited.

**Scale/Scope**: tens of expenses per order, thousands overall. About 18 new routes and 6 screens or sections.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / Constraint | How this plan complies | Status |
|---|---|---|
| I. Per-order financial accuracy | Integer minor units and integer micro-rates, BigInt conversion with half-up rounding. Totals are sums of stored line CNY values. Profit and margin are derived, never stored. Rates are frozen per expense (R2, R6). | Pass |
| II. Mobile-first PWA | Full-screen expense form, camera capture, on-phone image reduction, sticky save button, 360px e2e. | Pass |
| III. Multilingual and Unicode | Translated default categories, any-script custom names, `hj_norm` grouping of advanced-by names, Western digits in rates and amounts. | Pass |
| IV. Never lose data | Recoverable deletion of expenses; receipts in `DATA_DIR` (backed up in 009); upload-first keeps the photo on failed saves; every change audited. | Pass |
| V. Secure by default | `expenses` module policies; receipts only via the gate with `nosniff` and `sandbox`; type sniffing; size limit; API key stored server-side, masked, never audited. | Pass |
| VI. Simplicity | No new dependencies; three providers behind one small adapter; snapshots read only from the cache. | Pass |
| VII. Current documentation first | Hono body-limit and multipart checked in Context7; provider terms read on their sites and responses verified live (research R1). | Pass |
| CNY base currency (D1) | All totals and profit in CNY; each expense keeps its rate plus USD/MAD snapshots. | Pass |
| D2 agreed rate | `orders.agreed_rate_micro`, required for non-CNY orders, with profit unavailable until set. | Pass |
| D5 no Google, China-safe | Providers are called server-side only (the VPS is outside China); the client never calls third parties. | Pass |
| D6 one policy layer | Sensitive fields declared for expenses and order financials. | Pass |
| D8 rates | Covers MAD; daily cache; manual fallback; terms checked; attribution shown for ExchangeRate-API. | Pass |

**Post-design re-check**: data-model.md, contracts/api.md and quickstart.md introduce no new projects or dependencies. All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/003-expenses-exchange-rates/
├── plan.md
├── research.md          # R1–R10 (provider choice with verified terms and data)
├── data-model.md
├── quickstart.md        # X1–X19
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (changes on top of 002)

```text
packages/shared/src/
├── enums.ts                      # + 'expenses' module, EXPENSE_STATUSES, PAYMENT_METHODS, RATE_SOURCES, DEFAULT_CATEGORY_KEYS, RATE_PROVIDERS
├── errors.ts                     # + 7 codes
├── money.ts                      # + parseRate / formatRate / convertToCnyMinor (BigInt) / percent1
└── api/{expenses,rates}.ts       # + orders.ts: agreedRate + financials

apps/server/
├── drizzle/                      # 0003 generated + custom seed of categories
├── src/deps.ts                   # + http: typeof fetch (injectable)
├── src/db/schema/{expenses,expenseCategories,files,exchangeRates,rateSettings}.ts (+ orders.agreedRateMicro)
├── src/rates/
│   ├── providers.ts              # adapters: currencyApi (jsDelivr → pages.dev fallback), exchangeRateApiOpen
│   └── service.ts                # getRate(date?), refresh, cache, snapshotFor(date), settings
├── src/files/
│   ├── sniff.ts                  # magic-byte type detection
│   └── store.ts                  # save / open / delete orphans under DATA_DIR/receipts
├── src/expenses/
│   ├── service.ts                # create / update / status / delete / restore, CNY computation, snapshots
│   ├── query.ts                  # per-order list + totals, reimbursements, advanced-by names
│   └── categories.ts
├── src/orders/financials.ts      # derived summary (R6), used by presentOrder
├── src/routes/{expenses,receipts,rates,expenseCategories}.ts
└── tests/
    ├── unit/{rates-money,sniff,providers}.test.ts
    └── integration/{expenses.*, rates.*, receipts, financials, categories, reimbursements, policies003}.test.ts

apps/web/src/
├── api/{expenses,rates}.ts
├── lib/imageResize.ts            # createImageBitmap → canvas → JPEG ≤1600px
├── components/{RateField,ReceiptInput,PaidToPicker,AdvancedByInput,FinancialSummary}.tsx
├── routes/expenses/{form,detail}.tsx, routes/orders/ExpensesTab.tsx
├── routes/settings.tsx           # + exchange-rate and categories sections
├── routes/dashboard.tsx          # + To reimburse block
└── e2e/{expenses,rates-settings}.spec.ts
```

**Structure Decision**: same workspaces. Two new server domains (`rates/`, `files/`) are reusable: `files/` serves order documents in 007, and `rates/` serves payments in 004.

## Key design notes

- **Expense save**, in one transaction:
  1. Validate references: order not deleted, category, supplier, and `receiptId` (an unattached upload by the same user, or the expense's current receipt).
  2. Compute `cny_minor` with BigInt.
  3. Read USD/MAD snapshots **from the cache only**.
  4. Insert or update the expense.
  5. Write the audit entry with changed fields.
- **Rate lookup**: cache first (same day for the latest, exact date for dated requests), otherwise one provider call with a 5 s timeout. Every currency returned is written to the cache. The settings status is updated (`last_fetch_at` or `last_error`).
- **Profit unavailable**: when a non-CNY order lacks an agreed rate, `financials.profit` is null with `profitUnavailableReason: 'agreed_rate_missing'`, and the UI links to the order edit page. The order schema enforces the rate on every create and edit, so new orders always have one.
- **Web rate field**:
  - shows "1 USD = [7.100000] CNY", plus a label "Automatic · 2026-10-07 · Currency API" or "Manual";
  - "Fetch rate" calls `GET /api/rates`;
  - typing after an automatic fill flips the source to `auto_edited`;
  - a typo warning shows when the value differs from the latest by more than 20%.
- **Receipt input**: `<input type="file" accept="image/*,application/pdf" capture="environment">`. The image is resized before upload, and a progress indicator and retry are shown. The uploaded id is kept in the form state, so a failed save keeps the photo.

## Complexity Tracking

No constitution violations to justify.
