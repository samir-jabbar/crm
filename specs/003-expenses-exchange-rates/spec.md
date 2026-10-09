# Feature Specification: Expenses and Exchange-Rate Service

**Feature Branch**: `003-expenses-exchange-rates`
**Created**: 2026-10-07
**Status**: Draft
**Input**: User description: "Feature 003 'Expenses and exchange-rate service' for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry '003 Expenses and exchange-rate service') and the brief sections it lists. Build on features 001-002. Specify only the In-scope items."

## Context

Feature 002 gave every order a page with an agreed price. This feature records **every real cost** against its order and shows the order's **profit** in CNY, the base currency (ROADMAP D1).

Costs come in four currencies: CNY, USD, MAD and EUR. Each expense keeps:
- its own amount and currency;
- the exchange rate used on the day.

That rate never changes afterwards. An exchange-rate service suggests current rates, and the user can always type their own.

Decisions made for this feature (2026-10-07):
- **Profit uses the agreed rate saved on the order.** When an order is not priced in CNY, it stores the rate agreed at the deal (e.g. 1 USD = 7.10 CNY), and profit converts the agreed price with it. Feature 004 refines this with the real rates of received payments (ROADMAP D2).
- **Who was paid, and who advanced the money.** An expense records who was paid: a supplier from the address book, or any typed name (e.g. "Driver Li"). It also records how it was paid (cash, bank, other). When someone advanced the money, for example an assistant who paid a hotel in cash, it records that person too, so the Owner can see what to reimburse to whom. This answers brief §10 Q9.

Brief references: §3 (Expense, Settings: exchange-rate service), §4.2, §6, §7 (tests for money calculations), §9 AC1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Record expenses on an order from the phone (Priority: P1)

On site in Linyi, the Owner opens an order and taps "Add expense". The form is short and phone-friendly:
- a name, e.g. "Trucking Linyi to Qingdao port";
- a category;
- an amount and its currency;
- the date (today by default);
- optionally, a photo of the receipt taken with the camera.

For a foreign currency, the rate to CNY is filled in from today's rates and can be changed. Saving takes a few seconds. The expense appears in the order's Expenses tab, listed by name, with totals by category and a grand total in CNY. The order's profit updates at once.

**Why this priority**: knowing the real cost of each order is the main reason the app exists. It is brief §9 acceptance criterion 1.

**Independent Test**: on a phone, add 10 different expenses to one order, in several currencies. Check that each is listed by name, that the category totals and grand total are exact to the cent, and that the profit changes after each save.

**Acceptance Scenarios**:

1. **Given** an order page, **When** the Owner adds an expense of 3,500 CNY named "Trucking Linyi to Qingdao port" in "Inland transport in China", **Then** it appears in the Expenses tab with its name, date and amount, and the category total and grand total include it.
2. **Given** an expense in USD, **When** the Owner enters 1,200 USD and the rate shows 7.10, **Then** the form shows 8,520.00 CNY before saving, and the saved expense keeps 1,200 USD at 7.10 = 8,520.00 CNY.
3. **Given** the receipt is at hand, **When** the Owner takes a photo in the form, **Then** the photo is attached to the expense and can be opened from it later.
4. **Given** 10 expenses on Order #1, **When** the Owner opens the order, **Then** every expense is shown by name and tied to Order #1, and the totals match the sum of the individual CNY amounts.
5. **Given** a required field is missing (name, category, amount, currency, date, or a rate for a non-CNY amount), **When** the Owner saves, **Then** the field is highlighted with a message in their language, and nothing typed (including the photo) is lost.

---

### User Story 2 — See the order's costs and profit in CNY (Priority: P2)

On the order page, the summary shows:
- the agreed price and its value in CNY at the agreed rate;
- total expenses;
- profit and margin;
- unpaid expenses;
- budget used.

All figures are in CNY. For an order priced in USD, MAD or EUR, the Owner enters the agreed rate on the order once, or fetches today's rate as a starting point. Orders created before this feature that have no agreed rate show "Set the agreed rate to see profit", with a link to do it.

**Why this priority**: profit per order is the number the Owner checks most. It depends on US1 having costs to subtract.

**Independent Test**: on an order of 190,000 USD with an agreed rate of 7.10, record expenses totalling 1,203,500 CNY. Check that the profit shows 145,500.00 CNY and the margin 10.8%. Change the agreed rate and check that the profit follows.

**Acceptance Scenarios**:

