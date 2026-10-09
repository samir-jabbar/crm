# Feature Specification: Payments and Order Financial Summary

**Feature Branch**: `004-payments-financial-summary`
**Created**: 2026-10-08
**Status**: Draft
**Input**: User description: "Feature 004 'Payments and order financial summary' for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry '004 Payments and order financial summary') and the brief sections it lists. Build on features 001-003. Specify only the In-scope items."

## Context

Feature 003 records every cost of an order and computes profit from the agreed price. This feature records the **money received from the customer** and shows, at any moment, how much has been received and how much is still owed.

Customers pay through two separate **channels**:
- **Direct payments**: money paid outside the bank, for example cash, an agent, or a transfer to another account;
- **Bank payments (invoiced)**: transfers to the company's bank, which match the commercial invoice.

Both channels pay the same agreed price (ROADMAP D3). Each order has a **payment plan**, for example a 30% deposit before production and a 70% balance before shipping, and each channel shows what was planned, received and still due.

A payment can be in CNY, USD, MAD or EUR. Like expenses, it keeps the exchange rates of its day, frozen forever (D1). For a foreign-currency payment converted by the Chinese bank, it also keeps the bank's own rate, so the Owner sees how much CNY actually arrived and how far the bank's rate was from the market rate.

Profit follows decision D2. It is the money received, each payment at its own frozen rate, plus what is still owed at the order's agreed rate, minus all expenses.

Decisions made for this feature (2026-10-08):
- **A payment counts for the CNY that actually arrived.** When the Chinese bank converts a foreign-currency payment at its own rate, the payment's CNY value is amount × bank rate. Profit therefore shows the real money, and the bank's conversion cost appears in the exchange result. Without a bank rate, the rate entered for the customer is used.
- **A payment in another currency counts toward the order through its own rates, and can be overridden.** For example, 570,000 MAD on a USD order, at MAD→CNY 0.71 and USD→CNY 7.10, counts as 57,000.00 USD. The Owner can type a different figure when a different amount was agreed with the customer.

Brief references: §3 (Payment, Settings: payment split), §4.3, §4.4 (per-order part), §6, §9 AC2 and AC3.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Record payments in two channels and see what is still owed (Priority: P1)

A customer pays the 30% deposit in cash to the company's agent in Casablanca. The Owner opens the order, goes to the Payments tab and taps "Add payment" in the **Direct payments** section. They enter:
- the amount and its currency;
- the date (today by default);
- a reference, e.g. the receipt number;
- the type: Deposit, Balance or Other;
- optionally, a photo of the proof (transfer slip or receipt) and notes.

Later the 70% balance arrives by bank transfer and is recorded in the **Bank payments** section. Each section shows what was planned, received and is still due. The order shows its total received, what remains to collect and the percentage paid.

**Why this priority**: knowing what each customer still owes is the second main reason the app exists, after costs. It is brief §9 acceptance criterion 2.

**Independent Test**: on an order of 190,000 USD with the default plan (30% Direct deposit, 70% Bank balance), record a 57,000 USD Direct payment, then a 133,000 USD Bank payment. After each one, check planned, received and remaining per channel and in total, and the percentage paid.

**Acceptance Scenarios**:

1. **Given** an order of 190,000 USD with the default plan, **When** the Owner records a Direct payment of 57,000 USD, **Then** Direct shows planned 57,000.00, received 57,000.00, remaining 0.00; Bank shows planned 133,000.00, received 0.00, remaining 133,000.00; the order shows received 57,000.00 USD, remaining 133,000.00 USD and 30.0% paid.
2. **Given** that order, **When** the Owner then records a Bank payment of 133,000 USD, **Then** both channels show remaining 0.00, and the order shows remaining 0.00 USD and 100.0% paid.
3. **Given** a payment proof at hand, **When** the Owner takes a photo in the payment form, **Then** the photo is attached to the payment and can be opened from it later.
4. **Given** payments in both channels, **When** the Owner opens the Payments tab, **Then** a history table lists every payment with: date, channel, amount and currency, MAD/CNY rate, USD/CNY rate, amount in CNY, and rate source.
5. **Given** a required field is missing (channel, amount, currency, date, type), **When** the Owner saves, **Then** the field is highlighted with a message in their language, and nothing typed (including the photo) is lost.

