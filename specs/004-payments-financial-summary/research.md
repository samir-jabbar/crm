# Research: Payments and Order Financial Summary (004)

**Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

The stack is unchanged from 001–003, and no npm dependencies are added. Two library questions were checked:
- **Drizzle migrations**: the source of `drizzle-orm/sqlite-core` was read, together with the Drizzle migration docs in Context7. All pending migrations run inside one `BEGIN … COMMIT`.
- **Rates**: the 003 rate service is reused as is.

---

## R1. How a payment is valued (FR-009, decided 2026-10-08)

- **Decision**: all values are integer minor units, computed with BigInt and rounded half up, as in 003. A rate of 1,000,000 micro-units is used for CNY. For a payment of `amount` in currency P on an order in currency O:
  - **CNY value** (`cny_minor`) = `amount × bank_rate` when a bank rate is entered, otherwise `amount × rate(P→CNY)`. This is the CNY that actually arrived.
  - **Counts as** (`order_minor`, in O) = `amount` when P = O. Otherwise it is `amount × rate(P→CNY) ÷ rate(O→CNY)`, using the payment's own customer rates, not the bank rate. It can be overridden; `order_minor_manual = 1` then keeps the typed figure through later edits of rates or amount.
  - **USD value** = `amount` when P = USD, otherwise `cny_minor ÷ rate(USD→CNY)`. The **MAD value** works the same way with MAD.
  - **Gap from market** (shown, derived from frozen inputs): `amount × bank_rate − amount × market_rate` in CNY, and `percent1(bank − market, market)`.
- **New shared helper**: `mulDivRound(a, b, c)` = `(a × b × 2 + c) ÷ (2 × c)` for non-negative BigInts. Every conversion above is either `convertToCnyMinor` (from 003) or `mulDivRound`.
- **Rationale**:
  - The customer is credited at the customer rate, but the company receives what the bank gives. The difference therefore lands in the exchange result, and profit shows the real money.
  - The figures are exact and reproducible to the cent (constitution I).
- **Alternatives considered**: storing only the rates and computing values on every read. Rejected: FR-011 wants the values frozen, and the "counts as" override has to be stored anyway.

## R2. Rates required on a payment (FR-006 – FR-008)

- **Decision**:
  - `usd_cny_micro` and `mad_cny_micro` are **required on every payment**. Brief §4.3: "two dedicated rate fields … always visible … never hidden". They also guarantee that every payment has USD and MAD values, so the USD/MAD totals are always complete.
  - `eur_cny_micro` is required when the payment or the order is in EUR (D1).
  - "Fetch rate" and auto-fill fill all of them in one tap: one `GET /api/rates` per currency, all answered by a single cached provider call (003 R3). With the provider down, the Owner types them.
  - The **bank conversion** is optional and all-or-nothing: rate, bank name, rate type, and date-time together. It applies only to non-CNY payments.
  - The bank's date-time is stored as an instant (epoch ms) from the phone's local date-time field, and shown in the viewer's time zone.
- **Rationale**: the brief makes these two rates a fixed part of every payment, and reports (011) need USD and MAD values for all of them. One tap fills them.
- **Alternatives considered**: optional rates with incomplete totals. Rejected: the per-order summary must show received money in USD and MAD (spec FR-019).

## R3. Market rate kept for comparison (FR-010, FR-011)

- **Decision**: when a payment is saved, the server stores `market_rate_micro` and `market_rate_date` for the payment's currency, from the **003 rate cache only**. It takes the rate of the payment date, or of the nearest earlier cached date (`snapshotFor`, extended to EUR), from the current provider. It never calls a provider during a save.
  - The form shows the market rate it fetched. That is the same value whenever the cache answered the fetch, which is the normal case.
  - Nothing is stored for CNY payments, or when the cache has no rate. The gap is then not shown.
- **Rationale**:
  - The comparison cannot be typed by a user.
  - Saving never depends on the provider (003 R4).
  - A payment entered with typed rates still gets a market comparison whenever one is known.

## R4. Payment plan (FR-012 – FR-015)

- **Decision**:
  - **Storage**: an `order_payment_stages` table with `(order_id, position, type, channel, percent_bp, due_before_status, due_date)`. `percent_bp` is the percentage in basis points (30% = 3000, up to 2 decimals). The stages of a plan must total exactly 10,000.
  - **Timing**: "before production" and "before shipping" are stored as `due_before_status`, an order status (`in_production`, `on_vessel`, …). They are therefore translated in every language, and the 008 advisor can tell when a stage is due.
  - **Planned amount** of a stage = `mulDivRound(agreed_minor, percent_bp, 10000)`. The last stage gets `agreed − sum(others)`. The plan is derived on every read, so it follows a changed agreed price.
  - The **default plan** lives in a `default_payment_stages` table with the same columns, without the order or the date. Seeded:
    - Deposit, 3000 bp, direct, `in_production`;
    - Balance, 7000 bp, bank, `on_vessel`.
  - **Copying**: `createOrder` copies the default plan into a new order, and `duplicateOrder` copies the source order's plan. The seed migration backfills every existing order with the default plan.
  - **Editing**: `PUT /api/orders/:id/payment-plan` replaces the whole plan, with one audit entry holding the before and after stages.
