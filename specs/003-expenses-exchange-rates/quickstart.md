# Quickstart: Expenses and Exchange-Rate Service (003)

```bash
npm run dev          # migrations for 003 apply on start; the default rate provider needs no key
npm test
npm run test:e2e
```

Integration tests never reach the real providers: the server's HTTP client is injectable, and tests pass a fake that serves fixed rates or simulates outages.

## Validation scenarios

| ID | Scenario | Expected |
|---|---|---|
| X1 (US1, AC1, SC-002) | Add 10 expenses (CNY, USD, MAD, EUR, some to pay) to one order | Each listed by name; category totals, unpaid total and grand total equal the sum of the line CNY amounts exactly |
| X2 (US1) | 1,200 USD at 7.10 | 8,520.00 CNY shown live and saved; the rate is stored as 7.100000 |
| X3 (US1, FR-006) | Take a receipt photo on the phone, save, open the receipt | The photo is attached, reduced in size, and served only to a signed-in user with the right headers |
| X4 (US1) | Save with a missing name, category, amount, or rate for USD | Field errors in the current language; the typed data and the photo are kept |
| X5 (US2) | Order of 190,000 USD at an agreed rate of 7.10, expenses 1,203,500 CNY | Profit 145,500.00 CNY, margin 10.8% |
| X6 (US2) | A USD order from 002 with no agreed rate | "Set the agreed rate to see profit" with a link. Editing requires the rate |
| X7 (US2) | Budget 1,200,000 CNY, expenses 1,203,500 CNY, 40,000 to pay | Budget used 100.3% (highlighted); unpaid 40,000.00 |
| X8 (US3, FR-016, SC-005) | Fake provider: fetch USD twice on the same day, then refresh | One provider call for the two fetches; the refresh makes a second call |
| X9 (US3, FR-015) | Fetch a back-dated rate (2026-09-01) | Rate for 2026-09-01, `exact: true`; with the open-access provider, the latest rate with `exact: false` and its own date |
| X10 (US3, FR-018, SC-004) | Fake provider times out | `503 rates_unavailable` within 5 s; the UI shows the message; the expense saves with a typed rate |
| X11 (US3, FR-005) | Type 71.0 for USD when the latest rate is 7.10 | Warning shown; saving still allowed |
| X12 (US3, SC-003) | Save an expense at 7.10, then the cache gets 7.25 | The expense still shows 7.10 and the same CNY amount |
| X13 (US4) | Edit an amount, mark to-pay as paid, delete and restore | Totals and profit follow each step; 4 audit entries with before/after |
| X14 (US5) | Ahmed 2,000 + 1,500 (two orders), Li 800; mark 2,000 reimbursed | Dashboard: Ahmed 1,500.00, Li 800.00 |
| X15 (US6) | Add "Spare parts", use it, rename it, hide it | Offered, then shown with the new name, then not offered but kept on the expense |
| X16 (FR-024, SC-007) | Change the provider and the key | Audit shows the provider change; the key never appears |
| X17 (FR-025) | Delete a supplier used only as "paid to" on an expense | `409 in_use` |
| X18 (FR-023) | A worker calls every new route | `403` (except `GET /api/rates` and `GET /api/rates/config`, which are authenticated) |
| X19 (FR-026, SC-008) | E2E: expense form, Expenses tab, settings sections in EN/FR/AR at 360px | Correct `dir`, no sideways scroll, Western digits |