---

### User Story 2 — Capture the exchange rates of every payment, including the bank's rate (Priority: P2)

The 133,000 USD balance reaches the company's account at Bank of China, which converts it to CNY at its own buying rate, lower than the market rate. On the payment form the Owner sees:
- the MAD→CNY and USD→CNY rates, always visible, each with its inverse (1 CNY = … MAD, 1 CNY = … USD);
- a "Fetch rate" button that fills both for the payment date;
- the Chinese bank's rate, with the bank's name, the rate type (buying, selling, other) and the date and time of that rate.

While typing, the form shows:
- the payment's value in CNY, USD and MAD;
- three USD/CNY values side by side: the market rate, the bank's rate, and the rate entered for the customer;
- the CNY actually received at the bank's rate;
- the gap from the market rate, in CNY and as a percentage, e.g. "−0.7% vs market".

When saved, all these values are frozen on the payment.

**Why this priority**: the bank's rate decides how much CNY really arrives. The Owner needs it to know the real profit (brief §9 acceptance criterion 3).

**Independent Test**: on a USD payment, fetch the market rates, type a bank rate of 7.05 for Bank of China (buying, today 10:30), and check the CNY actually received and the gap. Then change the market rates and confirm the saved payment does not change.

**Acceptance Scenarios**:

1. **Given** a new USD payment of 133,000 USD dated today, **When** the Owner taps "Fetch rate", **Then** the USD→CNY and MAD→CNY fields are filled with the market rates of that date, labelled "Automatic" with the fetch time, and their inverses are shown.
2. **Given** a market USD→CNY rate of 7.10, **When** the Owner enters a bank rate of 7.05 for Bank of China, type "buying", at 10:30 today, **Then** the form shows: market 7.10, bank 7.05, customer 7.10; CNY actually received 937,650.00; gap −6,650.00 CNY and −0.7% vs market. The gap is information only and never blocks saving.
3. **Given** a fetched rate, **When** the Owner changes it by hand, **Then** the saved payment records the typed rate and the source "Automatic, then edited". A rate typed without fetching is saved as "Manual".
4. **Given** a saved payment, **When** market rates change later, **Then** the payment keeps all its rates and its CNY, USD and MAD values (D1, brief §6).
5. **Given** the rate provider is unreachable, **When** the Owner taps "Fetch rate", **Then** a message says rates are unavailable, and the payment can still be saved with typed rates.
6. **Given** a MAD payment of 570,000 MAD on a USD order, with MAD→CNY 0.71 and USD→CNY 7.10, **When** the Owner looks at the form, **Then** it shows 404,700.00 CNY and "Counts as 57,000.00 USD" toward the order.
7. **Given** that MAD payment, **When** the Owner overrides "Counts as" with 56,800 USD, the figure agreed with the customer, **Then** the payment is saved with 56,800.00 USD toward the order, marked as entered by hand, and its CNY value stays 404,700.00.

---

### User Story 3 — See received money, what remains, and the real profit on the order (Priority: P3)

On the order's Overview tab, the financial summary from 003 now also shows what was received and what remains. The Payments tab has a summary in CNY, USD and MAD:
- total received, remaining and percentage paid;
- the average rate obtained per currency, weighted by amount;
- the agreed reference rate and the exchange gain or loss against it.

Profit uses each payment's own rate for the money already received, and the agreed rate for what is still owed (D2).

**Why this priority**: it turns the payments into the number the Owner checks most, real profit. It needs US1 and US2.