1. **Given** an order of 190,000 USD with agreed rate 7.10 (1,349,000.00 CNY) and expenses of 1,203,500.00 CNY, **When** the Owner opens the order, **Then** profit shows 145,500.00 CNY and margin 10.8%.
2. **Given** an order priced in CNY, **When** the Owner views it, **Then** no agreed rate is asked for and profit is the agreed price minus expenses.
3. **Given** a USD order created before this feature with no agreed rate, **When** the Owner opens it, **Then** the summary shows total expenses and the message "Set the agreed rate to see profit", with a link to edit the order.
4. **Given** a new or edited order not priced in CNY, **When** the Owner saves it without an agreed rate, **Then** the rate field is highlighted as required.
5. **Given** expenses marked "to pay" of 40,000 CNY, **When** the Owner views the summary, **Then** "Unpaid expenses: 40,000.00 CNY" is shown. These expenses still count in total costs and profit.
6. **Given** a budget of 1,200,000 CNY and expenses of 1,203,500 CNY, **When** the Owner views the summary, **Then** budget used shows 100.3%, highlighted as over budget.

---

### User Story 3 — Get exchange rates in one tap, or type them (Priority: P3)

When entering a foreign-currency expense or an order's agreed rate, the Owner taps "Fetch rate" and gets the rate to CNY, labelled with its date and source. They can still type a different rate, for example the one their bank or agent actually applied.

In Settings, the Owner:
- chooses the rate provider and enters its access key if the provider needs one;
- turns automatic filling on or off;
- presses "Refresh rates";
- sees when rates were last fetched.

If the provider cannot be reached, the app says so clearly, and the Owner types the rate by hand. Nothing else is blocked.

**Why this priority**: it saves typing and mistakes, but expenses still work with rates typed by hand.

**Independent Test**: configure a provider, fetch a USD rate on the expense form, and confirm it is labelled with its date. Then make the provider unavailable and confirm that the form shows a clear message and still saves with a typed rate. Check that the provider is contacted at most once per currency per day.

**Acceptance Scenarios**:

1. **Given** a working provider and auto-fill on, **When** the Owner chooses USD on a new expense, **Then** the rate is filled with the latest USD→CNY rate, labelled with the rate date and "Automatic".
2. **Given** an automatic rate, **When** the Owner changes it, **Then** the saved expense records the typed rate and the source "Automatic, then edited".
3. **Given** the provider is unreachable, **When** the Owner taps "Fetch rate", **Then** within a few seconds a message says rates are unavailable and invites manual entry, and the expense can be saved with a typed rate.
4. **Given** rates were fetched this morning, **When** the Owner fetches USD again in the afternoon, **Then** the same day's rate is reused without contacting the provider again.
5. **Given** an expense saved last week at 7.10, **When** today's rate becomes 7.25, **Then** the saved expense still shows 7.10 and its CNY amount does not change.
6. **Given** an expense dated in the past, **When** the Owner fetches the rate, **Then** the rate for that date is used if the provider offers it. Otherwise the most recent rate is used, labelled with its own date so the difference is visible.

---

### User Story 4 — Keep costs accurate: paid or to pay, edits and deletions (Priority: P4)

Each expense is either **paid** or **to pay**, with an optional due date. The Owner can correct any expense: name, category, amount, currency, rate, date, or who was paid. They can mark an expense as paid, or delete one entered by mistake and restore it later.

Every change is kept in the audit log: who changed what, and when, with the old and new values. The expense itself shows who created it and who last changed it.

**Why this priority**: mistakes happen on a phone. The brief requires an audit trail for expenses (§4.2) and recoverable deletion (§6).

**Independent Test**: edit an expense's amount and rate, mark a "to pay" expense as paid, delete an expense and restore it. Check that totals and profit follow each change and that the audit log lists every step.

**Acceptance Scenarios**:

1. **Given** an expense of 1,200 USD at 7.10, **When** the Owner corrects it to 1,250 USD, **Then** the CNY amount becomes 8,875.00, totals and profit update, and the audit log shows the old and new amount.
2. **Given** an expense "to pay" due on 15 November, **When** the Owner marks it paid, **Then** it leaves the unpaid total and the change is audited.
3. **Given** an expense entered twice by mistake, **When** the Owner deletes one (with confirmation), **Then** it disappears from the list and totals. It can be restored from "Show deleted expenses".
4. **Given** an expense, **When** the Owner opens it, **Then** it shows who created it and when, and who last changed it and when.

