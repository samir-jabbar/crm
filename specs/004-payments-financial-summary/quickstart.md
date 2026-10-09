# Quickstart: Payments and Order Financial Summary (004)

```bash
npm run dev          # 004 migrations apply on start (a copy of app.db goes to DATA_DIR/backups first)
npm test
npm run test:e2e
```

As in 003, tests never reach a real rate provider: integration tests inject a fake HTTP client, and the e2e server uses the local fake provider.

## Validation scenarios

The worked example is an order of **190,000 USD at an agreed rate of 7.10** (1,349,000.00 CNY), with the default plan and **1,203,500.00 CNY of expenses**.

| ID | Scenario | Expected |
|---|---|---|
| P1 (US1, AC2, SC-002) | Record 57,000 USD Direct, then 133,000 USD Bank | After the first: Direct 57,000 / 57,000 / 0; Bank 133,000 / 0 / 133,000; order received 57,000, remaining 133,000, 30.0%. After the second: everything remaining 0.00, 100.0% |
| P2 (US1, FR-005) | Open the Payments tab | History lists date, channel, amount and currency, MAD/CNY, USD/CNY, CNY, source, newest first |
| P3 (US1, FR-003) | Attach a photo proof, open the payment | The proof is served only to a signed-in user with the right headers |
| P4 (US1) | Save with a missing amount, type, date, USD or MAD rate | Field errors in the current language; the typed data and the proof are kept |
| P5 (US2, AC3, SC-003) | USD 133,000, market 7.10, bank 7.05 (Bank of China, buying, 10:30) | CNY 937,650.00; gap −6,650.00 CNY and −0.7%; Market · Bank · Customer = 7.10 · 7.05 · 7.10 |
| P6 (US2, FR-011) | Save P5, then the rate cache gets 7.25 | The payment keeps every rate and value |
| P7 (US2, FR-007) | Fetch rates for a payment dated 2026-09-01; then with the provider down | Rates of that date, labelled; down: the message, and saving with typed rates still works |
| P8 (US2, FR-009) | 570,000 MAD on the USD order at MAD 0.71 / USD 7.10; then override "Counts as" to 56,800 | 404,700.00 CNY, counts as 57,000.00 USD; after the override: 56,800.00 (manual), CNY unchanged |
| P9 (US3, FR-017) | Before any payment, with the example expenses | Profit 145,500.00 CNY (as in 003) |
| P10 (US3, FR-017, FR-019) | P1 payments, the Bank one converted at 7.05 | Received 1,342,350.00 CNY; profit 138,850.00; margin 10.3%; exchange result −6,650.00; average USD/CNY 7.065000 |
| P11 (US3, FR-018) | An order from 002 with no agreed rate: partly paid, then fully paid | "Set the agreed rate to see profit" while money remains; profit shown once remaining is 0 |
| P12 (US4, FR-013) | Change the default plan to 40/60, create an order; check an order from before 004 | The new order has 40/60; the older order has the 30/70 default |
| P13 (US4, FR-014) | Edit a plan to 20 Direct + 10 Bank + 70 Bank; then 90% in total | Direct planned 20%, Bank 80%; a 90% total gives `plan_total_invalid` |
| P14 (US4, FR-027) | Rename "Direct payments", add a bank, remove ICBC | The new name shows in EN/FR/AR; the bank list follows; old payments keep "ICBC" |
| P15 (US5, FR-021) | Payments above the agreed price; Bank above the invoice | Both warnings show on the form and the tab; saving is not blocked |
| P16 (US5, FR-022) | Close an order with 133,000 USD remaining | `409 balance_outstanding`; the dialog shows the amount; confirming closes it, with an audit entry |
| P17 (FR-023) | Change the currency of an order with payments | `currency_locked` |
| P18 (US6, SC-008) | Edit an amount, delete and restore a payment | Totals follow; 3 audit entries with before/after |
| P19 (FR-028) | A worker calls every new route | `403` everywhere |
| P20 (FR-029, SC-009) | E2E: Payments tab, payment form, plan editor, settings section in EN/FR/AR at 360px | Correct `dir`, no sideways scroll, Western digits |
| P21 (R7) | Run the 004 migrations on a copy of a 003 database | Expenses keep their receipts, every order has a plan, `foreign_key_check` is empty, and a pre-migration copy exists in `DATA_DIR/backups` |
