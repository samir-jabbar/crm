# HANJING Order Manager — Spec Kit Roadmap

This file splits the product brief ([HANJING_Order_Manager_Spec.md](HANJING_Order_Manager_Spec.md)) into small features. Each feature goes through one full Spec Kit cycle before the next one starts.

## How to use it

1. Take the next unchecked feature in the progress list below.
2. Run `/speckit-specify` with the prompt given in that feature's entry. The prompt tells Claude to read the entry and the brief sections it lists.
3. Run `/speckit-clarify`, answering the open questions listed in the entry. Then run `/speckit-plan`, `/speckit-tasks`, optionally `/speckit-analyze`, and `/speckit-implement`.
4. Merge the feature branch, tick the box here, and move to the next feature.

Rules for every feature:
- Respect the cross-cutting decisions D1–D8 below and the constitution (`.specify/memory/constitution.md`).
- Only build what the entry lists as **In scope**. Items marked **Later** belong to the feature number shown.
- From 005 onward, every feature declares its permissions (module, actions, sensitive fields) under D6.

## Progress

**Phase 1 — MVP**
- [ ] 001 Platform foundation
- [ ] 002 Customers, suppliers and orders
- [ ] 003 Expenses and exchange-rate service
- [ ] 004 Payments and order financial summary
- [ ] 005 Workers and permissions
- [ ] 006 Invoice generator (proforma + commercial)
- [ ] 007 Documents and shipments
- [ ] 008 Reminders and rules-engine advisor
- [ ] 009 Export, backup and deployment

**Phase 2**
- [ ] 010 Automatic reminders and Today's brief
- [ ] 011 Global dashboard and reports
- [ ] 012 AI document extraction and cross-check
- [ ] 013 Multilingual invoices and packing list
- [ ] 014 Vessel tracking API
- [ ] 015 AI advisor analysis and periodic reports
- [ ] 016 Advisor chat

**Phase 3**
- [ ] 017 Notification channels (email, WhatsApp, Telegram)
- [ ] 018 Approvals and action limits
- [ ] 019 Offline mode
- [ ] 020 Supplier payments
- [ ] 021 Accounting export

---

## Cross-cutting decisions

These were decided on 2026-10-07 while reviewing the brief. Items marked *proposed* are defaults to confirm in the named feature's `/speckit-clarify`.

**D1. CNY is the base currency.**
Every money record (expense, payment, invoice, order price) stores:
- its original amount and currency;
- a frozen rate to CNY.

USD and MAD equivalents are computed from frozen USD/CNY and MAD/CNY snapshots on the same record. EUR is supported with its own EUR/CNY rate field; the brief lists EUR but gave it no rate. Reports always use stored rates, never today's rate (brief §6). Amounts are stored as exact decimals or integer minor units, never floats.

