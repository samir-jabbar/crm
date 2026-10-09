# Implementation Plan: Payments and Order Financial Summary

**Branch**: `004-payments-financial-summary` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/004-payments-financial-summary/spec.md`

## Summary

Record money received from the customer in two channels (Direct and Bank) and know at any moment what has been received and what is still owed. Each payment:
- keeps frozen USD→CNY and MAD→CNY rates (plus EUR→CNY when needed);
- keeps an optional bank conversion (rate, bank, rate type, time) and the market rate of its day, for comparison;
- counts for the CNY that actually arrived, and toward the order through its own rates, with a manual override (decided 2026-10-08).

Every order gets a payment plan of stages (default: 30% Deposit Direct, 70% Balance Bank). Profit follows D2.

Technical approach:
- the same stack and patterns as 003: BigInt money math, values frozen on save, the rate cache only (never the provider) during saves, upload-first proofs, every figure derived on read in one place;
- one infrastructure fix: migrations run with foreign keys off around Drizzle's transaction, then a foreign-key check, after a pre-migration copy of the database. Rebuilding a referenced table (`files`, for the new proof kind) is then safe.

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node.js 24 LTS. Unchanged.
**Primary Dependencies**: as 003 (Hono 4, Drizzle 0.45 + better-sqlite3, zod 4, React 19, TanStack Query, Tailwind 4). No new packages.
**Storage**: SQLite. A generated migration adds:
- 5 tables: `payments`, `order_payment_stages`, `default_payment_stages`, `payment_settings`, `chinese_banks`;
- a rebuild of `files`, to widen its `kind` CHECK.

A custom migration seeds the settings, the default plan and the banks, and backfills a plan for every existing order. Proof files go to `DATA_DIR/receipts/`, the same store as 003.
**Testing**:
- Vitest: unit tests for the new money helpers and the plan math; integration tests per user story, with the injected fake rate provider.
- Playwright: the phone flows of AC2 and AC3, the plan, warnings, closing, settings, RTL.
**Target Platform / Project Type**: unchanged (web application, npm workspaces).
**Performance Goals**:
- a payment with fetched rates and a bank rate in < 60 s, a same-currency cash payment in < 30 s (SC-001);
- figures update without a reload (SC-005).

**Constraints**:
- exact cents;
- values frozen on save;
- the provider is never called during a save;
- warnings never block saving;
- closing with a balance always needs confirmation.

**Scale/Scope**: tens of payments per order. About 14 new routes and 5 new screens or sections.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / Constraint | How this plan complies | Status |
|---|---|---|
| I. Per-order financial accuracy | Received, remaining, % paid, average rates, exchange result, profit and margin are all derived (R5) from integer minor units and micro-rates in BigInt, rounded half up. Payment values are frozen on save (R1). Nothing is typed except the optional "counts as" override, which is labelled manual. | Pass |
| II. Mobile-first PWA | Full-screen payment form with a sticky Save; one "Fetch rate" fills every rate; history shown as cards on phones; 360px e2e. | Pass |
| III. Multilingual and Unicode | Translated channel and stage defaults; typed names win in every language; stage timing reuses translated order statuses; Western digits in rates and amounts. | Pass |
| IV. Never lose data | Payments deleted recoverably; proofs in `DATA_DIR`; a pre-migration copy of the database (R7); every change audited. | Pass |
| V. Secure by default | `payments` module with separately restrictable channels (R9); proofs only through the gate, with `nosniff` and `sandbox`; type sniffing and size limit as in 003. | Pass |
| VI. Simplicity | No new dependencies. Plans are percentages, derived on read. Whole-plan replace. The single migration fix is justified below. | Pass |
| VII. Current documentation first | Drizzle's migrator source and docs checked (Context7) for the transaction behaviour behind R7. No other new library APIs. | Pass |
| CNY base currency (D1) | Every payment stores its USD/MAD (and EUR) rates and its CNY, USD and MAD values. | Pass |
| D2 profit | Received at frozen values plus remaining at the agreed rate, minus expenses (R5). | Pass |
| D3 invoice = full price | Bank-over-invoice warning against the agreed price until 006; Direct is part of the same price. | Pass |
| D6 one policy layer | Sensitive fields declared for payments, summaries, plan amounts and order financials; channel scopes ready for 005. | Pass |
| D8 rates | Market rates come from the 003 service. The bank rate is typed, with no scraping. | Pass |

**Post-design re-check**: data-model.md, contracts/api.md and quickstart.md introduce no new projects or dependencies. All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/004-payments-financial-summary/
├── plan.md
├── research.md          # R1–R11
├── data-model.md
├── quickstart.md        # P1–P21
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (changes on top of 003)

```text
packages/shared/src/
├── enums.ts                      # + 'payments' module, PAYMENT_CHANNELS, PAYMENT_TYPES, BANK_RATE_TYPES, DEFAULT_BANKS
├── errors.ts                     # + 7 codes; details.remaining / details.currency
├── money.ts                      # + mulDivRound, percentToBasisPoints / formatBasisPoints, planAmounts
└── api/payments.ts               # schemas + types; api/orders.ts: confirmOutstanding, financials fields