**Independent Test**: on a 190,000 USD order at an agreed rate of 7.10, with 1,203,500 CNY of expenses, record a 57,000 USD Direct payment at 7.10 and a 133,000 USD Bank payment converted at a bank rate of 7.05. Check that profit is 138,850.00 CNY, the margin 10.3% and the exchange loss −6,650.00 CNY.

**Acceptance Scenarios**:

1. **Given** the order above before any payment, **When** the Owner opens it, **Then** profit is 145,500.00 CNY (everything still owed, at the agreed rate), as in 003.
2. **Given** both payments recorded, **When** the Owner opens the order, **Then** received is 1,342,350.00 CNY, remaining 0.00, profit 138,850.00 CNY, margin 10.3%, and the exchange result −6,650.00 CNY against the agreed rate of 7.10.
3. **Given** USD payments of 57,000 at 7.10 and 133,000 at 7.05, **When** the Owner views the summary, **Then** the average USD/CNY rate obtained is 7.065000 (total CNY received ÷ total USD received).
4. **Given** a payment is recorded, edited or deleted, **When** the Owner looks at the order, **Then** every figure (received, remaining, % paid, profit, margin, exchange result) is updated without reloading the page.
5. **Given** an order priced in CNY, **When** payments are recorded, **Then** remaining and % paid are in CNY and no exchange result is shown.

---

### User Story 4 — Plan the payments of each order (Priority: P4)

In Settings, the Owner sets the default plan used by every new order. The default is:
- a **Deposit** of 30% in the Direct channel, before production;
- a **Balance** of 70% in the Bank channel, before shipping.

On each order, the Owner can change the plan: the percentages, the channel of each stage, add or remove stages, and give a stage a due date. The planned amounts are computed from the agreed price.

Settings also hold the names of the two channels, which the Owner can rename, and the list of Chinese banks offered in the bank-rate field.

**Why this priority**: the default plan already serves most orders. Changing it per order is occasional.

**Independent Test**: change the default plan to 40/60 in Settings and create an order, which gets 40/60. On another order, split the deposit into 20% Direct and 10% Bank, and check that the planned amount per channel follows.

**Acceptance Scenarios**:

1. **Given** the default 30/70 plan, **When** the Owner creates a 100,000 USD order, **Then** its plan is Deposit 30,000.00 USD (Direct, before production) and Balance 70,000.00 USD (Bank, before shipping).
2. **Given** an order's plan, **When** the Owner edits it to Deposit 20% Direct, Deposit 10% Bank, Balance 70% Bank, **Then** Direct is planned 20,000.00 and Bank 80,000.00.
3. **Given** a plan whose percentages do not total 100%, **When** the Owner saves it, **Then** the plan is refused with a message showing the current total.
4. **Given** the Owner renames "Direct payments" to "Cash and agents" in Settings, **When** anyone opens a Payments tab, **Then** the new name is shown, in every language.
5. **Given** the agreed price of an order changes, **When** the Owner opens its plan, **Then** the planned amounts follow the new price, with the same percentages.

---

### User Story 5 — Be warned about overpayment, and never close an order that is still owed money by mistake (Priority: P5)

The app warns, without ever blocking the entry, when:
- the payments in total exceed the agreed price;
- the Bank payments exceed the invoice total, which equals the agreed price until invoices exist (feature 006).

When the Owner sets an order to **Closed** while money remains to collect, the app asks for confirmation and shows the amount still owed.

**Why this priority**: these rules protect against mistakes (brief §6, D3). They matter less than recording and seeing the money.

**Independent Test**: record payments above the agreed price and check the warning. Then try to close an order with 133,000 USD outstanding: the app asks for confirmation, and closing only happens after it.

**Acceptance Scenarios**:

1. **Given** an order of 190,000 USD with 190,000 USD received, **When** the Owner records another 1,000 USD, **Then** a warning says payments exceed the agreed price by 1,000.00 USD, and the payment is saved.
2. **Given** Bank payments of 190,000 USD on that order, **When** the Owner adds another Bank payment, **Then** a warning says Bank payments exceed the invoice total.
3. **Given** an order with 133,000.00 USD remaining, **When** the Owner sets it to Closed, **Then** a confirmation shows "133,000.00 USD still to collect". Cancelling leaves the status unchanged. Confirming closes the order and the audit log records that it was closed with an amount still owed.
4. **Given** an order with nothing remaining, **When** the Owner sets it to Closed, **Then** no confirmation is asked.

---

### User Story 6 — Keep payments accurate: edit, delete, restore, audit (Priority: P6)

The Owner can correct any field of a payment, delete one entered by mistake and restore it later. Every change is in the audit log, with the old and new values, and the payment shows who created it and who last changed it.

**Why this priority**: mistakes happen on a phone. The brief requires recoverable deletion for payments (§6).

**Independent Test**: edit a payment's amount and bank rate, delete a payment and restore it. Check that the channel and order figures follow each step, and that the audit log lists every step.

**Acceptance Scenarios**:

1. **Given** a payment of 133,000 USD, **When** the Owner corrects it to 130,000 USD, **Then** its CNY, USD and MAD values are recomputed, the order figures update, and the audit log shows the old and new amount.
2. **Given** a payment entered twice by mistake, **When** the Owner deletes one (with confirmation), **Then** it leaves the history and all totals, and can be restored from "Show deleted payments".
3. **Given** a payment, **When** the Owner opens it, **Then** it shows who created it and when, and who last changed it and when.

---

### Edge Cases

- **CNY payments**: no conversion is needed. The MAD→CNY and USD→CNY fields stay visible, because they give the USD and MAD values of the payment.
- **EUR**: a payment or order in EUR also shows the EUR→CNY rate field (D1).
- **No bank conversion**: the bank-rate block is optional. A cash Direct payment usually has none. Without a bank rate, no "actually received" line or bank gap is shown.
- **No market rate known** (provider down, or rates typed by hand): the gap from the market rate is not shown, and nothing else is blocked.
- **Order currency changes after payments exist**: refused, with a message. Remaining amounts are tracked in the order's currency, so payments already counted in it must keep their meaning.
- **Agreed price lowered below what was received**: allowed; the overpayment warning then shows.
- **Overpayment**: remaining never goes below 0. The excess is shown as "overpaid by …" and counts in received money and in profit.
- **Older non-CNY order without an agreed rate** (from 002): profit is unavailable while money remains to collect, as in 003. Once fully paid, profit no longer needs the agreed rate and is shown.
- **Payment on a deleted order**: the order's payments disappear with it from every total. Restoring the order brings them back.
- **Plan rounding**: stage amounts are computed from the percentages, rounded to the cent. The last stage takes the rounding difference, so the stages always add up to the agreed price exactly.
- **Payment dated in the future**: allowed, e.g. a transfer already sent with a future value date. It counts as received.
- **Status changed to Closed from the order form, the header or any other place**: the same confirmation applies.
- **Cancelled orders**: no confirmation is asked; the closing rule only concerns Closed.

## Requirements *(mandatory)*

### Functional Requirements

**Payments**

- **FR-001**: The Owner MUST be able to add a payment to an order, from the order's Payments tab, in one of its two channels, with:
  - amount (required, more than 0, up to 2 decimals);
  - currency (CNY, USD, MAD or EUR);
  - date (required, default today);
  - reference (optional free text);
  - type: Deposit, Balance or Other (required);
  - proof: one optional photo or PDF;
  - notes.
- **FR-002**: Every payment MUST belong to exactly one order and one channel.
- **FR-003**: The proof MUST accept a photo taken with the phone camera or a chosen image or PDF file, up to 10 MB, reduced on the device like expense receipts. It MUST be viewable only by signed-in users allowed to see the payment.
- **FR-004**: The Payments tab MUST show the two channels in clearly separated sections, each with its planned, received and remaining amounts in the order's currency, and the order's total: agreed price, received, remaining and percentage paid (one decimal).
- **FR-005**: The Payments tab MUST show a history table of the order's payments, newest first, with: date, channel, amount and currency, MAD/CNY rate, USD/CNY rate, amount in CNY, and rate source.

