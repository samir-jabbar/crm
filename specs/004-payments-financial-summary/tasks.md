---
description: "Task list for 004 Payments and Order Financial Summary"
---

# Tasks: Payments and Order Financial Summary

**Input**: Design documents from `specs/004-payments-financial-summary/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: Included. The constitution requires the brief's §6 rules and §9 criteria to be automated, and test names reference the quickstart scenarios P1–P21.

**Builds on 001–003**: reuse these, don't re-create them:
- `route()` with policies, `requirePermission` (`apps/server/src/policy/`); presenters and `SENSITIVE_FIELDS` (`present.ts`);
- `recordAudit`; soft delete (`softDelete` / `restore`); `parseWith` / `readJsonBody`; `AppError` / `notFound`; `newId()`;
- money in `packages/shared/src/money.ts`: `parseAmount`, `formatAmount` (accepts bigint), `parseRate`, `formatRate`, `convertToCnyMinor`, `percent1`, `rateDeviates`;
- the rate cache and service: `apps/server/src/rates/{cache,service,settings}.ts`, `snapshotFor`, `GET /api/rates`, `useRateConfig` / `fetchRate` on the web;
- the file store: `apps/server/src/files/{sniff,store}.ts`, the receipt route pattern (`bodyLimit`, `cspOverride: 'sandbox'`, PDFs as attachments);
- `orders/financials.ts` and `FinancialSummary.tsx` from 003;
- the test harness: `createTestContext(env, { http })`, `fakeRates`, `seedOrder` (USD 190,000 at 7.1), `seedExpense`, `TINY_JPEG`, `TestClient.upload` / `getBytes` / `put`;
- web: `api()`, `uploadFile`, `ReceiptInput`, `RateField`, `AutoRateField`, `MoneyInput`, `AmountText`, `ConfirmDelete`, `CalendarDate`;
- e2e: `signIn`, `setLanguage`, `expectNoHorizontalScroll`, `apiCustomer`, `apiOrder`, `apiExpense`, `ORIGIN`, the fake rate provider (`e2e/fake-rates.mjs`).

**Library docs**: check Context7 before using any library API not yet used in this repo (CLAUDE.md).

**Shell note**: write code that contains backslashes (regexes, SQL `escape '\\'`, `\n`) with Write/Edit, never through a Bash heredoc (see memory).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on unfinished tasks)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup

**Purpose**: confirm the 003 baseline is green on this branch.

- [X] T001 Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` from the repo root. Expect 192 server + 7 web unit/integration tests and 60 e2e tests passing. Fix nothing in 001–003 unless a check fails.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the shared vocabulary and money helpers, the safe-migration fix, the schema and seeds, the file store and the cache extension, permissions, test helpers and web building blocks.

**⚠️ CRITICAL**: no user-story work starts before this phase is complete.

### Shared package

- [X] T002 [P] Extend `packages/shared/src/enums.ts`:
  - add `'payments'` to `POLICY_MODULES`;
  - `PAYMENT_CHANNELS = ['direct','bank']`, `PAYMENT_TYPES = ['deposit','balance','other']`, `BANK_RATE_TYPES = ['buying','selling','other']`, each with its type;
  - `PAYMENT_CHANNEL_SCOPES = { direct: 'payments.direct', bank: 'payments.bank' }`;
  - `FILE_KINDS = ['receipt','payment_proof']`;
  - `DEFAULT_BANKS = ['Bank of China','ICBC','ABC','CCB']`;
  - `BASIS_POINTS = 10_000`, `MAX_PLAN_STAGES = 10`, `PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/`.
- [X] T003 [P] Add the 7 new codes to `ERROR_CODES` in `packages/shared/src/errors.ts`: `balance_outstanding`, `currency_locked`, `plan_total_invalid`, `channel_invalid`, `payment_type_invalid`, `bank_rate_incomplete`, `proof_invalid`. Add `remaining?: string` and `currency?: CurrencyCode` to `ApiErrorBody.error.details`, and the same two to `AppErrorDetails` in `apps/server/src/lib/errors.ts`.
- [X] T004 [P] Extend `packages/shared/src/money.ts`. No floats:
  - `mulDivRound(a, b, c): bigint` = `(a × b × 2 + c) ÷ (2c)`, for non-negative BigInt-able inputs and `c > 0`;
  - `parsePercent(s): number`: basis points (`"30"` → 3000, `"12.5"` → 1250). It throws unless `PERCENT_PATTERN` matches and the value is 0 < bp ≤ 10,000;
  - `formatPercent(bp): string`: minimal form (`3000` → `"30"`, `1250` → `"12.5"`);
  - `planAmounts(agreedMinor, bps[]): bigint[]`: each `mulDivRound(agreed, bp, 10000)`, with the last stage getting `agreed − Σ others`;
  - `averageRateMicro(cnySum, amountSum): bigint | null` = `mulDivRound(cnySum, 1e6, amountSum)`; null when `amountSum` is 0.
  Export everything from `index.ts`.
- [X] T005 [P] Unit tests in `apps/server/tests/unit/plan-money.test.ts`:
  - `mulDivRound`: half up (`1 × 1 ÷ 2` → 1, `1 × 1 ÷ 3` → 0), exact for large values;
  - `parsePercent`: `"30"` → 3000, `"12.5"` → 1250, `"0.01"` → 1, `"100"` → 10000. It rejects `"0"`, `"100.01"`, `"1.234"`, `"-5"`, `"abc"`;
  - `formatPercent` round-trips;
  - `planAmounts(19_000_000, [3000, 7000])` → `[5_700_000n, 13_300_000n]`; `planAmounts(100, [3333, 3333, 3334])` adds up to exactly 100; one stage at 10000 gives the whole amount;
  - `averageRateMicro(134_235_000, 19_000_000)` → `7_065_000n` (P10).