- **Rationale**: percentages keep the plan valid when the price changes. Whole-plan replace is simple and audits cleanly.
- **Alternatives considered**: stored amounts per stage (they go stale when the price changes); per-stage received tracking (not required: received is tracked per channel, as the spec Assumptions say).

## R5. Received, remaining and profit (FR-015 – FR-019, D2)

All values are derived on every read, from non-deleted payments of the order, in BigInt. With `received = Σ order_minor`:

- **Per channel**: `planned = Σ stage amounts`, `received = Σ order_minor`, `remaining = planned − received` (negative = over plan).
- **Order**:
  - `remaining = max(0, agreed − received)`;
  - `overpaid = max(0, received − agreed)`;
  - `percentPaid = percent1(received, agreed)`.
- **Totals**: `receivedCny = Σ cny_minor`; `receivedUsd = Σ usd_minor`; `receivedMad = Σ mad_minor`.
- **Average rate** for each foreign currency X that was received: `round(Σ cny_minor[X] × 1e6 ÷ Σ amount_minor[X])`, as a 6-decimal rate.
- **Remaining in CNY** = `convertToCnyMinor(remaining, agreed_rate or 1e6)`. It is null when a non-CNY order has no agreed rate.
- **Profit (D2)** = `receivedCny + remainingCny − expensesTotal`. When `remainingCny` is null and `remaining > 0`, profit is unavailable, with reason `agreed_rate_missing`. When `remaining = 0`, profit needs no rate.
  - **Margin** = `percent1(profit, receivedCny + remainingCny)`.
- **Exchange result** = `receivedCny − convertToCnyMinor(received, agreed_rate or 1e6)`. It is computed on the sum, not per payment, so it matches the totals shown. It is shown for non-CNY orders with a rate, and for CNY orders only when it is not zero, e.g. a USD payment on a CNY order converted by the bank.
- `orders/financials.ts` from 003 gains these fields. Its `agreedPriceCny` (agreed × agreed rate) stays, as the reference value.
- **Rationale**: one place computes every figure, so the Overview, the Payments tab and later reports can never disagree.

## R6. Warnings and the closing rule (FR-021 – FR-023, D3)

- **Decision**:
  - **Warnings** are derived figures in the payments summary: `warnings.overpaid` (amount or null) and `warnings.bankOverInvoice` (amount or null). The invoice total is the agreed price until 006. The payment form computes the same two warnings live, from the summary plus the "counts as" being typed. They never block saving.
  - **Closing rule**: `PATCH /api/orders/:id/status` and `PUT /api/orders/:id` refuse a change to `closed` while `remaining > 0` with `409 balance_outstanding { remaining, currency }`, unless the body carries `confirmOutstanding: true`. The audit entry of a confirmed close adds `outstanding: "133000.00 USD"`.
  - **Currency lock**: a `PUT /api/orders/:id` that changes `currency` while non-deleted payments exist gives `400 validation_failed { currency: "currency_locked" }`.
- **Rationale**: the server enforces the rule wherever the status changes, and the client shows a dialog with the amount, then resends with the confirmation.
- **New error codes**: `balance_outstanding`, `currency_locked`, `plan_total_invalid`, `channel_invalid`, `payment_type_invalid`, `bank_rate_incomplete`, `proof_invalid`. `ApiErrorBody.details` gains `remaining?` and `currency?`.

## R7. Payment proofs, and safe table rebuilds (FR-003)

- **Proofs**:
  - stored with the 003 file store, `kind = 'payment_proof'`;
  - uploaded first with `POST /api/payment-proofs` (payments:create), attached on save, and served by `GET /api/payments/:id/proof` with the same headers as receipts (PDFs downloaded, `sandbox`, `nosniff`, `no-store`);
  - the orphan cleanup also counts files referenced by payments.
- **Allowing the new kind**:
  - `files.kind` has `CHECK (kind IN ('receipt'))`, and SQLite can only change a CHECK by rebuilding the table. drizzle-kit generates that rebuild (`__new_files`, copy, drop, rename).
  - The rebuild drops `files`, which `expenses` references. SQLite's documented procedure for this needs foreign keys **off outside the transaction**, but Drizzle runs all migrations in one transaction, where `PRAGMA foreign_keys` is ignored (checked in the drizzle-orm source).
  - 003 hit the same problem on `orders` and worked around it by hand.