---

### User Story 5 — See what to reimburse to whom (Priority: P5)

An assistant paid a hotel in cash for the Owner's trip. The expense records "Advanced by: Ahmed".
- The order's Expenses tab shows a total per person who advanced money.
- The dashboard shows a "To reimburse" block, with each person and the amount still owed across all orders.

When the Owner pays Ahmed back, they mark those expenses as reimbursed.

**Why this priority**: the answer to brief §10 Q9. Useful, but not needed to track order costs.

**Independent Test**: record three expenses advanced by two people across two orders. Check the per-person totals on the dashboard, mark one as reimbursed, and check that the amount owed drops.

**Acceptance Scenarios**:

1. **Given** expenses advanced by Ahmed (2,000 CNY and 1,500 CNY on two orders) and by Driver Li (800 CNY), **When** the Owner opens the dashboard, **Then** "To reimburse" shows Ahmed 3,500.00 CNY and Driver Li 800.00 CNY.
2. **Given** Ahmed's 2,000 CNY expense, **When** the Owner marks it reimbursed, **Then** Ahmed's amount owed becomes 1,500.00 CNY, and the expense shows "Reimbursed".
3. **Given** a new expense, **When** the Owner types in "Advanced by", **Then** names already used are suggested, so the same person is not entered twice with different spellings.

---

### User Story 6 — Use and adapt expense categories (Priority: P6)

Expenses start with the brief's categories, shown in the user's language:
- Equipment purchase
- Inland transport in China
- Port and loading
- Sea freight
- Insurance
- Customs clearance (China)
- Customs and duties (Morocco)
- Labor
- Hotel and accommodation
- Local travel
- Commission
- Bank fees
- Other

In Settings, the Owner can add their own categories (e.g. "Spare parts"), rename them, and hide categories they never use. Hidden categories are no longer offered, but existing expenses keep them.

**Why this priority**: the defaults cover most needs, and adapting them is occasional.

**Independent Test**: add a category, use it on an expense, rename it and check the expense shows the new name, then hide it and check it is no longer offered while the expense keeps it.

**Acceptance Scenarios**:

1. **Given** the default categories, **When** the Owner switches to French or Arabic, **Then** the category names appear in that language.
2. **Given** Settings, **When** the Owner adds "Spare parts", **Then** it is offered on the expense form and appears in category totals.
3. **Given** a category used by expenses, **When** the Owner hides it, **Then** it is no longer offered for new expenses, and existing expenses and totals keep it.

---

### Edge Cases

- **CNY amounts**: the rate is always 1, and no rate is asked for.
- **Weekends and holidays**: the fetched rate is the latest published one. It is labelled with its own date.
- **No provider configured, or the provider is down**: all rates are typed by hand. Nothing is blocked, and the form says why automatic rates are unavailable.
- **Rate typos** (e.g. 71.0 instead of 7.10 for USD): when the typed rate differs from the latest known rate by more than 20%, a warning shows before saving. Saving is still allowed.
- **Rounding**: the CNY amount is the amount × rate rounded to the nearest cent, with half a cent rounded up. Totals add the rounded CNY amounts, so the totals always equal the sum of the lines shown.
- **Large photos on slow links**: photos are reduced on the phone before upload. An upload that fails keeps the form and the photo, so it can be retried.
- **Receipt files**: unsupported types (anything other than images and PDF) or files over 10 MB are refused with a clear message.
- **Order deleted (002)**: its expenses disappear with it from totals and reimbursements. Restoring the order brings them back.
- **Supplier used by expenses**: it cannot be deleted. This extends 002's "in use" rule.
- **Agreed rate changed later**: profit follows the new rate, because it is the deal's reference. The change is audited.
- **Future-dated expenses**: allowed, for planned costs recorded as "to pay" with a due date.
- **Hidden category**: still shown on existing expenses, and can be shown again from Settings.

## Requirements *(mandatory)*

### Functional Requirements

**Expenses**

- **FR-001**: The Owner MUST be able to add an expense to an order, from the order page, with:
  - name (required, free text);
  - category (required);
  - amount (required, more than 0, up to 2 decimals);
  - currency (CNY, USD, MAD or EUR);
  - date (required, default today);
  - rate to CNY (required when the currency is not CNY);
  - paid to: a supplier from the address book, or a typed name (optional);
  - payment method: cash, bank or other (default cash);
  - advanced by: a person's name (optional);
  - status: paid or to pay (default paid), with an optional due date;
  - receipt: one optional photo or PDF;
  - notes.
