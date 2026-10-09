# Quickstart: Workers and Permissions (005)

## Setup

```bash
npm install
npm run db:migrate -w @hanjing/server   # applies 0008–0009; makes a pre-migration copy in DATA_DIR/backups
npm run dev
```

**Seed for the scenarios**:
- The Owner `hicham` (001).
- Five orders, HJ-2026-001 to 005, across the customers "Atlas Engins" and "Sahara BTP":
  - HJ-2026-003: agreed price **777,123.45 USD** (a sentinel), agreed rate 7.10;
  - an equipment-purchase expense of **88,888.88 CNY**, paid to the supplier "Shandong Lingong";
  - a hotel expense of 1,200 CNY;
  - a Bank payment of **31,415.92 USD** with a proof;
  - a Direct payment of 20,000 USD.
- Customer "Atlas Engins" phone: **+212 600 99 88 77**.

Workers register through the app.

## Validation scenarios

| # | Story / rule | Steps | Expected |
|---|---|---|---|
| W1 | US1, FR-001, FR-002 | Register `youssef` (display name "Youssef", French), then sign in | `201 pending`. Sign-in with the right password: "waiting for the Owner's approval"; with a wrong one: the generic message |
| W2 | US1, FR-003, FR-004 | As the Owner, open Users | "1 pending" in the navigation; the registration shows time, device and location. Approve with "Read-only": Youssef signs in, in French |
| W3 | US1, FR-005 | Register `test1`, reject it, register `test1` again | The first cannot sign in; the second registration succeeds |
| W4 | US1, FR-006 | Close registration; then from one network origin, try 6 registrations with it open | Closed: no Register link and `403 registration_closed`. Open: the 6th gives `429` |
| W5 | US2, FR-007–FR-013 | A worker with Expenses View + Create on all orders | The order page shows the header and only the Expenses tab; adding works; edit, delete, payments, settings and audit are refused through the UI and directly |
| W6 | US2, FR-014 | Remove Expenses Create while the worker is signed in, then save an expense | Refused at once, with no new sign-in |
| W7 | US2, FR-016, FR-029 | A worker with Bank payments View only | Payments tab: only the Bank section, payments and stages. No "Direct" anywhere; no total received, remaining, % paid, profit or average rate |
| W8 | US2, FR-017 | Edit the "Accountant" template; approve a new worker with it | The new worker gets the edit; an older accountant keeps the old set until "Apply template" |
| W9 | US2, FR-011 | A worker with every module granted tries Users, the audit log, session timeout and registration open/closed | All refused |
| W10 | US3, FR-018–FR-020 | "Assigned orders" scope with HJ-2026-001 and 003; search "HJ-2026-00", "Atlas", "Sahara"; request HJ-2026-002 by id | Only 001 and 003 appear; 002 gives `404` |
| W11 | US3, FR-018 | "Selected customers" = Atlas; create a new Atlas order as the Owner | The worker sees it without any change |
| W12 | US3, FR-021, FR-028 | "Own entries only": the worker adds 2 expenses to HJ-2026-003 | Sees their 2 expenses with "Your entries" totals, never 88,888.88 or the order total |
| W13 | US3, FR-023 | Set the access end date to yesterday (China date) | Sessions end at the next request; sign-in says "Your access ended on …"; the list shows "Access ended"; a future date restores access |
| W14 | US4, FR-025–FR-027 | `sellingPrice` hidden, Orders View + Bank payments View | No 777,123.45, item price, profit, margin, remaining, % paid, planned amount or warning in any response; Bank payment amounts are shown |
| W15 | US4, FR-025, FR-033 | `paymentAmounts` hidden, Bank payments View | Payments show date, type and reference only; the proof gives `404`; 31,415.92 appears nowhere |
| W16 | US4, FR-030 | `customerContacts` hidden; search customers for "600 99 88" | Nothing found; no phone, email or notes on customer pages |
| W17 | US4, FR-025 | `supplierPrices` hidden, Expenses View on all entries | The purchase line is shown without an amount; its receipt gives `404`; the grand total, purchase total, unpaid total, budget used and profit are absent; the hotel category total is shown |
| W18 | US4, FR-031, FR-032 | `sellingPrice` hidden with Orders Edit: change the delivery date; try Orders Create and status Closed | The price and items are unchanged; item lines are read-only; the editor refuses Create with an explanation; "Closed" is not offered and is refused directly |
| W19 | US5 AC6 | Shipments + Documents only, prices hidden, assigned HJ-2026-001 and 003 | Sees exactly 2 orders with only the Shipments and Documents tabs ("coming in a later update"); the sentinel sweep finds nothing else (SC-001) |
| W20 | US5 examples | Logistics, Site/trip assistant and Accountant from the templates | Each automated suite passes (SC-002) |
| W21 | US6, FR-035–FR-039 | Force logout on 2 devices; suspend and reactivate; reset the password; delete | Sessions end at the next request; suspended and deleted accounts cannot sign in; the reset forces a new password first; after deletion, records keep the worker's name and the username cannot be registered again |
| W22 | FR-041 | After W1–W21, filter the audit log | Every registration, approval, rejection, access change, template change, assignment and account action is present, with before and after values |
| W23 | FR-043, SC-008 | E2E: Register, Users, a worker's page, the permission editor and templates in EN/FR/AR at 360 px | Correct direction, no sideways scroll, Western digits |
| W24 | Migration | Run 0008–0009 on a copy of a 004 database | The Owner is unchanged; 5 templates exist; `foreign_key_check` is empty; a pre-migration copy exists |