**D2. Converting the agreed price** *(decided 2026-10-07, in 003: an order not priced in CNY stores an agreed rate, which converts the agreed price for profit; 004 adds payment rates for the received part. Decided 2026-10-08, in 004: a payment counts for the CNY that actually arrived, at the bank's rate when one is entered; a payment in another currency counts toward the order through its own rates, with a manual override)*.
An order priced in a currency other than CNY must store an *agreed reference rate* when it is created.
- Profit in CNY = (the received part, at each payment's frozen rate) + (the outstanding part, at the reference rate) − (expenses, at their own frozen rates).
- Remaining to collect is tracked in the order's own currency, because that is what the customer owes. CNY, USD and MAD equivalents are shown for reporting.

**D3. Invoice total = full agreed price.**
The commercial invoice always shows the whole sale. The *Direct* channel is only a non-bank way for the customer to pay part of that same price, for example cash, an agent, or a transfer to another account. The app shows warnings in these cases:
- the payments together exceed the agreed price;
- bank payments exceed the invoice total;
- an invoice total differs from the order's agreed price.

The advisor keeps the brief's rule that it never advises hiding payments or under-declaring values.

**D4. Status model** *(proposed — confirm in 007)*.
- The order keeps the brief's §3 status list as its single lifecycle, shown everywhere.
- Each shipment has its own stage timeline (§4.5) with timestamped history.
- When an order has shipments, its logistics status (Inland transport → Delivered) is suggested from the least-advanced shipment. The user can override it.

**D5. Hosting.**
- The app runs on a single VPS (Hetzner or similar). Hetzner's Singapore region gives better latency from China than its EU regions.
- From China it is used over a VPN. Even so, the app uses no Google-hosted assets or APIs (fonts, reCAPTCHA, Firebase, Gmail SMTP), self-hosts its fonts, serves everything over HTTPS, and keeps pages light for slow links.
- Outgoing email goes through a transactional mail provider.

**D6. Permissions are one server-side policy layer.**
- The layer is built in 001 and used by every feature after it. Every read path goes through it: API responses, lists, search, exports, PDFs, notifications and the advisor.
- Each feature declares its module, its actions (View / Create / Edit / Delete / Export) and its sensitive fields.
- Derived values inherit the hiding of their inputs. For example, a hidden agreed price also hides remaining to collect, % paid, profit, margin, and any advisor insight that uses them. Hidden supplier prices also hide total cost.

**D7. Additions to fill gaps in the brief.**
- Expenses get a *paid / to pay* state, with an optional due date. This lets the dashboard show "unpaid expenses" and feeds cash-flow forecasting.
- Orders get an optional *budget* (planned total cost), which the "expenses over budget" alert uses.
- *Decided 2026-10-07 (002):* the agreed price is **typed by hand**. Item lines describe the goods, and their total is shown next to the price for comparison only.
- *Decided 2026-10-07 (002):* order numbers are **`HJ-YYYY-NNN`**. The prefix is editable in Settings, and the counter restarts each January (China time) and is shared by all prefixes.

**D8. Exchange rates and tooling.**
- In Phase 1 the Chinese bank's USD/CNY rate is entered by hand. An automatic source is considered only if its terms allow it, and never by scraping a site that forbids it.
- Market MAD/CNY, USD/CNY and EUR/CNY rates are fetched from a provider that covers MAD. The provider is chosen in 003 after checking its terms and free-tier limits. Rates are cached once per day per pair, with a clear message and manual entry when the provider is down.
- An auto-fetched rate is only a suggestion; the value the user saves is final.
- The tech stack is chosen once, in the 001 plan, with library docs checked through Context7. Later features reuse it.

**D9. Simple sign-in (decided 2026-10-07, overrides brief §4.9).**
- Everyone signs in with **username + password only**: no two-step sign-in, no recovery codes, no email reset.
- The Owner's forgotten password is reset by a command run on the server.
- Other users **register themselves** (username + password) and stay *pending* until the Owner approves them (feature 005). This replaces the brief's invitation links and temporary passwords.
- The protections that remain are strong passwords, temporary blocks after repeated failures, session control and the sign-in history.

---

## Phase 1 — MVP

### 001 Platform foundation
**Goal:** a secure, installable, three-language app shell that the Owner can log into. Every later feature builds on it.

**In scope**
- First-launch setup that creates the single Owner account. The Owner cannot be deleted, demoted or locked out.
- Login (D9):
  - username and password, hashed with Argon2;
  - no two-step sign-in;
  - Owner password reset through a command run on the server.
- Sessions: session timeout, "log out all devices" and login history.
- Basic brute-force protection: temporary blocks per account and per network origin.
- The server-side policy layer (D6). It contains only the Owner for now, but every endpoint already goes through it, together with a field-filtering hook.
- Audit log infrastructure:
  - it records who, what, when and which device, for logins and every create, edit or delete;
  - only the Owner can view it, and nobody can edit or delete it.
- Soft-delete infrastructure, so deleted records can be recovered.
- Languages and layout:
  - UI in English, French and Arabic, with full RTL layout for Arabic;
  - the language is chosen per user;
  - no hard-coded strings;
  - full Unicode everywhere, Chinese included.
- Mobile-first, installable PWA shell: navigation, an empty dashboard, large touch targets, fonts self-hosted (D5).
- Settings skeleton:
  - company name;
  - base currency fixed to CNY;
  - currency list (CNY, USD, MAD, EUR).

**Later:** worker accounts (005); full seller profile (006); backups and deployment (009).
**Brief:** §1, §2, §3 Settings, §4.9 (Master account, Security rules), §5.1, §5.8, §7.
**Depends on:** nothing.
**Done when**
- On a phone, the Owner can install the app, log in, and switch between EN, FR and AR, with the layout mirrored in AR.
- They can change their password and log out all devices.
- Their login appears in the audit log.

**Clarify:** session timeout length (default 12 h).

**Prompt**
```
/speckit-specify Feature 001 "Platform foundation" for the HANJING Order Manager. Read ROADMAP.md (cross-cutting decisions D1-D8 and the entry "001 Platform foundation") and the brief sections it lists in HANJING_Order_Manager_Spec.md. Specify exactly the In-scope items of that entry; treat items marked Later as out of scope.
```

### 002 Customers, suppliers and orders
**Goal:** create and manage customers, suppliers and orders. The order page becomes the control center for everything that follows.

**In scope**
- Customers: name, company, city, country, phone, email, notes.
- Suppliers in the same address book.
- Orders:
  - auto-numbered, with an editable format (e.g. HJ-2026-001);
  - title, customer (can be created on the fly), city;
  - agreed price and currency, Incoterm, destination port;
  - expected delivery date, notes, status from the §3 list;
  - optional budget (D7).
- Order items: product name, brand/model, year, quantity, unit price, HS code (optional), specs, supplier. The total is calculated automatically (D7 price default).
- Order list with filters (status, customer, date) and search.
- Order page:
  - a header with customer, price and status;
  - a placeholder area for the financial summary;
  - tabs: Overview, Expenses, Payments, Shipment, Documents, Invoices, Notes and Reminders. Tabs that later features fill show an empty state.
- Duplicate an order. Timestamped order notes.
- Soft delete and an audit trail.

**Later:**
- Customer balances and supplier expense views: 003 and 004.
- The "Closed while money is still owed" rule: 004.

**Brief:** §3 (Customer, Order), §4.1, §4.8, §5.3, §5.4, §5.6, §6 (soft delete).
**Depends on:** 001.
**Done when**
- The Owner creates Order #1 from a phone, creating a new customer inline and adding 2 items, and sees the total calculated.
- The order can be found by searching and by filtering.
- It can be duplicated.

**Clarify:**
- the order number format (brief §10 Q8 applies here too);
- D7: is the agreed price always the item total, or entered separately?

**Prompt**
```
/speckit-specify Feature 002 "Customers, suppliers and orders" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "002 Customers, suppliers and orders") and the brief sections it lists. Build on feature 001. Specify only the In-scope items.
```

### 003 Expenses and exchange-rate service
**Goal:** every real cost is recorded against its order in seconds from a phone, and the order's profit updates instantly.

**In scope**
- Fast, phone-friendly entry form:
  - name, category, amount, currency, date;
  - an optional receipt photo taken with the camera;
  - paid to, paid by (cash / bank / other), notes.
- Entering an expense from inside the order page is the default.
- Categories: the brief's list, and the user can add more.
- Each expense stores its rate to CNY and a USD/MAD snapshot (D1). The default rate can be edited and never changes silently afterwards.
- Paid / to pay state (D7).
- Per-order expense table with totals by category and a grand total.
- Live profit on the order: agreed price minus expenses, in CNY.
- Edit and delete keep an audit trail (who changed what and when). Deletes are soft.
- Exchange-rate service (D8):
  - settings for provider, API key, auto-fill on/off, a "Refresh rates" button and the last fetch time;
  - a "Fetch rate" button on the form;
  - a daily cache;
  - a manual fallback with a clear message when the provider is down.
- Unit tests for the money calculations.

**Later:** expense benchmarking against past orders (015); supplier payments module (020).
**Brief:** §3 (Expense, Settings: exchange-rate service), §4.2, §6, §7 (tests).
**Depends on:** 002.
**Done when** (brief §9 AC1): the Owner adds 10 different expenses to Order #1. Each is shown by name and tied to Order #1, and the profit updates instantly.
**Clarify:**
- brief §10 Q9: *decided 2026-10-07*. "Paid to" is a supplier or a typed name, and "advanced by" records who paid out of pocket, with a reimbursed flag and per-person totals.
- which rate provider to use (chosen in 003 plan).

**Prompt**
```
/speckit-specify Feature 003 "Expenses and exchange-rate service" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "003 Expenses and exchange-rate service") and the brief sections it lists. Build on features 001-002. Specify only the In-scope items.
```

### 004 Payments and order financial summary
**Goal:** record money received through two separate channels with full exchange-rate detail, and know at any moment how much has been received and how much is still owed.

**In scope**
- Two clearly separated sections per order: *Direct payments* and *Bank payments (invoiced)*. The channel names can be configured.
- Planned split per channel and per stage, for example a 30% deposit before production and a 70% balance before shipping:
  - the default is 30/70, set in Settings;
  - it can be changed per order.
- Each channel shows planned, received and remaining.
- Payment fields: amount, currency (MAD / USD / CNY / EUR), date, reference, type (Deposit / Balance / Other), proof upload, notes.
- Rate block (brief §3 Payment, §4.3):
  - always-visible MAD→CNY and USD→CNY fields, with their inverses shown;
  - the Chinese bank's USD/CNY rate, with bank name (editable list), rate type (buying / selling / other) and the date and time of the rate;
  - the rate source (Manual / Auto / Auto then edited) and when it was fetched;
  - "Fetch rate from web", plus an auto-fill option in Settings.
- The form shows live:
  - the amount in CNY, USD and MAD;
  - three USD/CNY values side by side: market rate, bank rate and the rate entered for the customer;
  - the CNY actually received at the bank rate;
  - the gap from the market rate, in CNY and in %, e.g. "+0.8% vs official". This is informational and never blocks the entry.
- Rates are frozen on the payment record.
- Warnings, which never block the entry (D3):
  - payments in total exceed the agreed price;
  - bank payments exceed the invoice total, which equals the agreed price until invoices exist in 006.
- Payment history table: date, channel, amount and currency, MAD/CNY rate, USD/CNY rate, amount in CNY, source.
- Per-order summary in CNY, USD and MAD:
  - total received, remaining and % paid;
  - the average rate obtained, weighted by amount;
  - the agreed reference rate and FX gain/loss (D2).
- Per-order financial summary on the Overview tab: agreed price, total expenses, profit and margin, received, remaining to collect, unpaid expenses (§4.4 per-order part).
- An order cannot be set to Closed while money is still owed, unless the user confirms.
- Soft delete and an audit trail.
- Unit tests for every money calculation and rule in §6.

**Later:**
- Restricting Direct payments to the Owner role: 005.
- Reports filtered by channel: 011.
- Showing the impact of rate trends: 015.

**Brief:** §3 (Payment), §4.3, §4.4 (per order), §6, §9.
**Depends on:** 003.
**Done when**
- (AC2) A 30% Direct payment and a 70% Bank payment show paid and remaining correctly per channel and in total.
- (AC3) On a USD payment the user can enter or fetch the market USD/CNY rate, the MAD/CNY rate and the bank's USD/CNY rate. The app shows the CNY actually received and the gap from the market rate, and these values never change afterwards.

**Clarify:** confirm D2, the profit formula and the reference rate.

**Prompt**
```
/speckit-specify Feature 004 "Payments and order financial summary" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "004 Payments and order financial summary") and the brief sections it lists. Build on features 001-003. Specify only the In-scope items.
```

### 005 Workers and permissions
**Goal:** the Owner can add workers and decide exactly what each one sees and does. This is enforced on the server everywhere.

**In scope**
- Self-registration (D9): a new user picks a username and password on a "Register" screen. The account stays *pending* and cannot sign in until the Owner approves it, which is when the Owner assigns a role template. The Owner can also reject it.
- Admin panel, for the Owner only:
  - list of pending registrations with approve or reject;
  - edit, suspend or reactivate a user;
  - delete a user, keeping their history in the audit log;
  - reset a password and force logout.
- Role templates that can be reused and edited: Logistics assistant, Accountant, Sales assistant, Read-only.
- Module × action matrix (No access / View / Create / Edit / Delete / Export) for Orders, Customers, Suppliers, Expenses, Direct payments, Bank payments, Shipments, Documents, Invoices, Dashboard and reports, Advisor, Exchange rates and Settings. User management stays Owner-only.
- Data scope:
  - all orders, assigned orders only, the orders of selected customers, or own entries only;
  - an optional date when access expires.
- Field-level hiding: the user does not see or receive these values.
  - agreed price, profit and margin;
  - supplier prices and supplier identity;
  - customer contact details;
  - payment amounts and rates;
  - bank details.
- The D6 inheritance rule applies to derived values.
- Applied across everything built in 001–004: screens, API, search and exports.
- Automated tests for the three §4.9 example users: logistics worker, site/trip assistant, accountant.

**Later:** action limits and approval flow (018); device/IP restriction (018); the advisor and chat respecting permissions (008, 015, 016).
**Brief:** §4.9 (Adding workers, Permissions 1–3, Security rules).
**Depends on:** 004.
**Done when** (brief §9 AC6, Phase 1 part):
- The Owner creates a worker, assigns them two orders, and allows only Shipments and Documents with prices hidden.
- When the worker logs in, they see nothing else.
- The same restrictions apply in search and exports.

**Clarify:** brief §10 Q3: how many workers, what each one's job is, and what each must see or not see.

**Prompt**
```
/speckit-specify Feature 005 "Workers and permissions" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8, especially D6, and the entry "005 Workers and permissions") and the brief sections it lists. Build on features 001-004 and apply the permission model to everything they expose. Specify only the In-scope items.
```

### 006 Invoice generator (proforma + commercial)
**Goal:** generate a professional proforma or commercial invoice PDF from an order in under 2 minutes.

**In scope**
- Seller profile in Settings: company name, address, phone, email, tax IDs, logo, stamp/signature image. The default is the Chinese company.
- Several saved seller bank accounts to choose from.
- Invoice numbering with a configurable format.
- Invoice builder, pre-filled from the order and freely editable:
  - buyer details;
  - invoice number, date, validity date, order reference;
  - items: description, model, specs, quantity, unit price, line total, HS code, optional photo;
  - totals: subtotal, freight, insurance, discounts, grand total, currency;
  - Incoterm and destination port.
- Terms on the invoice:
  - payment terms with the split amounts calculated automatically and a deadline;
  - the seller bank account;
  - shipping terms: lead time, loading port, whether partial shipment is allowed;
  - reusable terms-and-conditions blocks;
  - signature and stamp.
- Server-side PDF:
  - the layout is in English;
  - fonts are embedded (Noto Sans, Noto Sans Arabic, Noto Sans SC), so Arabic and Chinese data display correctly.
- Save versions, mark as Sent or Paid, duplicate an old invoice.
- D3 check: warn when the invoice total differs from the agreed price. Bank payments are now checked against the issued invoice total.
- Permissions: create a draft, issue, send; bank details hidden per D6.

**Later:** packing list, invoices in other languages or bilingual, Word/Excel export (013).
**Brief:** §3 (Invoice, Settings: templates, numbering, T&C), §4.7, §5.5.
**Depends on:** 005.
**Done when**
- (AC9) The Owner generates a proforma PDF from an order in under 2 minutes, with the Chinese company details, bank details and 30/70 terms.
- (AC10) Chinese characters in the data display correctly in the PDF.

**Clarify:** brief §10 Q6 (sample invoices to copy), Q7 (seller details and bank accounts to pre-load) and Q8 (numbering format).

**Prompt**
```
/speckit-specify Feature 006 "Invoice generator (proforma + commercial)" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "006 Invoice generator") and the brief sections it lists. Build on features 001-005. Specify only the In-scope items.
```

### 007 Documents and shipments
**Goal:** every document and shipment detail lives on the order, and the Owner always knows where the goods are.

**In scope**
- Upload area per order:
  - accepts PDF, JPG, PNG, Word and Excel, including from the phone camera;
  - the document type is chosen on upload (brief §3 list);
  - documents can be previewed in the app.
- `check_status` is stored but stays "Not checked" until 012.
- Shipments, one or more per order:
  - shipping company, vessel, voyage number;
  - B/L number, container number or "RoRo / breakbulk";
  - ports of loading and discharge;
  - ETD, ETA and actual arrival;
  - an optional tracking URL.
- Stage timeline per shipment (Purchased → Delivered), with timestamped status history and manual ETA updates. The order status follows D4.
- A "Track" button that opens a public tracking site in a new tab, with a deep link built from the vessel name, IMO/MMSI, B/L or container number. Per brief §4.5 this is MVP, even though §8 lists vessel links under Phase 2.
- Optional free storage days at the port.
- Permissions per D6. Example: a logistics worker can update shipments and upload documents.

**Later:** AI extraction and cross-check (012); automatic tracking API (014); automatic ETA reminders (010).
**Brief:** §3 (Shipment, Document), §4.5 (timeline, fields, Track MVP), §4.6 (upload only).
**Depends on:** 006.
**Done when** (brief §9 AC7, Phase 1 part)
- The Owner enters a vessel name and shipping company, and "Track" opens the right tracking page.
- A B/L uploaded from the phone appears in the order's Documents tab with a preview.

**Clarify:**
- confirm D4;
- brief §10 Q5: which tracking site is used today, to build the deep link.

**Prompt**
```
/speckit-specify Feature 007 "Documents and shipments" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8, especially D4, and the entry "007 Documents and shipments") and the brief sections it lists. Build on features 001-006. Specify only the In-scope items.
```

### 008 Reminders and rules-engine advisor
**Goal:** the app warns the Owner before problems happen, without any AI yet.

**In scope**
- Manual reminders:
  - text, due date, linked to an order or not, done flag;
  - a to-do and overdue list on the dashboard.
- Smart Advisor, layer 1: a deterministic rules engine.
  - It runs after every relevant change and nightly.
  - It alerts on:
    - margin below a user-set threshold (e.g. 8%);
    - expenses over the order budget;
    - balance payment due soon or overdue;
    - missing expected expenses for the order's stage and Incoterm, e.g. no insurance on a CIF order already at sea, but no sea-freight expense expected on FOB.
- Each insight shows its type, severity, order, title, explanation, suggested actions, and the exact data it is based on.
- Advisor inbox on the dashboard, sorted by severity, and a short advisor block at the top of each order page.
- Feedback on each insight: Useful, Not useful, Done, Snooze.
- Settings: thresholds, reminder lead times, and on/off per rule.
- The UI carries the label "Suggestions generated automatically. Verify before acting. Not financial, legal or customs advice."
- Insights respect D6: if an insight uses hidden data, it is not shown to that user.

**Later:** automatic reminders and Today's brief (010); AI analysis (015).
**Brief:** §3 (Reminder), §4.5 (manual reminders), §4.7b (Layer 1, Settings and guardrails), §5.2.
**Depends on:** 007.
**Done when** (brief §9 AC4, rules part): without being asked, the dashboard shows a low-margin insight, an over-budget insight and a balance-due-soon insight. Each comes with the data behind it and suggested actions.
**Clarify:** default thresholds, and which expected expenses go with which Incoterm and stage.

**Prompt**
```
/speckit-specify Feature 008 "Reminders and rules-engine advisor" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "008 Reminders and rules-engine advisor") and the brief sections it lists. Build on features 001-007. Rules engine only: no AI calls in this feature.
```

### 009 Export, backup and deployment
**Goal:** the MVP runs on the VPS, the data can always be exported, and it can never be lost.

**In scope**
- Excel export per order and for all orders. Exports respect D6.
- "Export all data": Excel/CSV for every table plus a zip of all uploaded files. Owner only.
- Automatic daily database and file backups, kept for a set period, with a restore procedure that has been tested.
- Deployment on a Hetzner-class VPS (D5):
  - containerized;
  - automatic HTTPS;
  - environment-based configuration;
  - security headers;
  - stays reachable over VPN from China.
- README: setup, environment variables, deployment, backup and restore.

**Later:** PDF report exports and the global dashboard (011).
**Brief:** §2 (Hosting, Backups), §4.4 (Export), §7.
**Depends on:** 008.
**Done when**
- The app is live on the VPS over HTTPS.
- A backup taken one day can be restored on a fresh server.
- "Export all data" produces a zip with every record and file.

**Clarify:** VPS region (EU or Singapore), domain name, how long to keep backups, and where off-server backup copies are stored.

**Prompt**
```
/speckit-specify Feature 009 "Export, backup and deployment" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8, especially D5, and the entry "009 Export, backup and deployment") and the brief sections it lists. Build on features 001-008. Specify only the In-scope items.
```

---

## Phase 2

### 010 Automatic reminders and Today's brief
- **In scope**
  - Automatic reminders:
    - balance payment due in X days or overdue;
    - missing document for the current stage, e.g. no B/L after loading;
    - ETA approaching or changed;
    - vessel arrived with customs steps pending;
    - free storage days about to expire.
  - "Today's brief": what is due today, what is overdue, what remains to collect per order, and where each shipment is.
  - In-app notifications.
- **Brief:** §4.5.
- **Depends on:** 009.
- **Done when:** (AC7, rest) an automatic reminder appears before the ETA.

```
/speckit-specify Feature 010 "Automatic reminders and Today's brief" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "010") and brief section 4.5. Build on features 001-009.
```

### 011 Global dashboard and reports
- **In scope**
  - Global dashboard: open orders, total to collect, expenses this month, profit by order, amounts by currency.
  - Reports: profit by order, expenses by category, payments by channel, with filters.
  - Excel and PDF export of reports, per order and global.
  - Respects D6.
- **Brief:** §4.4, §4.3 (filter by channel), §5.2, §5.7.
- **Depends on:** 010.

```
/speckit-specify Feature 011 "Global dashboard and reports" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "011") and brief sections 4.4 and 5. Build on features 001-010.
```

### 012 AI document extraction and cross-check
- **In scope**
  - Claude API extraction from PDFs and images into structured JSON: shipper, consignee, notify party, descriptions, quantities, weights, HS codes, container/vessel/B/L numbers, ports, dates, amounts, Incoterm, invoice number.
  - Cross-check against the order and its invoice. Each field is shown as Match / Mismatch / Not found, with both values side by side and a severity.
  - The user can accept or dismiss each flag. Documents are never auto-corrected.
  - Document-vs-document checks, e.g. packing list weights against B/L weights.
  - "AI can be wrong, a human must confirm" labels.
  - A log of what was sent to the AI.
- **Brief:** §2 (AI), §3 (Document), §4.6.
- **Depends on:** 011.
- **Done when:** (AC8) after uploading a packing list and a B/L, the app lists every difference from the invoice.

```
/speckit-specify Feature 012 "AI document extraction and cross-check" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "012") and brief sections 3 (Document) and 4.6. Build on features 001-011. Use the Claude API; check current SDK docs via Context7.
```

### 013 Multilingual invoices and packing list
- **In scope**
  - A packing list generated from the invoice data.
  - Invoice language: English, French, Chinese or Arabic, with RTL layout for Arabic. A bilingual English + Chinese option.
  - Optional Word/Excel export.
- **Brief:** §4.7.
- **Depends on:** 012.
- **Done when:** (AC10, PDF part) PDFs display Chinese and Arabic correctly in every language mode.

```
/speckit-specify Feature 013 "Multilingual invoices and packing list" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "013") and brief section 4.7. Build on features 001-012.
```

### 014 Vessel tracking API
- **In scope**
  - Choose a provider (MarineTraffic, VesselFinder, Datalastic, or the carrier's own tracking) after checking its terms of service and price.
  - Fetch position and ETA every 6–12 h and store them in the shipment status history.
  - ETA changes trigger 010 reminders.
  - No scraping of sites that forbid it.
- **Brief:** §4.5 (Phase 2).
- **Depends on:** 013.
- **Clarify:** brief §10 Q5: is a paid API acceptable?

```
/speckit-specify Feature 014 "Vessel tracking API" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "014") and brief section 4.5. Build on features 001-013.
```

### 015 AI advisor analysis and periodic reports
- **In scope**
  - Smart Advisor layer 2:
    - it sends a structured, anonymized, minimal summary to the Claude API and gets back insights in the user's language, as JSON (`insight_type`, `severity`, `order_id`, `title`, `explanation`, `suggested_actions`, `data_used`);
    - it covers analysis types 1–8 of §4.7b: expense benchmarking, cash-flow forecast for 30/60/90 days, FX impact and trends, customer and supplier insights, opportunities, and draft messages.
  - Weekly and monthly reports, in-app and as PDF.
  - Cost control: caching, scheduled runs, monthly AI usage display.
  - An option to turn AI analysis off entirely.
  - A log of what was sent.
  - Respects D6.
- **Brief:** §4.7b.
- **Depends on:** 014.
- **Done when:** (AC4, AI part) insights such as "transport cost far above your usual" and "vessel delayed" appear without being asked.

```
/speckit-specify Feature 015 "AI advisor analysis and periodic reports" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "015") and brief section 4.7b. Build on features 001-014, extending the rules-engine advisor from 008.
```

### 016 Advisor chat
- **In scope**
  - A chat box that answers questions about the user's own data in Arabic, French or English, and cites the records it used.
  - It drafts messages and emails but never sends anything or edits data without explicit confirmation.
  - It only uses and reveals data the current user is allowed to see (D6).
- **Brief:** §4.7b (Ask the advisor), §4.9 (Security rules).
- **Depends on:** 015.
- **Done when**
  - (AC5) "How much do I still need to collect on Order 2 in CNY?" gets a correct answer that lists the records used.
  - (AC6, chat part) a restricted worker cannot get hidden data out of the chat.

```
/speckit-specify Feature 016 "Advisor chat" for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8 and the entry "016") and brief sections 4.7b and 4.9. Build on features 001-015.
```

---

## Phase 3

Short entries for now. Expand each one when Phase 2 is done.

| # | Feature | Scope | Brief | Clarify |
|---|---|---|---|---|
| 017 | Notification channels | Email first, then WhatsApp and/or Telegram, for reminders and Today's brief. Messages respect D6. | §4.5, §8 | §10 Q4 (which channel) |
| 018 | Approvals and action limits | Edit/delete window (e.g. 24 h), expense amount caps, "pending" changes to money records until the Owner approves. Optional device/IP restriction and new-device login alert. | §4.9 (4–5, Optional) | Which workers need approval |
| 019 | Offline mode | Enter expenses and payments offline, sync them when back online, handle conflicts. | §8 | Which screens must work offline |
| 020 | Supplier payments | Amounts owed to suppliers and their schedules. Feeds the cash-flow funding gap (015). | §4.7b (3), §8 | — |
| 021 | Accounting export | Export in the format the accountant needs. | §8 | Which format or software |
| parked | Customer read-only link | A read-only shipment status page for the customer. | §10 Q10 | Decide later |

---

## Coverage of the brief

| Brief section | Feature(s) |
|---|---|
| §2 PWA, mobile-first | 001 (shell), every feature |
| §2 Hosting, auth | 001, 009 |
| §2 PDF with Latin/Arabic/Chinese | 006, 013 |
| §2 AI features | 012, 015, 016 |
| §2 Backups and export | 009 |
| §3 Customer, Order | 002 |
| §3 Expense | 003 |
| §3 Payment | 004 |
| §3 Shipment | 007 |
| §3 Document | 007 (upload), 012 (extraction/check) |
| §3 Invoice | 006, 013 |
| §3 Reminder | 008, 010 |
| §3 Settings: company profile | 001, 006 |
| §3 Settings: currencies | 001 |
| §3 Settings: exchange-rate service | 003, 004 |
| §3 Settings: 30/70 split | 004 |
| §3 Settings: invoice templates, numbering, T&C | 006 |
| §4.1 Orders | 002 |
| §4.2 Expenses | 003 |
| §4.3 Payments | 004 (Direct-payment restriction in 005, channel reports in 011) |
| §4.4 Financial dashboard | 004 (per order), 009 (Excel), 011 (global, PDF) |
| §4.5 Timeline, fields, Track | 007 |
| §4.5 Manual reminders | 008 |
| §4.5 Automatic reminders, Today's brief | 010 |
| §4.5 Tracking API | 014 |
| §4.5 Notification channels | 017 |
| §4.5 Order notes | 002 |
| §4.6 Upload, preview | 007 |
| §4.6 AI extraction, cross-checks | 012 |
| §4.7 Proforma and commercial invoices | 006 |
| §4.7 Packing list, languages, Word/Excel | 013 |
| §4.7b Layer 1 rules | 008 |
| §4.7b Layer 2 AI, periodic reports | 015 |
| §4.7b Chat | 016 |
| §4.7b Settings and guardrails | 008, 015 |
| §4.8 Customers and suppliers | 002 (+ balances 004) |
| §4.9 Owner, login, sessions, audit log | 001 (2FA, recovery codes and email reset dropped by D9) |
| §4.9 Workers (self-registration + approval), roles, module/scope/field permissions | 005 |
| §4.9 Action limits, approvals, device/IP | 018 |
| §4.9 Advisor and chat respect permissions | 008, 015, 016 |
| §5 Screens 1–8 | 001 (1, 8), 002 (3, 4, 6), 006 (5), 008 (2), 011 (2, 7) |
| §6 Profit, remaining, stored rates, auto rate is only a suggestion | 003, 004 |
| §6 Close-with-balance rule, per-order split | 004 |
| §6 Soft delete | 001 (base), 002–004 |
| §7 Non-functional requirements | 001 (RTL, Unicode, mobile), 006 (PDF fonts), 009 (export, README), 003–004 (money tests) |
| §9 AC1 order + 10 expenses | 003 |
| §9 AC2 30/70 channels | 004 |
| §9 AC3 frozen rates with bank rate | 004 |
| §9 AC4 unprompted insights | 008 (rules), 014–015 (delay, AI) |
| §9 AC5 chat answer with records | 016 |
| §9 AC6 restricted worker | 005, 016 |
| §9 AC7 Track and ETA reminder | 007, 010 |
| §9 AC8 packing list / B/L differences | 012 |
| §9 AC9 proforma in under 2 minutes | 006 |
| §9 AC10 three languages, Chinese in PDFs | 001, 006, 013 |
| §10 Open questions | Q1, Q2 decided (D1, D5); Q3→005, Q4→017, Q5→007/014, Q6–Q8→006, Q9→003, Q10→parked |