- **FR-002**: Every expense MUST belong to exactly one order.
- **FR-003**: The rate MUST be entered as "1 unit of the currency = X CNY", with up to 6 decimals. The amount in CNY MUST be computed as amount × rate, rounded to the cent (half a cent up), and shown live on the form before saving.
- **FR-004**: Each saved expense MUST keep:
  - its rate to CNY;
  - the rate's source (manual, automatic, or automatic then edited);
  - when known, the USD→CNY and MAD→CNY rates of its date, for later USD and MAD reports.
  These values MUST never change unless the Owner edits the expense (ROADMAP D1, brief §6).
- **FR-005**: A typed rate that differs by more than 20% from the latest known rate for that currency MUST show a warning before saving. The warning MUST NOT block saving.
- **FR-006**: The receipt MUST accept a photo taken with the phone camera or a chosen image or PDF file, up to 10 MB. Photos MUST be reduced in size on the device before upload. The receipt MUST be viewable from the expense, and only by signed-in users allowed to see the expense.
- **FR-007**: The Owner MUST be able to edit every field of an expense, and to mark it paid or to pay. A change of amount, currency or rate MUST recompute its CNY amount.
- **FR-008**: The Owner MUST be able to delete an expense (with confirmation) and restore it from a "Show deleted expenses" view (recoverable deletion from 001).
- **FR-009**: Each expense MUST show who created it and when, and who last changed it and when. Every create, edit, delete and restore MUST be in the audit log with the previous and new values.

**Order expenses and profit**

- **FR-010**: The order page's Expenses tab MUST list the order's expenses, newest date first. Each row shows the name, category, date, original amount and currency, CNY amount, paid or to-pay status, and a receipt marker. The tab also shows:
  - totals by category;
  - total unpaid;
  - a grand total, all in CNY;
  - totals per person who advanced money.
- **FR-011**: An order not priced in CNY MUST store an **agreed rate to CNY**. It is required when creating or editing such an order, can be filled with "Fetch rate", and its changes are audited. CNY orders use 1.
- **FR-012**: The order summary MUST show, in CNY:
  - agreed price (converted at the agreed rate);
  - total expenses (paid and to pay);
  - profit = agreed price in CNY − total expenses;
  - margin = profit ÷ agreed price in CNY, as a percentage with one decimal;
  - unpaid expenses;
  - budget used (total expenses ÷ budget, when a budget is set), highlighted when over 100%.
  Every figure MUST update as soon as an expense is saved, changed or deleted.
- **FR-013**: An order not priced in CNY that has no agreed rate (orders created before this feature) MUST show total expenses and a "Set the agreed rate to see profit" message linking to the order's edit page, instead of a profit figure.

**Exchange-rate service**

- **FR-014**: Settings MUST let the Owner:
  - choose the rate provider from the supported list;
  - enter its access key if needed (stored securely and never shown again in full);
  - turn automatic filling on or off;
  - press "Refresh rates";
  - see the last successful fetch time and status.
  The supported providers MUST cover MAD and CNY.
- **FR-015**: "Fetch rate" on the expense form and on the order's agreed rate MUST:
  - return the rate to CNY for the chosen date when the provider offers it, otherwise the latest rate;
  - label the result with its date and source;
  - leave the value editable.
- **FR-016**: Rates MUST be kept for reuse. The provider MUST be contacted at most once per day per currency, except when the Owner presses "Refresh rates".
- **FR-017**: When automatic filling is on, choosing a non-CNY currency on a new expense MUST fill the rate field if it is empty. It MUST never replace a rate the user has typed.
- **FR-018**: When no provider is configured or the provider fails, the app MUST say so in the user's language within a few seconds, and every rate field MUST remain typeable. Expense entry MUST never be blocked by the rate service.

**Reimbursements**

- **FR-019**: "Advanced by" MUST suggest names already used. An expense with an advanced-by person MUST have a "reimbursed" flag that the Owner can switch.
- **FR-020**: The dashboard MUST show a "To reimburse" block, with the amount owed in CNY per person across all non-deleted orders. The amount owed is the sum of the person's non-reimbursed, non-deleted expenses. Each line MUST link to those expenses.

**Categories**