- [X] T006 Create `packages/shared/src/api/payments.ts`, following contracts/api.md and the data-model.md validation table. Every issue message is an error code.
  - **`paymentInputSchema`** (strict). Use the zod `when` option, as in 003 expenses, so these refinements report together with other field errors:
    - `rates.USD` and `rates.MAD` are required (`rate_required` at `rates.USD` / `rates.MAD`);
    - `bank` is all four fields or null (`bank_rate_incomplete`);
    - `bank` is not allowed when the currency is CNY (`bank_rate_incomplete` at `bank`);
    - `rates.EUR` is required when the currency is EUR (the server also checks the order's currency).
  - **Other schemas**: `paymentPlanSchema` (`stages[]`, 1–`MAX_PLAN_STAGES`, `percent` via `PERCENT_PATTERN`, total exactly 100 → `plan_total_invalid` at `stages`), `paymentSettingsPatchSchema`, `orderPaymentsQuerySchema` (`deleted`).
  - **Types**: `Payment`, `PaymentSummary`, `PlanStage`, `PlanStageInput`, `PaymentsConfig`, `PaymentSettings`.
  - **In `api/orders.ts`**:
    - an optional `confirmOutstanding: z.literal(true)` on `orderInputSchema` and `orderStatusRequestSchema`;
    - `OrderFinancials` gains `received`, `remaining`, `overpaid`, `percentPaid`, `receivedCny`, `remainingCny`, `fxResultCny`.

  Export everything from `index.ts`.

### Safe migrations, schema and seeds

- [X] T007 Implement the safe-migration procedure (research R7) in `apps/server/src/db/client.ts`. `runMigrations(db, sqlite, options = { dbPath?, backupsDir?, migrationsFolder? })` does:
  1. Detect pending migrations by comparing `readMigrationFiles({ migrationsFolder })` (from `drizzle-orm/migrator`) with the last `created_at` in `__drizzle_migrations`, when that table exists.
  2. If any migration is pending and `dbPath` is a file, run `VACUUM INTO '<backupsDir>/pre-migration-<UTC timestamp>.db'`. The default `backupsDir` is `DATA_DIR/backups`; create it.
  3. Set `PRAGMA foreign_keys = OFF`.
  4. Run `migrate(db, { migrationsFolder })` in `try/finally`.
  5. Run `PRAGMA foreign_key_check`. If it returns rows, throw an error that lists them.
  6. Set `PRAGMA foreign_keys = ON`, in `finally`.

  Update the callers: `apps/server/src/index.ts`, `apps/server/src/cli/migrate.ts` and `apps/server/tests/helpers.ts`.
- [X] T008 Define the Drizzle schemas in `apps/server/src/db/schema/`, exactly per data-model.md, with CHECK constraints and indexes:
  - `payments.ts` (with `...softDeleteColumns()`, the audit columns and `updatedBy`);
  - `orderPaymentStages.ts` (unique `(order_id, position)`);
  - `defaultPaymentStages.ts`;
  - `paymentSettings.ts` (CHECK `id = 1`);
  - `chineseBanks.ts`.
  Widen `files.kind` to `FILE_KINDS` in `files.ts`, and export everything from `schema/index.ts`.
- [X] T009 Generate the migrations:
  1. Run `npm run db:generate -w @hanjing/server -- --name payments`. **Review the `files` rebuild**: the copy `INSERT … SELECT` must list only columns that exist in the old table. Remove any `PRAGMA foreign_keys` lines; T007 handles foreign keys.
  2. Run `npm run db:generate -w @hanjing/server -- --custom --name payment_seeds` and write:
     - the `payment_settings` row (id 1, names null);
     - the two `default_payment_stages` (Deposit 3000 direct `in_production`; Balance 7000 bank `on_vessel`);
     - the 4 banks (`bank-boc`, `bank-icbc`, `bank-abc`, `bank-ccb`, positions 0–3);
     - a **backfill**: `INSERT INTO order_payment_stages … SELECT` the two default stages for every existing order, with deterministic ids (`'stg-' || orders.id || '-0'` and `-1`).
- [X] T010 Integration test of the safe migration (P21) in `apps/server/tests/integration/migration004.test.ts`:
  1. Copy `apps/server/drizzle` to a temp folder, keeping only the 0000–0005 entries in `meta/_journal.json` (the 003 state).
  2. Migrate a temp **file** database with it, then insert an owner, a USD order, a `files` row and an expense referencing it, with raw SQL.
  3. Run `runMigrations` with the real folder.
  4. Assert:
     - the expense still references its file, and `files.kind` is `receipt`;
     - the order has 2 plan stages;
     - `payment_settings`, the default stages and the banks are seeded;
     - `PRAGMA foreign_key_check` is empty and `foreign_keys` is back ON;
     - a `pre-migration-*.db` file exists in the backups dir;
     - running again creates no new copy (nothing pending).

### Server infrastructure

- [X] T011 Generalize the file store in `apps/server/src/files/store.ts`:
  - `saveFile(deps, bytes, actor, kind)`, with `saveReceipt` kept as a wrapper;
  - `readFile(deps, id)`, which also returns `kind`;
  - `removeOrphans`: a file is attached when any expense **or** payment references it.

  In `apps/server/src/expenses/service.ts`, a receipt must be `kind = 'receipt'` and not attached to any expense or payment. The 003 tests must keep passing.
- [X] T012 [P] Add `marketRateFor(db, provider, currency, date)` to `apps/server/src/rates/cache.ts`. It returns `{ rateMicro, rateDate }` for any of USD, MAD and EUR: the rate of `date` or of the nearest earlier cached date, read from the cache only (research R3).
- [X] T013 [P] Permissions (research R9):
  - in `apps/server/src/policy/authorize.ts`, `requireChannel(user, channel, action)`, which checks `PAYMENT_CHANNEL_SCOPES[channel]` with `requirePermission` (Owner-only until 005), and `visibleChannels(user)`;
  - in `apps/server/src/policy/present.ts`, extend `Resource` and `SENSITIVE_FIELDS`:
    - `payment: ['amount','rates','bankConversion','marketRate','cnyAmount','countsAs','usdAmount','madAmount','gap']`;
    - `paymentSummary: ['agreedPrice','channels','plan','received','remaining','overpaid','percentPaid','receivedTotals','averageRates','agreedRate','remainingCny','fxResultCny','warnings']`;
    - `planStage: ['amount']`.
- [X] T014 [P] Extend `apps/server/tests/helpers.ts` with `seedPayment(client, orderId, overrides)`. Defaults: channel `bank`, type `balance`, `1000` USD, `rates: { USD: '7.1', MAD: '0.71', EUR: null }`, `rateSource: 'manual'`, `paymentDate: '2026-10-07'`. It posts through the API and returns the body.

### Web building blocks

- [X] T015 [P] Create the query hooks in `apps/web/src/api/payments.ts`:
  - order payments (with `deleted`), payment get/create/update/delete/restore, payments config, plan update, payment settings get/patch;
  - **every payment or plan mutation** invalidates `order-payments`, `order` (financials, SC-005), `payment`, and `audit`;
  - `ReceiptInput` (`apps/web/src/components/ReceiptInput.tsx`) gains an `uploadPath` prop (default `/api/receipts`) and generic labels through props.
  Also add `apiPayment(page, orderId, data)` to `apps/web/e2e/helpers.ts`, with the same defaults as `seedPayment`.
- [X] T016 Add the base translations in all three `apps/web/src/locales/{en,fr,ar}/common.json`:
  - `paymentChannel.direct` ("Direct payments"), `paymentChannel.bank` ("Bank payments (invoiced)");
  - `paymentType.*`, `bankRateType.*`;
  - `errors.<code>` for the 7 new codes; `balance_outstanding` uses `{{remaining}} {{currency}}`.
  Add a `channelName(channel, configName, t)` helper in `apps/web/src/lib/payments.ts`. Use real French and Arabic; the i18n parity test must keep passing.

**Checkpoint**: migration004 passes (a 003 database upgrades safely), the plan-money unit tests pass, and the whole 001–003 suite is still green.

---

## Phase 3: User Story 1 — Record payments in two channels and see what is still owed (Priority: P1) 🎯 MVP

**Goal**: add payments in the Direct and Bank sections, with typed rates, a proof and the history. Each channel shows planned, received and remaining from the default plan, and the order shows received, remaining and % paid.

**Independent Test**: on a 190,000 USD order, record 57,000 USD Direct, then 133,000 USD Bank. Planned, received and remaining per channel and in total, and % paid, are correct after each (P1).

### Tests for User Story 1

- [X] T017 [P] [US1] Unit tests for payment values in `apps/server/tests/unit/payment-values.test.ts` (research R1):
  - **CNY payment on a CNY order**: CNY = amount, counts as amount, USD = CNY ÷ USD rate, MAD = CNY ÷ MAD rate.
  - **USD payment on a USD order**: counts as amount, USD = amount, CNY = amount × USD rate.
  - **With a bank rate 7.05**: CNY = amount × 7.05 (937,650.00 for 133,000), counts as stays the amount, and the gap is −6,650.00 CNY and `"-0.7"` against market 7.10.
  - **MAD on a USD order**: 570,000 MAD at 0.71 / 7.10 counts as 57,000.00 USD; a manual 56,800 is kept as given.
  - **EUR on a USD order** uses the EUR rate; MAD value of a MAD payment = amount.
  - Half-up rounding at every step.
- [X] T018 [P] [US1] Integration tests in `apps/server/tests/integration/payments.create.test.ts`:
  - **P1**: on `seedOrder` (190,000 USD), a Direct 57,000 USD payment, then the summary: channels direct `{ planned: '57000.00', received: '57000.00', remaining: '0.00' }` and bank `{ planned: '133000.00', received: '0.00', remaining: '133000.00' }`; `received '57000.00'`, `remaining '133000.00'`, `percentPaid '30.0'`. After a Bank 133,000: everything remaining `'0.00'` and `'100.0'`.
  - **P2**: items are newest first and each has its rates, CNY value and rate source.
  - **P4**: field codes for a missing amount, type, date, `rates.USD` and `rates.MAD` (`rate_required`), a bad channel (`channel_invalid`), a bad type (`payment_type_invalid`), and an unknown proof (`proof_invalid`), all at once.
  - **Plan**: a new order gets the default 2-stage plan; a duplicate copies the source plan.
  - A deleted or unknown order gives `404`. `record.created` is audited with target `payment`.
- [X] T019 [P] [US1] Integration tests for proofs in `apps/server/tests/integration/payments.proof.test.ts` (P3):
  - **Upload**: `POST /api/payment-proofs` → `201`, with the file row `kind = 'payment_proof'`.
  - **Attach and serve**: attached → `hasProof: true`, and `GET /api/payments/:id/proof` has the same headers as receipts (inline JPEG, `sandbox`, `nosniff`, `private, no-store`).
  - **Wrong kind or reuse**: a `receipt` file used as a proof → `proof_invalid`; a proof already used → `proof_invalid`; a payment proof used as an expense receipt → `receipt_invalid`.
  - **Orphans**: an unattached proof is removed after 24 h; an attached one is kept.
- [X] T020 [P] [US1] Playwright e2e test in `apps/web/e2e/payments.spec.ts` (P1, P3, P4, SC-001), on the mobile project:
  1. Create a 190,000 USD order with `apiOrder` (agreed rate 7.1) and open its Payments tab: Direct planned 57,000, Bank planned 133,000.
  2. "Add payment" in Direct: 57,000 USD, type Deposit. Type USD 7.1 and MAD 0.71 (or let auto-fill fill them) and attach a photo proof. Save in under 30 s. Direct shows remaining 0.00; the order shows 30.0%.
  3. Add a Bank 133,000 payment: 100.0%.
  4. Open a new payment and save it empty: the field errors show, and the typed reference and the attached proof are kept.

### Implementation for User Story 1

- [X] T021 [P] [US1] Implement `apps/server/src/payments/values.ts`, pure functions over BigInt (research R1):
  - `paymentValues({ amountMinor, currency, orderCurrency, rates, bankRateMicro, countsAsMinor })` returns `{ cnyMinor, orderMinor, orderManual, usdMinor, madMinor }`;
  - `paymentGap(amountMinor, bankRateMicro, marketRateMicro)` returns `{ cny, percent } | null`.
  The web form imports the same logic. Put the core in `packages/shared/src/payments.ts`, exported from `index.ts`, and make `values.ts` a thin re-export, so the client and the server compute the same numbers.
- [X] T022 [US1] Implement `apps/server/src/payments/plan.ts`:
  - `copyDefaultPlan(tx, orderId)`, `copyPlan(tx, fromOrderId, toOrderId)`;
  - `getPlan(db, orderId, agreedMinor)`, which returns the stages with amounts via `planAmounts`.
  Call `copyDefaultPlan` in `createOrder` and `copyPlan` in `duplicateOrder` (`apps/server/src/orders/service.ts`), inside their transactions.
- [X] T023 [US1] Implement `createPayment(deps, orderId, input, actor, ctx)` and `getPaymentView(db, id, { deleted })` in `apps/server/src/payments/service.ts`. `createPayment` runs in one transaction:
  1. The order exists and is not deleted.
  2. `requireChannel(actor, input.channel, 'create')`.
  3. `rates.EUR` is present when the order or the payment is in EUR (`rate_required`).
  4. The proof is a `payment_proof` file by the actor, not attached elsewhere (`proof_invalid`).
  5. A manual `countsAs` is allowed only when the payment's currency differs from the order's.
  6. `marketRateFor` reads the payment currency's market rate (none for CNY), from the current provider (`currency_api` when the provider is manual).
  7. `paymentValues` computes the values; any value above `MAX_AMOUNT_MINOR` gives `amount_invalid`.
  8. Insert, and audit `record.created` with the typed values plus the CNY value and "counts as".

  `getPaymentView` joins the order (not deleted, with its currency), the proof's mime, and the creator/updater usernames.
- [X] T024 [US1] Implement `apps/server/src/payments/query.ts` (research R5, R6):
  - `listOrderPayments(db, orderId, { deleted, channels })`: items ordered by `payment_date DESC, id DESC`;
  - `paymentSummary(db, order, channels)`: per-channel planned/received/remaining; the plan with amounts; `received`, `remaining`, `overpaid`, `percentPaid`; `receivedTotals` `{ cny, usd, mad }`; `averageRates` per foreign currency; `agreedRate`, `remainingCny`, `fxResultCny`; `warnings`.
  Sums use exact SQL text sums, as `orderExpenseSums` does in 003.
- [X] T025 [US1] Add the presenters to `apps/server/src/policy/present.ts`: `presentPayment` (including `gap` via `paymentGap`), `presentPaymentSummary`, `presentPlanStage`, `presentPaymentsConfig`. Each goes through `applyFieldRules`.
- [X] T026 [US1] Add the routes and register them in `apps/server/src/routes/index.ts`:
  - `apps/server/src/routes/payments.ts`:
    - `GET /api/orders/:id/payments` (payments:view; `deleted` also needs payments:delete);
    - `POST /api/orders/:id/payments` (payments:create; 404 before validation for a missing order);
    - `GET /api/payments/config` (payments:view), registered **before** `/api/payments/:id`;
    - `GET /api/payments/:id` (payments:view);
    - `GET /api/payments/:id/proof` (payments:view; headers as the receipt route).
  - `apps/server/src/routes/paymentProofs.ts`: `POST /api/payment-proofs` (payments:create; `bodyLimit` as receipts; `saveFile(..., 'payment_proof')`, then `removeOrphans`).
  Exclude `/payment` paths from `is002Route` in `apps/server/tests/integration/policies002.test.ts`, as 003 did for `/expenses`.
- [X] T027 [P] [US1] Create `apps/web/src/components/PaymentRatesBlock.tsx`, typed fields for now:
  - USD→CNY and MAD→CNY, always visible, plus EUR→CNY when needed, each a `RateField` with "1 CNY = x USD" under it, computed live with `mulDivRound` (6 decimals);
  - it reports `{ USD, MAD, EUR }`.
  US2 (T041) adds fetching, auto-fill and the source label.
- [X] T028 [US1] Create the payment form `apps/web/src/routes/payments/form.tsx` (create mode, `/orders/:id/payments/new?channel=direct|bank`), full screen on phones with a sticky Save. It has:
  - the channel (preselected from the query), type, amount (`MoneyInput`) + currency (default: the order's), date (today), reference;
  - `PaymentRatesBlock`;
  - a **live results** card (CNY / USD / MAD values and "Counts as X" in the order's currency), computed with the shared `paymentValues`;
  - the proof (`ReceiptInput` with `uploadPath="/api/payment-proofs"`), notes.
  Validate with `paymentInputSchema`, map server errors to fields, never clear inputs. On success, return to `/orders/:id?tab=payments`.
- [X] T029 [US1] Create `apps/web/src/routes/orders/PaymentsTab.tsx` and use it for the `payments` tab in `apps/web/src/routes/orders/detail.tsx`, replacing `ComingSoon`. It has:
  - an order summary: agreed price, received, remaining, % paid;
  - the plan card, read-only for now;
  - two channel sections (name via `channelName`), each with planned / received / remaining, its payments, and "Add payment";
  - the **history**: cards on phones, a `<table>` from the `sm` breakpoint, with date, channel, amount and currency, MAD/CNY, USD/CNY, CNY, source. Each row links to `/payments/:id`;
  - an empty state.
- [X] T030 [US1] Create the payment detail page `apps/web/src/routes/payments/detail.tsx`:
  - every frozen value: rates with their inverses, the source and fetch time, the CNY, USD and MAD values, and "counts as" (marked manual when typed);
  - the proof (an image inline, a PDF as "Download the PDF");
  - who created it and who last changed it;
  - a link back to the order.
  Register `/orders/:id/payments/new` and `/payments/:id` in `apps/web/src/router.tsx`.
- [X] T031 [US1] Add every US1 string to `apps/web/src/locales/{en,fr,ar}/common.json`: form labels, the results card, tab sections, history columns, the plan card, detail labels.

**Checkpoint**: P1–P4 pass. The Owner records payments in both channels and sees what is still owed.

---

## Phase 4: User Story 2 — Capture the exchange rates of every payment, including the bank's rate (Priority: P2)

**Goal**: one-tap fetch and auto-fill of the payment's market rates, the bank conversion block, and the live comparison (market · bank · customer, CNY actually received, gap) with the "counts as" override. All frozen on save.

**Independent Test**: a USD payment with fetched rates and a bank rate of 7.05 shows 937,650.00 CNY received and −0.7% vs market; the saved payment survives a market change (P5–P8).

### Tests for User Story 2

- [X] T032 [P] [US2] Integration tests in `apps/server/tests/integration/payments.rates.test.ts`, with `fakeRates`:
  - **P5**: rows cached for 2026-10-07 (USD 7.10). A USD 133,000 Bank payment with `bank: { rate: '7.05', name: 'Bank of China', rateType: 'buying', at }` gives `cnyAmount '937650.00'`, `marketRate { rate: '7.100000', rateDate: '2026-10-07' }`, `gap { cny: '-6650.00', percent: '-0.7' }`, and `countsAs.amount '133000.00'`.
  - **P6**: after a refresh caches 7.25, the payment is unchanged.
  - **P8**: 570,000 MAD on the USD order counts as `'57000.00'` (manual false), and CNY is `'404700.00'`. With `countsAs: '56800'`, the payment counts as `'56800.00'` (manual true) and CNY is unchanged. A `countsAs` on a same-currency payment gives `amount_invalid`.
  - **Bank fields**: an incomplete bank block → `bank_rate_incomplete`; a bank block on a CNY payment → `bank_rate_incomplete`.
  - **EUR**: on a EUR order, a payment without `rates.EUR` → `rate_required`.
  - **Market rate**: no market rate cached → `marketRate: null` and `gap: null`.
  - **No provider call during a save**: `fakeRates().calls` stays empty while saving.
  - The `rateSource` and `ratesFetchedAt` are stored as sent.
- [X] T033 [P] [US2] Playwright e2e test in `apps/web/e2e/payments.spec.ts` (append) (P5, P7, AC3), against the e2e fake provider:
  1. On a new USD Bank payment, auto-fill fills USD 7.1 and MAD 0.71, labelled "Automatic".
  2. Add the bank's rate 7.05, Bank of China, buying. The comparison shows 7.10 · 7.05 · 7.10, "CNY actually received" 937,650.00 and −0.7% vs market.
  3. Save, open the payment: the same values.
  4. Switch the fake to down, back-date a new payment: the unavailable message shows, and it saves with typed rates.

### Implementation for User Story 2

- [X] T034 [US2] Make sure `apps/server/src/payments/service.ts` covers every R1/R2 rule, filling any gap left in T023:
  - the bank block all-or-none, and not for CNY;
  - a manual `countsAs` only across currencies;
  - EUR required for EUR orders;
  - `rates_fetched_at` stored only for `auto` and `auto_edited`.
  Audit snapshots include `bank` as `{ rate, name, rateType, at }`.
- [X] T035 [P] [US2] Create `apps/web/src/components/BankConversionBlock.tsx`, shown for non-CNY payments behind an "Add the bank's rate" toggle:
  - the bank rate (`RateField` for the payment currency);
  - the bank (a select of `GET /api/payments/config` banks plus "Other…", which reveals a text field);
  - the rate type (buying / selling / other);
  - the rate date-time (`datetime-local`, default now, sent as an ISO instant).
  "Remove" clears all four.
- [X] T036 [US2] Complete `apps/web/src/components/PaymentRatesBlock.tsx`:
  - **"Fetch rate"**: one button calling `fetchRate` for USD, MAD (and EUR) with the payment date, in parallel;
  - **source label**: "Automatic · date · provider", "Automatic, then edited" or "Manual";
  - **unavailable**: the message on `503`, fields still typeable;
  - **auto-fill**: when `useRateConfig().autoFill` is on, a new payment fills its empty rate fields once (never overwriting typed values, as in 003 `AutoRateField`);
  - it reports `rateSource`, `ratesFetchedAt` and the market quote of the payment's currency (for the live gap).
- [X] T037 [P] [US2] Create `apps/web/src/components/PaymentResults.tsx`, the live results card, computed with the shared `paymentValues` / `paymentGap`:
  - CNY / USD / MAD values;
  - "Counts as X USD" with an "Edit" control that reveals a `MoneyInput`, and "Use computed" to return to the computed value;
  - for foreign currencies, the three rates side by side, labelled Market · Bank · Customer;
  - "CNY actually received" and the gap (e.g. "−0.7% vs market") when a bank rate is entered.
  Use it in `apps/web/src/routes/payments/form.tsx` in place of the US1 results card.
- [X] T038 [US2] Add every US2 string (rate block, bank block, comparison, counts-as override) to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: P5–P8 pass (AC3).

---

## Phase 5: User Story 3 — See received money, what remains, and the real profit on the order (Priority: P3)

**Goal**: the D2 profit, received and remaining figures in the order's financials, and the Payments tab summary in CNY, USD and MAD with average rates and the exchange result.

**Independent Test**: the worked example gives profit 138,850.00 CNY, margin 10.3%, exchange result −6,650.00 and average USD/CNY 7.065000 (P9–P11).

### Tests for User Story 3

- [X] T039 [P] [US3] Integration tests in `apps/server/tests/integration/payments.summary.test.ts`:
  - **P9**: with 1,203,500 CNY of expenses and no payment, profit `'145500.00'` (unchanged from 003).
  - **P10**: Direct 57,000 USD at 7.1 plus Bank 133,000 USD with a bank rate of 7.05:
    - financials `receivedCny '1342350.00'`, `remaining '0.00'`, `profit '138850.00'`, `marginPercent '10.3'`, `fxResultCny '-6650.00'`;
    - summary `averageRates [{ USD, '7.065000' }]`, `receivedTotals.usd '190000.00'`.
  - **Part paid**: only the Direct payment → `remainingCny '944300.00'` and profit = 404,700 + 944,300 − expenses.
  - **P11**: a legacy order (agreed rate set to NULL) part paid → profit null with `agreed_rate_missing`; fully paid → profit shown.
  - **CNY order**: `fxResultCny` `'0.00'` with CNY payments.
  - Deleted payments and the payments of a deleted order are excluded; restoring the order brings them back.
- [X] T040 [P] [US3] Playwright e2e test in `apps/web/e2e/payments.spec.ts` (append) (SC-005):
  1. On the worked-example order, the Overview shows profit 145,500.00.
  2. Add the two payments from the Payments tab. Back on Overview, without a reload, it shows received, remaining 0.00, profit 138,850.00, and the exchange result −6,650.00.

### Implementation for User Story 3

- [X] T041 [US3] Extend `apps/server/src/orders/financials.ts` with payment sums and the D2 profit (research R5): `received`, `remaining`, `overpaid`, `percentPaid`, `receivedCny`, `remainingCny`, `fxResultCny`, and the new `profit` / `marginPercent` rules. Share the sums with `payments/query.ts`. Add the new fields in `presentFinancials` (`apps/server/src/policy/present.ts`).
- [X] T042 [US3] Update the 003 exact-body assertions in `apps/server/tests/integration/financials.test.ts` (the `toEqual` on `financials`) for the new fields. The values for orders without payments must be unchanged.
- [X] T043 [US3] Web:
  - `apps/web/src/components/FinancialSummary.tsx` adds received, remaining to collect, % paid and the exchange result (gain or loss), keeping the 003 layout and the "Set the agreed rate" link;
  - `apps/web/src/routes/orders/PaymentsTab.tsx` gets the full summary card: received in CNY / USD / MAD, remaining in the order's currency and in CNY at the agreed rate, the average rate per currency, and the agreed reference rate with the exchange result.
- [X] T044 [US3] Add every US3 string to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: P9–P11 pass. The profit on the order is the real profit.

---

## Phase 6: User Story 4 — Plan the payments of each order (Priority: P4)

**Goal**: edit an order's plan; in Settings, edit the default plan, the channel names and the list of Chinese banks.

**Independent Test**: change the default to 40/60 and create an order; split a deposit across channels on another order; rename a channel (P12–P14).

### Tests for User Story 4

- [X] T045 [P] [US4] Integration tests in `apps/server/tests/integration/plan.test.ts` (P12, P13):
  - `PUT /api/orders/:id/payment-plan` with 20 Direct + 10 Bank + 70 Bank → Direct planned 20% and Bank 80% of the price.
  - 90% in total, 0 stages, 11 stages, or `"1.234"` → `plan_total_invalid` / field codes.
  - Planned amounts follow a changed agreed price.
  - Rounding: 33.33 / 33.33 / 33.34 adds up to the price exactly.
  - One `record.updated` (target `order`) with the before/after plan.
  - Worker → `403`.
- [X] T046 [P] [US4] Integration tests in `apps/server/tests/integration/payment-settings.test.ts` (P12, P14):
  - **Read**: `GET /api/settings/payments` has the seeded shape.
  - **Patch**:
    - `PATCH { defaultPlan: 40/60 }` → the next order copies 40/60, and older orders keep theirs;
    - `PATCH { channelNames: { direct: 'Cash and agents' } }` → `GET /api/payments/config` and the summary show it; `null` resets it;
    - `PATCH { banks: [...] }` replaces the list in order: a duplicate after `hj_norm` gives `name_invalid`, and removing ICBC keeps "ICBC" on an existing payment.
  - **Audit**: each change is `settings.updated` with before/after.
  - **Access**: a worker gets `403` on settings and `403` on config (payments:view is Owner-only until 005).
- [X] T047 [P] [US4] Playwright e2e test in `apps/web/e2e/payment-settings.spec.ts`:
  1. In Settings → Payments, rename Direct to "Cash and agents", set the default plan to 40/60, add a bank.
  2. Create an order: its plan card shows 40/60 and the new channel name. Open "Edit plan", split the deposit 20 Direct + 20 Bank, and save: the planned amounts per channel follow.
  3. The bank shows in the payment form's bank select.
  Restore the settings in `finally`, since the e2e server is shared.

### Implementation for User Story 4

- [X] T048 [US4] Implement `replacePlan(tx, clock, orderId, stages, actor, ctx)` in `apps/server/src/payments/plan.ts` (validation, whole replace, audit), and add `PUT /api/orders/:id/payment-plan` (payments:edit) to `apps/server/src/routes/payments.ts`.
- [X] T049 [US4] Implement `apps/server/src/payments/settings.ts`: `getPaymentSettings`, `updatePaymentSettings` (channel names, default plan replace, banks replace; one `settings.updated` audit with the changed parts), and `getPaymentsConfig`. Add `GET` / `PATCH /api/settings/payments` (owner) in `apps/server/src/routes/paymentSettings.ts` and register it.
- [X] T050 [P] [US4] Create `apps/web/src/components/PlanEditor.tsx`:
  - each stage is a card with type, channel, % (decimal input), "due before" (a select of order statuses, translated) and an optional due date;
  - add, remove, and move up/down, with 44px targets;
  - a live total, which must be 100%, and live amounts from the agreed price, when one is given.
  Then create `apps/web/src/routes/orders/plan.tsx` (`/orders/:id/payment-plan`), which saves with `PUT` and returns to the Payments tab. Add an "Edit plan" link on the plan card in `PaymentsTab.tsx`, and register the route.
- [X] T051 [US4] Create `apps/web/src/routes/settings/PaymentSettingsSection.tsx`:
  - channel names (empty = the translated default);
  - the default plan (`PlanEditor` without amounts);
  - the bank list (add, rename inline, remove, move).
  Mount it in `apps/web/src/routes/settings.tsx`. Change the 003 auto-fill label to say it applies to expenses and payments.
- [X] T052 [US4] Add every US4 string to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: P12–P14 pass.

---

## Phase 7: User Story 5 — Overpayment warnings and the closing rule (Priority: P5)

**Goal**: non-blocking warnings for overpayment and bank-over-invoice; a confirmation before closing an order that is still owed money; the currency lock.

**Independent Test**: payments above the price show the warning and still save; closing with 133,000 USD remaining asks for confirmation (P15–P17).

### Tests for User Story 5

- [X] T053 [P] [US5] Integration tests in `apps/server/tests/integration/closing.test.ts`:
  - **P15**: 191,000 USD received → `warnings.overpaid '1000.00'`, `overpaid '1000.00'`, `remaining '0.00'`. Bank 191,000 → `warnings.bankOverInvoice '1000.00'`. Both payments were saved (`201`).
  - **P16**: `PATCH /status { status: 'closed' }` with 133,000 remaining → `409 balance_outstanding { remaining: '133000.00', currency: 'USD' }` and the status is unchanged. With `confirmOutstanding: true` → `200` closed, and the audit after-snapshot has `outstanding: '133000.00 USD'`. The same rule applies via `PUT /api/orders/:id`. With nothing remaining, no confirmation is needed. `cancelled` is never blocked.
  - **P17**: a `PUT` changing the currency of an order with payments → `currency_locked`. Without payments (or only deleted ones), it is allowed.
- [X] T054 [P] [US5] Playwright e2e test in `apps/web/e2e/payments.spec.ts` (append):
  1. On a paid order, typing an extra payment shows the overpayment warning before saving, and it saves.
  2. On an order with 133,000 remaining, choose "Closed" in the header: the dialog shows "133,000.00 USD still to collect". Cancel keeps the status; Confirm closes it.

### Implementation for User Story 5

- [X] T055 [US5] In `apps/server/src/orders/service.ts`:
  - the closing rule in `setOrderStatus` and `updateOrder` (a remaining amount from `orderFinancials`, `confirmOutstanding`, and the audit `outstanding`);
  - the currency lock in `updateOrder`.
  Pass `confirmOutstanding` through `apps/server/src/routes/orders.ts`.
- [X] T056 [US5] Create `apps/web/src/components/CloseOrderDialog.tsx`. Use it in `apps/web/src/routes/orders/detail.tsx`, where the status select catches `balance_outstanding`, opens the dialog and resends with `confirmOutstanding: true`, and in `apps/web/src/routes/orders/edit.tsx` / `OrderForm.tsx`, the same on save. Map `currency_locked` to the currency field.
- [X] T057 [US5] Show the warnings live in `apps/web/src/routes/payments/form.tsx`: summary received plus the "counts as" being typed, minus this payment's old value on edit, compared with the agreed price, and Bank against the agreed price. Show them on `PaymentsTab.tsx` from `summary.warnings`. They never disable Save.
- [X] T058 [US5] Add every US5 string to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: P15–P17 pass.

---

## Phase 8: User Story 6 — Edit, delete, restore, audit (Priority: P6)

**Goal**: full correction of payments, recoverable deletion, and who/when.

**Independent Test**: edit an amount and the bank rate, delete and restore a payment; totals and the audit follow (P18).

### Tests for User Story 6

- [X] T059 [P] [US6] Integration tests in `apps/server/tests/integration/payments.update.test.ts` (P18):
  - **Edit**: `PUT` 133,000 → 130,000 recomputes CNY, USD and MAD; `record.updated` lists only the changed fields; an unchanged save writes nothing.
  - **Counts as**: a manual "counts as" is kept while sent and recomputed with `countsAs: null`.
  - **Market rate**: refreshed only when the date or the currency changes.
  - **Delete and restore**: `DELETE` → `204` and gone from every total and from `financials`; `?deleted=true` lists it; restore brings it back identical; `record.deleted` / `record.restored` are written.
  - **Deleted order**: editing a payment of a deleted order → `404`.
  - **Proof**: `proofId: null` unlinks the proof, which is removed 24 h later.
- [X] T060 [P] [US6] Playwright e2e test in `apps/web/e2e/payments.spec.ts` (append):
  1. Edit a payment's amount: totals follow, and "Last changed by" shows.
  2. Delete one with confirmation: it is gone.
  3. "Show deleted payments" → Restore: it is back.

### Implementation for User Story 6

- [X] T061 [US6] Implement `updatePayment` (a full replace with the same checks as create; recompute; keep a manual counts-as only while it is sent; refresh the market rate only when the date or the currency changes; audit the changed fields), `deletePayment` (via `softDelete`) and `restorePayment` (`404` if the order is deleted) in `apps/server/src/payments/service.ts`. Every function calls `requireChannel`.
- [X] T062 [US6] Add these routes to `apps/server/src/routes/payments.ts`:
  - `PUT /api/payments/:id` (payments:edit);
  - `DELETE /api/payments/:id` (payments:delete);
  - `POST /api/payments/:id/restore` (payments:delete).
- [X] T063 [US6] Web:
  - the edit mode of `apps/web/src/routes/payments/form.tsx` (`/payments/:id/edit`, prefilled: a manual counts-as stays manual, the bank block is open when present);
  - "Edit" and "Delete" (`ConfirmDelete`) on `apps/web/src/routes/payments/detail.tsx`;
  - "Show deleted payments" with "Restore" in `PaymentsTab.tsx`.
  Register the edit route.
- [X] T064 [US6] Add every US6 string to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: P18 passes. All six stories work.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T065 [P] Integration test for permissions in `apps/server/tests/integration/policies004.test.ts` (P19, FR-028):
  - every route added in 004 has `payments:*` (or `owner` for settings);
  - a worker gets `403` on each;
  - `SENSITIVE_FIELDS` equals the T013 lists plus the 003 ones exactly;
  - `requireChannel` is called on every payment read and write (a test stub that denies `payments.direct` hides Direct payments from the list and summary, and refuses creating one).
- [X] T066 [P] Extend the cross-cutting e2e tests:
  - in `apps/web/e2e/i18n-rtl.spec.ts` (P20), seed a payment with a bank block, an Arabic reference and a proof via the API. Add `/orders/<id>?tab=payments`, `/orders/<id>/payments/new?channel=bank`, `/payments/<id>`, `/payments/<id>/edit` and `/orders/<id>/payment-plan`;
  - add the payment form and the Payments tab to `apps/web/e2e/no-external-requests.spec.ts`.
- [X] T067 [P] Add a "Payments and order financial summary" section to `README.md`:
  - channels and the plan;
  - the rates on a payment, the bank's rate and the gap;
  - how CNY and "counts as" are computed (the 2026-10-08 decisions);
  - D2 profit;
  - warnings and the closing rule;
  - the pre-migration copies in `DATA_DIR/backups` (where they are, and that they can be deleted once the app runs).
  Update the "Data, security and backups" section. Do not tick 004 in `ROADMAP.md` until it is merged.
- [X] T068 Run the full validation:
  - lint, typecheck, `npm test`, and `npm run test:e2e` on all projects;
  - the quickstart scenarios P1–P21;
  - **P21 on real data**: copy the dev database (`apps/server/data/app.db`) with a SQLite backup into the scratchpad, run `npm run db:migrate` against the copy (`DATA_DIR` = the scratchpad), and check that its order has a plan, that receipts are intact, that `foreign_key_check` is empty, and that the pre-migration copy exists;
  - Arabic screenshots at 360px of the Payments tab, the payment form with the bank block, the plan editor and the Settings section (a throwaway spec, deleted afterwards).
  Fix every failure.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → **Foundational (T002–T016)** → user stories.
- **US1** (P1, MVP) needs Foundational.
- **US2** needs US1 (the payment form and service).
- **US3** needs US1. US2 is needed for the bank-rate figures in its example (P10).
- **US4** needs US1 (the plan is copied in US1; editing and settings come here).
- **US5** needs US1 and US3 (`remaining` comes from the financials).
- **US6** needs US1.
- **Polish** comes after all stories.

```text
Setup → Foundational → US1 ─┬─→ US2 ─→ US3 ─→ US5 ─┐
                            ├─→ US4 ───────────────┼─→ Polish
                            └─→ US6 ───────────────┘
```

### Shared files (edit sequentially, never in parallel)

- `apps/server/src/payments/service.ts` (T023 → T034 → T061)
- `apps/server/src/payments/plan.ts` (T022 → T048)
- `apps/server/src/routes/payments.ts` (T026 → T048 → T062)
- `apps/server/src/orders/service.ts` (T022 → T055)
- `apps/server/src/orders/financials.ts` (T041)
- `apps/server/src/policy/present.ts` (T013 → T025 → T041)
- `apps/web/src/routes/payments/form.tsx` (T028 → T037 → T057 → T063)
- `apps/web/src/routes/orders/PaymentsTab.tsx` (T029 → T043 → T050 → T057 → T063)
- `apps/web/src/components/PaymentRatesBlock.tsx` (T027 → T036)
- `apps/web/src/locales/*/common.json` (T016, T031, T038, T044, T052, T058, T064)
- `apps/server/tests/helpers.ts` (T007 → T014)

### Parallel opportunities

- **Foundational**: T002–T005 together; T012–T015 alongside the schema and migration work (T008–T011).
- **US1**: the tests T017–T020 together; T021 and T027 alongside the server service work.
- **After US1**: US4 and US6 can run alongside US2/US3.

## Parallel Example: User Story 1

```text
Task: "T017 payment value unit tests in apps/server/tests/unit/payment-values.test.ts"
Task: "T018 payment create tests in apps/server/tests/integration/payments.create.test.ts"
Task: "T019 proof tests in apps/server/tests/integration/payments.proof.test.ts"
Task: "T020 payments e2e in apps/web/e2e/payments.spec.ts"
# then, alongside T022–T026:
Task: "T021 shared payment values", "T027 PaymentRatesBlock"
```

---

## Implementation Strategy

### MVP first (US1)

1. T001 → T002–T016. **Stop and check** that migration004 passes on a 003-shaped database before anything else.
2. US1 (T017–T031). **Stop and validate** P1–P4: money received is recorded per channel and the balance is known (AC2).

### Incremental delivery

1. **US2**: rates and the bank conversion (AC3).
2. **US3**: the real profit (D2).
3. **US4**: plans and settings. **US5**: warnings and closing. **US6**: corrections.
4. **Polish**, and full validation including P21 on a copy of the real dev database. Commit only when the user asks (003 is still uncommitted; commit it separately first), then merge and tick 004 in `ROADMAP.md`.

### Notes

- The client and the server compute payment values with the same shared functions, so what the form shows is what is saved.
- Saving a payment never calls a provider. The market rate comes from the cache.
- Every new route goes through `route()` with a policy, and every payment path also calls `requireChannel`.
- Every change writes its audit entry in the same transaction.