apps/server/
├── drizzle/                      # 0006 generated (5 tables + files rebuild, reviewed) + 0007 custom seeds/backfill
├── src/db/client.ts              # runMigrations: pre-migration copy, foreign keys off → migrate → foreign_key_check → on
├── src/db/schema/{payments,orderPaymentStages,defaultPaymentStages,paymentSettings,chineseBanks}.ts (+ files kind)
├── src/files/store.ts            # saveFile(kind); orphans also count payments
├── src/payments/
│   ├── values.ts                 # R1: CNY / counts-as / USD / MAD values, gap
│   ├── service.ts                # create / update / delete / restore, market-rate snapshot, audit
│   ├── query.ts                  # per-order list + summary (R5, R6)
│   ├── plan.ts                   # copy default, replace, amounts
│   └── settings.ts               # channel names, default plan, banks
├── src/orders/financials.ts      # D2 profit, received, remaining, exchange result
├── src/orders/service.ts         # copy plan on create/duplicate; closing rule; currency lock
├── src/policy/authorize.ts       # requireChannel (Owner-only until 005)
├── src/routes/{payments,paymentProofs,paymentSettings}.ts (+ orders.ts changes)
└── tests/
    ├── unit/{payment-values,plan}.test.ts
    └── integration/{payments.create,payments.rates,payments.summary,payments.update,plan,closing,payment-settings,migration004,policies004}.test.ts

apps/web/src/
├── api/payments.ts
├── components/{PaymentRatesBlock,BankConversionBlock,PaymentResults,PlanEditor,CloseOrderDialog}.tsx
├── routes/payments/{form,detail}.tsx, routes/orders/PaymentsTab.tsx, routes/orders/plan.tsx
├── routes/settings/PaymentSettingsSection.tsx
├── components/FinancialSummary.tsx   # + received / remaining / % paid / exchange result
└── e2e/{payments,payment-settings}.spec.ts
```

**Structure Decision**: the same workspaces, with a new `payments/` server domain. The 003 file store and rate service are reused.

## Key design notes

- **Payment save**, in one transaction:
  1. Check the order (not deleted), the channel scope, the proof, and the EUR rate when the order is in EUR.
  2. Read the market rate from the cache (R3).
  3. Compute the values (R1).
  4. Insert or update, with an audit entry of the changed fields.
- **Live form**:
  - the client computes the same values as the server with the shared helpers, so what is shown is what gets saved;
  - the warnings use the current summary plus the payment being typed (minus its old value on edit).
- **Closing**: one server rule in `setOrderStatus` and `updateOrder`. The client catches `balance_outstanding` in both places, shows `CloseOrderDialog` with the amount, and resends with `confirmOutstanding: true`.
- **Rates**: "Fetch rate" calls `GET /api/rates` for USD, MAD (and EUR) with the payment date. A single provider call answers all of them (003 R3), so there is no new rate endpoint.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| Migrations run with foreign keys off, then `foreign_key_check`, after a pre-migration copy of the database (R7) | Rebuilding `files` (and future tables) is the only way SQLite can change a CHECK. Drizzle's single transaction ignores `PRAGMA foreign_keys`, so dropping a referenced table fails or loses rows. | Reusing `kind = 'receipt'` for proofs mislabels data and only moves the problem to 007. Hand-editing every rebuild (as in 003) does not scale and is easy to get wrong. |
