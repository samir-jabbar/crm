# Quickstart: Customers, Suppliers and Orders (002)

How to run, test, and validate this feature against the spec. Setup is the same as 001; see [README](../../README.md).

```bash
npm run dev                 # http://localhost:5173 (sign in as the Owner created in 001)
npm test                    # unit + API integration
npm run test:e2e            # Playwright, mobile 360×800 + desktop
```

The migrations for 002 apply automatically when the server starts.

## Validation scenarios

| ID | Scenario | Expected |
|---|---|---|
| V1 (US1, SC-001) | On a 360px phone, create an order with a new customer (created inline) and two items | Saved in under 2 minutes as `HJ-<year>-001`; the next order is `-002` |
| V2 (US1) | Items 2 × 85,000 + 1 × 12,500, agreed price 190,000 USD | Item total 182,500.00; difference +7,500.00; saving is allowed |
| V3 (US1) | Save with a missing title, customer or item quantity | Fields highlighted with translated messages; the typed data is kept |
| V4 (FR-009, SC-003) | Integration: 50 orders created concurrently, plus a year change with the test clock | All numbers unique and consecutive; the first order after 1 Jan (China time) is `-001` |
| V5 (US2, SC-006) | Search "doosan", "éloïse" (stored "Éloïse"), "汉景", and Arabic with and without vowel marks | All matching orders and customers found |
| V6 (US2) | Filter by status (2 codes) + customer + date range, then clear | Correct subsets; clearing restores the full list |
| V7 (US2) | Change the status from the order header | The header updates; audit `record.updated` with status before/after |
| V8 (US2, FR-015) | Open every tab on a 360px phone | No sideways scroll; unbuilt tabs show "coming soon" in the current language |
| V9 (US3) | Create a customer with an Arabic name, then another with the same name | Saved exactly; the second shows the duplicate warning and saves after confirming |
| V10 (US3) | Open a customer page and a supplier page | Their orders are listed, newest first |
| V11 (US4, SC-004) | Duplicate an order with 3 items | New number, Draft, items copied, no notes, in under 15 s |
| V12 (US4) | Add two notes, delete one | Newest first, with author and time; the deletion is audited |
| V13 (US5, SC-008) | Delete an order, check list and search, restore it | Hidden, then back with the same number and items; the number is never reused |
| V14 (US5) | Delete a customer with orders | `409 in_use` with the count; a translated message |
| V15 (US6) | Change the prefix to `HJM`, create an order | `HJM-<year>-<next>`; older numbers unchanged |
| V16 (FR-023, SC-005) | Integration: create, edit, delete and restore for each entity | One audit entry each, with before/after on edits |
| V17 (FR-024) | Integration: every new route has a module/action policy; signed-out access gets 401, a worker gets 403 | Deny by default holds |
| V18 (SC-002) | Integration: 5,000 orders seeded, search and filter | Each response in < 1 s |
| V19 (FR-025, SC-007) | E2E: every new screen in EN/FR/AR at 360px | `dir` correct, no sideways scroll, Western digits in amounts |