- **Decision**: `runMigrations` follows SQLite's procedure around Drizzle's transaction:
  1. If migrations are pending and the database is a file, copy it first with `VACUUM INTO '<DATA_DIR>/backups/pre-migration-<timestamp>.db'`.
  2. Set `PRAGMA foreign_keys = OFF`.
  3. Run `migrate()`.
  4. Run `PRAGMA foreign_key_check`. If it reports any row, stop the server with the list.
  5. Set `PRAGMA foreign_keys = ON`.

  Drizzle-generated rebuilds then work as designed, here and in later features. The generated rebuild SQL is still reviewed for correct column copies, which is the bug seen in 003.
- **Rationale**: SQLite's documented 12-step procedure for table changes (foreign keys off, change, `foreign_key_check`, foreign keys on), plus a copy of the database for constitution IV.
- **Alternatives considered**:
  - reusing `kind = 'receipt'` for proofs: misleading, and 007 needs more kinds anyway;
  - a separate proofs table: duplicates the file store.

## R8. Settings (FR-027)

- **Decision**:
  - A `payment_settings` row (id = 1) holds `direct_channel_name` and `bank_channel_name`. Both are null by default, meaning the translated names. A name typed by the Owner shows in every language, like a renamed category in 003.
  - The **default plan** is `default_payment_stages` (R4).
  - The **bank list** is a `chinese_banks` table `(id, name, position)`, seeded with Bank of China, ICBC, ABC and CCB. Names are unique after `hj_norm`. Removing a bank deletes its row, audited; payments keep the bank name as text.
  - **API**: `GET` / `PATCH /api/settings/payments` (owner) reads and changes all three, with one audit entry per change. Forms read `GET /api/payments/config` (payments:view), which returns the channel names and the bank list.
  - **Auto-fill** reuses the 003 `rate_settings.auto_fill`. Its label becomes "Fill rates automatically (expenses and payments)".
- **Rationale**: like 003 categories, the defaults follow the language and the typed names win.

## R9. Permissions (FR-028, D6)

- **Decision**:
  - A `payments` policy module. Routes use `payments:view|create|edit|delete`; settings use `owner`.
  - **Channels are separately restrictable**: every payment read and write also checks `requireChannel(viewer, channel, action)`, with the scopes `payments.direct` and `payments.bank`. Lists and summaries leave out the channels the viewer may not see. It is Owner-only until 005, which fills the matrix (Direct restricted to the Owner).
  - **Sensitive fields**:
    - `payment`: `amount`, `rates`, `bankConversion`, `cnyAmount`, `countsAs`, `usdAmount`, `madAmount`, `marketRate`;
    - `paymentSummary`: everything except the channel names;
    - `order.financials` (already sensitive) gains the new figures;
    - `paymentPlan`: `amount`.
- **Rationale**: 005 can restrict the Direct channel without touching 004's code paths.

## R10. Payment form and Payments tab (UI)

- **Payment form** (`/orders/:id/payments/new?channel=direct`, `/payments/:id/edit`), full screen on phones with a sticky Save button. Sections:
  1. Channel, type, amount + currency, date, reference.
  2. The **rate block**: USD→CNY and MAD→CNY (plus EUR→CNY when needed), each with "1 CNY = … " under it; one "Fetch rate" button for all; a source label.
  3. The **bank conversion** block, shown with "Add the bank's rate" for non-CNY payments: rate, bank (a select of the list plus "Other…"), buying/selling/other, and a date-time defaulting to now.
  4. A **live results** card:
     - CNY value, USD value and MAD value;
     - "Counts as X USD" with an Edit control;
     - for foreign currencies, a comparison row of three rates (Market · Bank · Customer), "CNY actually received" and the gap, e.g. "−0.7% vs market";
     - the overpayment and bank-over-invoice warnings.
  5. Proof (the 003 `ReceiptInput`, with an upload-path prop) and notes.

  The edit form keeps "counts as" when it was typed by hand.
- **Payments tab**:
  - a **summary card**: total received, remaining, % paid; the received totals in CNY, USD and MAD; average rates; the exchange result;
  - **two channel sections**, each with planned / received / remaining and its payments, and its own "Add payment" button;
  - a **plan card** with "Edit plan";
  - the **history**: cards on phones, a table from the `sm` breakpoint (the page never scrolls sideways, FR-029);
  - warnings, and "Show deleted payments".
- **Closing confirmation**: the order header's status select and the order form catch `409 balance_outstanding`, show a dialog with the amount, and resend with `confirmOutstanding: true`.

## R11. Effect on earlier features

- The 003 financial summary gains received, remaining and the exchange result, and its profit follows D2. The 003 tests still hold, because with no payments, D2 profit equals the 003 profit.
- `policies002.test.ts`: the order routes added here (`/payments`, `/payment-plan`) use the `payments` module and are excluded from the 002 route check, as 003 did for `/expenses`.
- The file store's `saveReceipt` becomes `saveFile(kind)`. The rule that an uploaded file can be attached only once now covers both expenses and payments.