**Exchange rates of a payment**

- **FR-006**: The payment form MUST always show a MAD→CNY and a USD→CNY rate field, each with its inverse displayed (1 CNY = … MAD / USD), whatever the payment's currency. An EUR→CNY field MUST also show when the payment or the order is in EUR. Rates use the format of 003: "1 unit = X CNY", up to 6 decimals.
- **FR-007**: A "Fetch rate" button MUST fill the rate fields with the market rates for the payment date, using the 003 exchange-rate service (dated rate when available, otherwise the latest, labelled with its own date). When automatic filling is on in Settings, opening a new payment MUST fill empty rate fields. Fetched values stay editable. The source (Manual, Automatic, Automatic then edited) and the fetch time are kept per payment.
- **FR-008**: The payment form MUST offer an optional **bank conversion** block for a foreign-currency payment:
  - the bank's rate to CNY for the payment's currency;
  - the bank's name, chosen from the editable list in Settings or typed;
  - the rate type: buying, selling or other;
  - the date and time of that rate.
  The bank's rate is always typed; no automatic source is used (ROADMAP D8).
- **FR-009**: Each payment MUST be valued:
  - **in CNY** (decided 2026-10-08): amount × the bank's rate when a bank rate is entered, which is the CNY that actually arrived; otherwise amount × the payment's rate to CNY for its currency (1 for CNY);
  - **in the order's currency**, the amount it "counts as" toward the agreed price (decided 2026-10-08): the amount itself when the payment is in the order's currency. Otherwise it is converted through the payment's own rates: amount × (rate of the payment's currency to CNY) ÷ (rate of the order's currency to CNY). The Owner can override this figure on the payment; the payment then records that it was entered by hand. A changed rate or amount recomputes it unless it was entered by hand;
  - **in USD and in MAD**: the amount itself when the payment is in that currency, otherwise its CNY value converted at the payment's own USD→CNY or MAD→CNY rate.
  Conversions use exact arithmetic, rounded to the cent with half a cent rounded up, as in 003.
- **FR-010**: While typing, the form MUST show live:
  - the payment's value in CNY, USD and MAD, and the amount it counts for in the order's currency;
  - for a foreign-currency payment, three rates side by side: the market rate (as fetched), the bank's rate, and the rate entered for the customer;
  - when a bank rate is entered: the CNY actually received (amount × bank rate) and the gap from the market rate, in CNY and as a percentage with one decimal (e.g. "−0.7% vs market").
  The gap is information only and MUST NOT block saving.
- **FR-011**: All rates, the market rate as fetched, the bank details and every computed value MUST be frozen on the payment when saved. They MUST change only when the Owner edits the payment (D1, brief §6).

**Plan per channel and stage**

- **FR-012**: Every order MUST have a payment plan made of stages. Each stage has: a type (Deposit, Balance or Other), a channel, a percentage of the agreed price, an optional timing label (e.g. "before production") and an optional due date. The planned amount of each stage is its percentage of the agreed price, rounded to the cent, the last stage absorbing the rounding difference.
- **FR-013**: A new order MUST receive a copy of the default plan from Settings. The initial default is a Deposit of 30% in the Direct channel "before production" and a Balance of 70% in the Bank channel "before shipping". Orders created before this feature MUST receive the default plan too.
- **FR-014**: The Owner MUST be able to edit an order's plan: change percentages, channels, labels and due dates, add and remove stages. A plan MUST total exactly 100% to be saved. Plan changes are audited.
- **FR-015**: For each channel: planned = sum of its stages; received = sum of its non-deleted payments, in the order's currency; remaining = planned − received. A negative remaining is shown as "over plan by …".
- **FR-016**: For the order: received = sum of all non-deleted payments in the order's currency; remaining to collect = agreed price − received, never below 0; overpaid = the excess when received is above the agreed price; percentage paid = received ÷ agreed price.

**Financial summary and profit**

- **FR-017**: Profit MUST follow D2: profit in CNY = (sum of the received payments' CNY values) + (remaining to collect × the order's agreed rate, or × 1 for CNY orders) − (total expenses from 003). Margin = profit ÷ (sum of received CNY + remaining at the agreed rate), with one decimal. This replaces the 003 profit, which counted the whole agreed price at the agreed rate.
- **FR-018**: For a non-CNY order without an agreed rate, profit and margin MUST stay unavailable while money remains to collect, with the "Set the agreed rate to see profit" link from 003. When nothing remains, profit MUST be shown.
- **FR-019**: The Payments tab MUST show a summary in CNY, USD and MAD:
  - total received (each payment's frozen CNY, USD and MAD values added up);
  - remaining to collect, in the order's currency and in CNY at the agreed rate;
  - percentage paid;
  - for each foreign currency that was received, the average rate obtained: total CNY received in that currency ÷ total amount received in it;
  - for a non-CNY order with an agreed rate, the agreed reference rate and the exchange result = (sum of received CNY values) − (sum of received amounts in the order's currency × the agreed rate), shown as a gain or a loss.
- **FR-020**: The financial summary on the order's Overview MUST show, in CNY: agreed price, total expenses, profit and margin, received, remaining to collect, and unpaid expenses. Every figure MUST update as soon as a payment or an expense is saved, changed or deleted.

**Warnings and closing**

- **FR-021**: The app MUST warn, without blocking, when:
  - the order's received total exceeds the agreed price (showing by how much);
  - the Bank channel's received total exceeds the invoice total, which is the agreed price until invoices exist (D3, feature 006).
  The warnings MUST show on the payment form before saving and on the Payments tab.
- **FR-022**: Setting an order's status to Closed while money remains to collect MUST require an explicit confirmation showing the amount still owed. The status change and the outstanding amount MUST be audited.
- **FR-023**: Changing the currency of an order that has non-deleted payments MUST be refused with a clear message.

**Editing, deleting, audit**

- **FR-024**: The Owner MUST be able to edit every field of a payment. A change of amount, currency or rate MUST recompute its values.
- **FR-025**: The Owner MUST be able to delete a payment (with confirmation) and restore it from "Show deleted payments" (recoverable deletion from 001). Deleted payments leave every total.
- **FR-026**: Each payment MUST show who created it and when, and who last changed it and when. Every create, edit, delete and restore of a payment, every plan change and every Settings change of this feature MUST be in the audit log with the previous and new values.

**Settings**

- **FR-027**: Settings MUST let the Owner:
  - rename the two channels (the names show everywhere, in every language, instead of the translated defaults);
  - edit the default payment plan (same rules as an order's plan);
  - maintain the list of Chinese banks offered in the bank-rate field (initially Bank of China, ICBC, ABC and CCB), adding, renaming and removing names. Removing a name never changes past payments.
  Automatic rate filling uses the 003 setting, which now applies to both expenses and payments.

**Permissions and usability**

- **FR-028**: All new screens and data MUST go through the permission gate with a "payments" module and its actions (view, create, edit, delete). The Direct and Bank channels MUST be declared as separately restrictable, so feature 005 can limit the Direct channel to the Owner. Payment amounts, rates, CNY/USD/MAD values, received, remaining, percentage paid, average rates, the exchange result, and every figure derived from them MUST be declared sensitive (D6). Proofs are served only through the gate.
- **FR-029**: Every screen of this feature MUST work on a 360-pixel-wide phone without sideways scrolling, in English, French and Arabic, with Western digits in all amounts and rates.

### Key Entities

- **Payment**: money received from the customer for one order, in one channel.
  - Fields: amount, currency, date, reference, type (Deposit / Balance / Other), proof file, notes;
  - the amount it counts as in the order's currency, and whether that figure was entered by hand;
  - rates to CNY for MAD, USD and, when needed, EUR, with their source and fetch time;
  - the market rate as fetched (for comparison);
  - the optional bank conversion: rate, bank name, rate type, date and time;
  - frozen values: in CNY, in the order's currency, in USD and in MAD;
  - created by/at, updated by/at, recoverable-deletion data.
- **Payment plan stage**: one planned instalment of an order: type, channel, percentage, timing label, optional due date, position.
- **Default payment plan**: the stages copied to every new order, kept in Settings.
- **Payment channel**: Direct or Bank, with a configurable display name.
- **Bank name**: an entry of the editable list of Chinese banks.
- **Order** (from 002/003): gains its payment plan and the derived figures: received, remaining, overpaid, percentage paid, exchange result, and profit following D2.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a phone, the Owner records a payment with fetched market rates and a typed bank rate in under 60 seconds, and a cash payment in the order's currency in under 30 seconds.
- **SC-002**: With the 30/70 example (brief §9 AC2), planned, received and remaining per channel and in total, and the percentage paid, are correct after each payment.
- **SC-003**: For a USD payment with a bank rate (brief §9 AC3), the CNY actually received and the gap from the market rate match a hand calculation to the cent and to 0.1%, and 100% of saved payments keep these values when market rates change later.
- **SC-004**: Received, remaining, average rates, exchange result, profit and margin match a hand calculation exactly, to the cent, on an order with at least 5 payments in 3 currencies and both channels.
- **SC-005**: Every figure of the order reflects a newly saved, edited or deleted payment immediately, without reloading the page.
- **SC-006**: 100% of overpayment and bank-over-invoice situations show their warning, and none of them prevents saving.
- **SC-007**: No order with money remaining can be set to Closed without an explicit confirmation.
- **SC-008**: 100% of payment creates, edits, deletes and restores, plan changes, and settings changes appear in the audit log with before and after values.
- **SC-009**: Every screen of this feature has no sideways scrolling at 360 pixels, in all three languages.

## Assumptions

- **Profit formula (D2, decided 2026-10-07)**: money received counts at each payment's frozen value; what remains counts at the order's agreed rate. When an order is fully paid, profit no longer depends on the agreed rate.
- **CNY value and "counts as" (decided 2026-10-08)**: see Context. The bank's conversion cost therefore lowers profit and shows in the exchange result.
- **Default plan**: Deposit 30% Direct "before production", Balance 70% Bank "before shipping". This matches brief §9 AC2 (a 30% Direct payment and a 70% Bank payment) and the brief's example stages. It can be changed in Settings and per order.
- **Received and remaining per channel** are tracked per channel, not per stage. A payment's type (Deposit, Balance, Other) describes it but does not have to match a stage.
- **Invoice total**: until invoices exist (006), the invoice total used by the Bank warning is the order's agreed price (D3).
- **Bank rate**: always typed by hand in this phase. The brief's "Fetch bank rate" is not built, because no permitted automatic source has been chosen (ROADMAP D8).
- **Market rate shown for comparison** is the market rate fetched for the payment. When rates are typed without fetching, the comparison and the gap are not shown.
- **Automatic filling** uses the existing 003 setting for both expenses and payments, instead of a second switch.
- **One proof file per payment**, stored and protected like expense receipts. Order documents with many files arrive in 007.
- **Remaining in USD and MAD**: the summary shows what remains in the order's currency and in CNY at the agreed rate. USD and MAD totals are given for received money only, which has frozen rates; this avoids valuing future money at today's rates (brief §6).
- **Out of scope here**:
  - restricting the Direct channel to the Owner (005);
  - reports and filters by channel (011);
  - the global dashboard's "total to collect" (011);
  - rate-trend analysis (015);
  - payments made to suppliers (020).