- **FR-021**: The app MUST provide the 13 default categories, displayed in the user's language.
- **FR-022**: In Settings, the Owner MUST be able to:
  - add categories (any script);
  - rename categories (renaming a default replaces its translated name with the typed one);
  - hide and show categories.
  Hidden categories are not offered for new expenses but stay on existing ones. Categories MUST NOT be deletable.

**Permissions, audit, usability**

- **FR-023**: All new screens and data MUST go through the permission gate with the "expenses" module and its actions (view, create, edit, delete). Receipts are served only through it. Expense amounts, rates, profit, margin and budget figures MUST be declared sensitive, so feature 005 can hide them (ROADMAP D6).
- **FR-024**: Changes to the exchange-rate settings and categories MUST be in the audit log. The access key itself MUST never be written there.
- **FR-025**: Deleting a supplier MUST be refused while non-deleted expenses name it as "paid to". This extends 002 FR-021.
- **FR-026**: Every screen of this feature MUST work on a 360-pixel-wide phone without sideways scrolling, in English, French and Arabic, with Western digits in all amounts and rates.

### Key Entities

- **Expense**: one real cost of one order.
  - Fields: name, category, amount, currency, rate to CNY, rate source, CNY amount, USD→CNY and MAD→CNY rates of its date (when known), date, paid to (supplier or typed name), payment method, advanced by, reimbursed flag, status (paid / to pay), due date, receipt, notes, created by/at, updated by/at, recoverable-deletion data.
- **Expense category**: a default (translated) or user-added category, with its display order and a hidden flag.
- **Receipt file**: the stored photo or PDF of an expense. Only the expense it belongs to can reach it.
- **Exchange rate**: a rate from USD, MAD or EUR to CNY, for a date, with its source (the provider) and when it was fetched. Kept for reuse.
- **Exchange-rate settings**: provider, access key (secret), auto-fill on/off, last fetch time and status.
- **Order** (from 002): gains the agreed rate to CNY, which is required when the order is not priced in CNY.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a phone, the Owner records a CNY expense without a receipt in under 30 seconds, and with a receipt photo in under 60 seconds on a slow connection (about 1 Mbps).
- **SC-002**: With 10 expenses in mixed currencies on one order, the category totals, grand total, profit and margin match a hand calculation exactly, to the cent.
- **SC-003**: 100% of saved expenses keep their rate and CNY amount when market rates change later. Only an explicit edit changes them.
- **SC-004**: With the rate provider unavailable, 100% of expenses can still be saved with a typed rate, and the unavailability message appears within 5 seconds.
- **SC-005**: Over a day of normal use, the rate provider is contacted at most once per currency, except for explicit refreshes.
- **SC-006**: Profit and totals reflect a newly saved, edited or deleted expense immediately, without reloading the page.
- **SC-007**: 100% of expense creates, edits, deletes and restores, and of category and rate-settings changes, appear in the audit log with before/after values. The access key never appears.
- **SC-008**: Every screen of this feature has no sideways scrolling at 360 pixels, in all three languages.

## Assumptions

- **Profit rate (decided 2026-10-07)**: profit converts the agreed price with the order's agreed rate. Feature 004 adds the rates of real payments for the received part (ROADMAP D2, now partly decided).
- **Who was paid and who advanced (decided 2026-10-07)**: "paid to" is a supplier or a typed name, and "advanced by" names the person to reimburse (brief §10 Q9).
- **Reimbursement tracking** is a simple per-expense flag with per-person totals. Recording the reimbursement payment itself (amount, date, method) is out of scope.
- **Rate provider**: chosen during planning, after checking terms and free-tier limits. It must cover MAD and CNY (ROADMAP D8). The Chinese bank's own rate is a payment concept and comes in 004.
- **Rate direction**: rates are always shown and stored as "1 unit = X CNY", the way the Owner thinks about them.
- **USD and MAD reference rates on each expense** are filled automatically when the service has them, so USD/MAD reports (011) need no extra typing. When missing, CNY figures are unaffected.
- **Unpaid expenses** still count in total costs and profit: they are real costs of the order, just not paid yet.
- **Default payment method** is cash and the default status is paid, the most common case on site.
- **Receipts** are stored with the app's other data, so they are included in backups (009).
- **One receipt per expense**. Order documents with many files arrive in 007.
- **Out of scope here**:
  - payments and the bank rate (004);
  - a global expenses report across orders (011);
  - expense benchmarking (015);
  - supplier payment schedules (020);
  - worker restrictions such as "own entries only" or amount caps (005, 018).
