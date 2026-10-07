# HANJING Order Manager: Specification (Cahier des charges) 

Client: Hicham Jabbar, HANJING MACHINERY (Linyi Hanjing International Trade Co., Ltd) 

Purpose: An app to manage every customer order for heavy equipment bought in China and shipped to Morocco/Africa: costs, payments, shipment tracking, documents, and invoices, in one place. Intended builder: Claude Code (this document is written to be pasted in as the project brief). 

## 1. Context and goals 

The client buys excavators, concrete pump trucks, crushers, forklifts and trucks from Chinese suppliers and sells them to customers in Morocco and Africa. For each order he must track: 

1. What was agreed with the customer (price, terms). 

2. All real costs, itemized, linked to that order. 

3. Money received from the customer, split into two channels. 

4. Where the goods are (inland transport, port, vessel, arrival). 

5. Documents (B/L, packing list, invoices, etc.) and whether they are consistent with the invoice. 

6. Invoices generated from the app. 

#### Main goals 

Know at any moment, per order: price, total costs, 

profit, amount received, amount remaining. 

- Never forget a payment, a document, or a shipment step (reminders). 

- Reduce errors between documents and the invoice (automatic cross-check). 

- Generate professional invoices in minutes. 

Users: one main user (the owner), possibly 1-2 assistants later. Single company. 

Languages: UI in English, French and Arabic (RTL support). Data (customer names, product descriptions) may be Arabic, French, English or Chinese, so full Unicode is required, including Chinese characters in PDFs. 

## 2. Recommended technical approach (developer may adjust) 

- Web app, mobile-first (PWA) usable on phone and desktop. The owner works mostly from his phone. 

- Stack suggestion: TypeScript, React (Vite or Next.js), SQLite (via Prisma or Drizzle) for the first version, with a path to PostgreSQL. Alternative: Python (FastAPI) + React. The developer chooses what he masters best. 

- Hosting: either local/self-hosted on a PC, or a small VPS. Must be reachable from China and Morocco. Authentication required. 

- PDF generation: server-side HTML-to-PDF (e.g. Playwright/Puppeteer or WeasyPrint) with fonts that support Latin, Arabic and Chinese (e.g. Noto Sans, Noto Sans Arabic, Noto Sans SC). 

- AI features (document reading and cross-check) use the Claude API (PDF and image input, structured JSON output). 

- Backups: automatic daily database backup plus a manual "Export all data" (Excel/CSV + files). 

## 3. Data model 

Customer 

name, company, city, country, phone, email, notes 

### Order 

- `order_number` (auto: 1, 2, 3... or HJ-2026-001; 

- editable format) 

- `title` (e.g. "2 Doosan excavators for MJTR 

- Gold") 

- `customer_id` , `customer_city` 

- `status` : Draft / Confirmed / Purchased / In 

- production / Inland transport / At port / On vessel / Arrived / Customs cleared / Delivered / Closed / Cancelled 

- `agreed_price` and `currency` 

- `incoterm` (FOB, CIF, CFR, EXW...), 

- `destination_port` 

- `created_at` , `expected_delivery_date` , notes 

- Items (see Section 4.1) 

### Expense (linked to exactly one Order) 

- `order_id` 

- `name` (free text, e.g. "Trucking Linyi to Qingdao 

- port") 

- `category` : Equipment purchase / Inland transport 

- in China / Port and loading / Sea freight / Insurance / Customs clearance (China) / Customs and duties (Morocco) / Labor / Hotel and 

accommodation / Local travel / Commission / Bank fees / Other (user can add categories) 

- `amount` , `currency` , `exchange_rate_to_base` , `amount_in_base_currency` (auto) 

- `date` , `paid_to` (supplier or person), `paid_by` 

- (cash / bank / other), `receipt` (optional photo or file), `notes` 

### Payment (money received from the customer, linked to an Order) 

- `order_id` 

- `channel` : Direct payment or Bank payment 

- (invoiced). Names are configurable. 

- `amount_paid` , `currency_paid` (MAD / USD / 

- CNY / EUR), `date` , `reference` , `proof` (file), `notes` 

- `type` : Deposit / Balance / Other 

- Exchange rate block (per payment, every field editable): 

   - `rate_mad_cny` : how many CNY for 1 MAD 

   - (and the inverse displayed for convenience) 

   - `rate_usd_cny` : how many CNY for 1 USD 

   - (and the inverse) 

   - `bank_rate_usd_cny` : the USD to CNY rate 

   - applied by the Chinese bank when converting (the bank's own rate, which differs from the market rate) 

   - `bank_rate_type` : Bank buying rate (spot, 

   - used when the bank buys USD from us) / Bank selling rate / Other 

   - `bank_name` : e.g. Bank of China, ICBC, ABC, 

   - CCB (selectable list, editable) 

   - `bank_rate_date_time` : date and time of the 

   - bank rate (Chinese banks update rates during the day) 

   - `rate_source` : Manual / Auto (web) / Auto 

   - then edited 

   - `rate_fetched_at` : timestamp of the 

   - automatic fetch 

   - `amount_cny` : value of the payment in CNY, 

   - computed with the rate of that day (auto, but overridable) 

   - `amount_usd_equivalent` , 

   - `amount_mad_equivalent` : computed for 

   - reporting 

- Rates are frozen on the payment record: later changes to market rates never alter past payments. 

### Shipment (one or more per Order) 

- `order_id` , `shipping_company` , `vessel_name` , 

- `voyage_no` , `bill_of_lading_no` , `container_no` 

- (or "RoRo / breakbulk"), `port_of_loading` , 

`port_of_discharge` , `ETD` , `ETA` , 

```
actual_arrival
```

- `tracking_url` (optional) 

- `status_history` (timestamped events) 

### Document (files attached to an Order) 

- `order_id` , `type` : Commercial invoice / Proforma 

- / Packing list / B/L / Certificate of origin / Customs declaration / Insurance / Supplier invoice / Other 

- `file` , `uploaded_at` , `extracted_data` (JSON), `check_status` (Not checked / OK / Mismatch), `check_report` 

### Invoice (generated by the app) 

See Section 4.6. 

### Reminder / Task 

- `order_id` (optional), `text` , `due_date` , `type` 

- (auto or manual), `done` 

### Settings 

- Seller company profile (name, address, tax IDs, bank details, logo, stamp/signature image) 

- Base currency (CNY or USD, to be confirmed), currency list (USD, CNY, MAD, EUR) 

Exchange-rate service: provider choice, API key, auto-fill on/off, "refresh rates" button, last fetch time. The developer must pick a provider that supports MAD and CNY (e.g. Open Exchange Rates, ExchangeRate-API, Fixer, or Bank AlMaghrib reference rates), check its free-tier limits, cache results (e.g. one fetch per day per currency pair), and show a clear message with manual entry as fallback if the service is down. Avoid free sources that do not cover MAD. 

Payment split default (30% / 70%) 

Invoice templates and numbering 

Terms and conditions text (reusable) 

## 4. Modules and features 

### 4.1 Orders 

- Create an order: title, customer (create on the fly), city, agreed price, currency, Incoterm, destination, items. 

- Order items: product name, brand/model, year, quantity, unit price, HS code (optional), specs, supplier. Total auto-calculated. 

- Order list with filters (status, customer, date) and search. 

Order page = control center: header (customer, price, status), financial summary, tabs for Expenses, Payments, Shipment, Documents, Invoices, Notes and Reminders. 

Duplicate an order (to reuse a template). 

### 4.2 Expenses portal 

- Fast entry form (phone-friendly): name, category, amount, currency, date, optional photo of the receipt. 

- Every expense belongs to one order. Entering from inside the order page is the default. 

- Per-order expense table with totals by category and a grand total. 

- Multi-currency with a rate stored per entry (default rate editable, never silently changed afterward). 

- Edit and delete with an audit trail (who changed what and when). 

### 4.3 Payments portal (two channels) 

- Two clearly separated sections on each order: 

- Direct payments and Bank payments (invoiced). 

- Per order, define the planned split (default 30% / 70%) and the planned amount per channel and per stage (e.g. deposit 30% before production, balance 70% before shipping). 

- Show for each channel: planned, received, remaining. Show the order total: agreed price, received, remaining, % paid. 

Warning if the sum of payments exceeds the agreed price, or if the bank channel exceeds the invoiced amount. 

Attach proof (transfer slip, receipt photo). 

- Detailed exchange-rate entry on every payment (both channels): 

   - Two dedicated rate fields: MAD to CNY and USD to CNY, always visible in the payment form, never hidden. 

   - A third rate field: Chinese bank USD to CNY rate (the rate the bank actually applied), with the bank name and rate type (buying/selling). The form shows three USD/CNY values side by side (market rate, bank rate, rate entered for the customer) and the CNY amount actually received based on the bank rate, plus the difference versus the market rate in CNY and in percent. 

   - A "Fetch bank rate" button: if the developer finds a reliable and permitted source (e.g. the published daily rate list of Bank of China, or a licensed data provider), it fills the bank buying/selling rate for the chosen bank. If no permitted automatic source exists, the field stays manual. The developer must check each 

site's terms before automating and must not scrape sites that forbid it. 

- A "Fetch rate from web" button next to the fields fills both rates automatically for the payment date. The user can then edit either value by hand. 

- Option in Settings: Auto-fill rates when I open a new payment (on/off). 

- The rate actually applied may differ from the official market rate (especially for direct payments), so manual override is always allowed. The app shows the gap between the entered rate and the official rate as an information line (e.g. "+0.8% vs official"), without blocking the entry. 

- The form shows live: amount paid, rate used, resulting amount in CNY, USD and MAD. 

- Payment history table columns: date, channel, amount paid and currency, MAD/CNY rate, USD/CNY rate, amount in CNY, source (manual/auto). 

- Per-order summary in CNY, USD and MAD: total received, remaining, and the average rate obtained across payments (weighted by amount). 

- Optional: show the exchange gain/loss versus the rate agreed with the customer at order 

creation (the order can store an "agreed reference rate"). 

Reports can be filtered by channel. Access to the "Direct payments" section can be restricted to the owner role. 

### 4.4 Financial dashboard 

- Per order: agreed price, total expenses, profit and margin (price minus expenses), received, remaining to collect, and unpaid expenses if any. 

- Global dashboard: open orders, total to collect, total expenses this month, profit by order, and amounts by currency. 

- Export to Excel/PDF (per order and global). 

### 4.5 Shipment tracking and reminders 

### ("assistant" panel) 

- Each order has a timeline of stages (Purchased, Inland transport, At port, Loaded, At sea, Arrived, Customs, Delivered). The user or the system updates the stage. 

- Fields for vessel name and shipping company, plus B/L and container numbers. 

- Vessel position tracking: 

   - MVP: a "Track" button that opens the vessel on a public tracking site in a new tab (deep 

link built from the vessel name/IMO/MMSI or the B/L/container number), and the user records ETA updates manually. 

   - Phase 2: integrate a vessel-tracking API (e.g. MarineTraffic, VesselFinder, Datalastic or similar, or the carrier's own container tracking) to fetch position/ETA automatically on a schedule (e.g. every 6-12 hours) and store it in the status history. The developer must verify terms of service and pricing before choosing a provider. Do not scrape sites that forbid it. 

- Reminder engine (in-app notifications, plus email and/or WhatsApp/Telegram if feasible): 

   - Balance payment due in X days or overdue. 

   - Missing document for an order at a given stage (e.g. no B/L after loading). 

   - ETA approaching or changed. 

   - Vessel arrived and customs steps pending. 

   - Free storage days at port about to expire (if the user enters them). 

   - Manual reminders with a date. 

- Daily summary ("Today's brief"): what is due today, what is overdue, what remains to collect per order, and where each shipment is. 

- Order notes: free text, with timestamps. 

### 4.6 Documents and automatic cross-check 

- Upload area per order (PDF, JPG, PNG, Word, Excel). Preview in the app. 

- Choose the document type on upload. 

- AI extraction: for PDFs and images, extract key fields to JSON: shipper, consignee, notify party, product descriptions, quantities, weights, HS codes, container/vessel/B/L numbers, ports, dates, amounts, Incoterm, invoice number. 

- Cross-check against the order and its invoice: compare extracted fields with the order and the generated invoice (names, addresses, descriptions, quantities, amounts, ports, Incoterm, vessel). Output a check report listing each field as Match / Mismatch / Not found, with the two values side by side and a severity (critical for consignee name or amounts, minor for formatting). 

- The user can accept or dismiss each flagged difference. Never auto-correct documents. 

- Cross-check between documents (e.g. packing list weights vs B/L weights). 

- Make clear in the UI that AI extraction can be wrong and a human must confirm. 

### 4.7 Invoice generator 

Form that produces a PDF invoice. Types: Proforma invoice, Commercial invoice, Packing list (reuses the same data). 

Fields: 

- Seller: company name, address, phone, email, tax IDs, logo, stamp (from Settings, defaulting to the Chinese company). 

- Buyer: name, address, city, country, contact. 

- Invoice number (auto), date, validity date, order reference. 

- Items: description, model, specs, quantity, unit price, line total, HS code, optional photo. 

- Totals: subtotal, freight, insurance, discounts, grand total, currency. 

- Incoterm and destination port. 

- Payment terms: split (e.g. 30% deposit / 70% before shipment), amounts auto-calculated, payment deadline. 

- Bank details of the seller (selectable among saved accounts). 

- Shipping terms: lead time, loading port, partial shipment allowed or not. 

- Terms and conditions (reusable text blocks). 

- Signature/stamp. 

Pre-fill from the order (customer, items, price). Edit freely. 

- Save versions, mark as Sent / Paid, and duplicate an old invoice. 

- Language of the invoice selectable (English, French, Chinese, Arabic) and bilingual option (English + Chinese). 

- Export PDF, and optionally Word/Excel. 

### 4.7b Smart Advisor (continuous analysis, ideas and guidance) 

The app must not be a passive database. It continuously analyzes all orders, expenses, payments, exchange rates, shipments and documents, and produces insights, warnings and recommended next actions. 

How it works 

Layer 1: rules engine (deterministic, no AI needed). Runs after every change and on a schedule (e.g. every night and when rates are refreshed). Calculates margins, balances, delays, anomalies. 

Layer 2: AI analysis (Claude API). Receives a structured, anonymized summary of the data (not raw files unless needed) and writes the explanation, ideas and recommendations in the user's language (Arabic, French or English, selectable). Output is structured JSON: 

`insight_type` , `severity` , `order_id` , `title` , `explanation` , `suggested_actions` , `data_used` . 

- Every insight shows the data it is based on (numbers and records), so the user can verify it. The user can mark an insight as Useful, Not useful, Done, or Snooze. This feedback is stored to improve future relevance. 

Advisor inbox on the dashboard (sorted by severity) and a short block at the top of each order page. 

#### Types of analysis and guidance 

1. Profitability: margin per order, per product type, per customer, per supplier. Alert when the margin falls below a threshold set by the user (e.g. 8%) or when expenses so far already exceed the planned budget. Suggest what to renegotiate or which costs are unusually high. 

2. Expense analysis: compare each category (inland transport, sea freight, customs, labor, hotel, etc.) with the user's own history on similar orders (same route, same equipment type). Flag outliers and possible duplicates or missing expenses (e.g. "no insurance expense on an order already at sea"). 

3. Payments and cash flow: remaining balance per order, overdue or soon-due payments, forecast of money in and out over the next 30/60/90 days, 

and the funding gap if supplier payments come before customer payments. Suggest follow-ups (draft a payment reminder message to the customer, ready to copy). 

4. Exchange rates: show the impact of rate movements on each order in CNY (e.g. "MAD/CNY dropped 1.2% since the deposit; the remaining balance is worth about X CNY less"). Show trends (7/30/90 days) and the gap between bank rate and market rate on past payments. Suggestions are informational scenarios, not financial advice. 

5. Shipment and timing: delayed vessels, ETA changes, port storage/demurrage risk, steps still missing before arrival (documents, customs preclearance). Propose a checklist for the next stage. 

6. Documents and compliance: missing or inconsistent documents (see 4.6), invoice values or descriptions that differ from the agreed price or from customs documents, HS code inconsistencies. Warn about regulatory risk and recommend confirming with a licensed customs broker or accountant. The advisor never advises on hiding payments or under-declaring values. 

7. Customer and supplier insights: payment behavior and delays per customer, repeatcustomer value, reliability per supplier (delays, price changes). Suggest which customers to prioritize and which suppliers to compare. 

8. Opportunities and ideas: based on history, suggest e.g. equipment types with the best margins, cost-saving options (grouping shipments, alternative ports or carriers), and follow-up offers to past customers (draft message). 

9. Periodic reports: automatic weekly and monthly summary (profit, money collected, money owed, expenses by category, shipments in transit, top 5 recommendations), viewable in-app and exportable to PDF. 

#### Ask the advisor (chat) 

- A chat box that answers questions about the user's own data in natural language, in Arabic/French/English. Examples: "How much have I earned on Order 3 so far?", "Which expenses are above average this month?", "How much do I still need to collect in CNY?", "Prepare a payment reminder for customer X". 

- Answers must cite the records used. The assistant can draft messages and emails, but never sends anything or edits data without explicit user confirmation. 

#### Settings and guardrails 

- User-set thresholds (minimum margin, reminder 

- lead times, delay tolerance) and an on/off switch 

per analysis type. 

- Option to disable AI analysis entirely (rules engine only). 

- Privacy: send only the minimum data needed to the AI provider, no bank account numbers or document images unless the user triggers a document check. Log what was sent. 

- Clear label in the UI: "Suggestions generated automatically. Verify before acting. Not financial, legal or customs advice." 

Cost control: cache results, run heavy analysis on schedule rather than on every click, and show monthly AI usage. 

### 4.8 Customers and suppliers 

- Simple address book: customers (with their 

- orders and balance) and suppliers (with expenses paid to them). 

### 4.9 Users and security 

#### Master account (Owner) 

- One master Owner account, created at first launch, with full access to everything, including user management, settings, backups and audit log. The Owner cannot be deleted, demoted or locked out by anyone else. There must be a safe 

recovery procedure for the Owner (recovery codes plus email reset). 

- Login with email and password, optional or mandatory 2FA (authenticator app), session timeout, "log out all devices" button, and login history. 

#### Adding workers (Admin panel, Owner only) 

- The Owner creates a user (name, email or phone, language) and sends an invitation link, or sets a temporary password. The user sets his own password at first login. 

- The Owner can at any time: edit permissions, suspend or reactivate a user, delete a user (his past actions stay in the audit log), reset his password, and force logout. 

#### Permissions: the Owner decides exactly what each worker can see and do 

Permissions are set per user (with reusable role templates such as "Logistics assistant", "Accountant", "Sales assistant", "Read-only") and are enforced on the server, not only hidden in the interface. 

1. Module access (each can be set to No access / View / Create / Edit / Delete / Export): Orders, Customers, Suppliers, Expenses, Payments (Direct payments and Bank payments as two separate permissions), Shipments and 

tracking, Documents, Invoices (draft, issue, send), Financial dashboard and reports, Smart Advisor and chat, Exchange rates, Settings, User management (Owner only). 

2. Data scope 

   - All orders, or only orders assigned to him, or only orders of selected customers. 

   - Time limit option (access expires on a chosen date). 

3. Field-level hiding (the user simply does not see or receive these values), for example: 

   - Agreed selling price, profit and margin 

   - Supplier purchase prices and supplier identity Customer phone, email and address 

   - Amounts and exchange rates in payments Bank account details on invoices 

4. Action limits: e.g. can add expenses but not edit or delete them after 24 hours, can upload documents but not delete them, can create an invoice draft but not issue or send it, can enter an expense only up to an amount set by the Owner (above that it needs approval). 

5. Approval flow (optional): changes to moneyrelated records by workers appear as "pending" until the Owner approves. 

Examples the app must support 

- A logistics worker sees only assigned orders, the Shipments and Documents tabs, and can update shipment status and upload documents. He sees no prices, no payments, no profit. 

- A site/trip assistant can only add expenses (hotel, transport, labor) to assigned orders and see his own entries. He does not see other expenses or any payment. 

- An accountant sees Expenses, Payments, Invoices and reports for all orders, read-only, with export, but no Settings and no shipment editing. 

#### Security rules 

- The Smart Advisor and chat respect permissions: they only use and reveal data the current user is allowed to see. Insights containing hidden data (e.g. profit) are shown only to users who may see them. 

- Search, exports, PDFs, notifications and API responses must apply the same restrictions. Everything over HTTPS, passwords hashed (Argon2 or bcrypt), brute-force protection, regular backups. 

- Audit log (Owner only): who did what, when and from which device, for logins, permission changes, and every create/edit/delete on orders, expenses, payments, invoices and documents. Not editable or deletable by users. 

Optional: restrict access by device or IP, and an alert to the Owner on login from a new device. 

## 5. Screens (suggested) 

1. Login 

2. Dashboard (to-do today, open orders, money to collect, shipments in transit) 

3. Orders list and New order 

4. Order page with tabs: Overview, Expenses, Payments, Shipment, Documents, Invoices, Notes 

5. Invoice builder and preview 

6. Customers, Suppliers 

7. Reports (profit by order, expenses by category, payments by channel) 

8. Settings (company profile, bank accounts, currencies, templates, users) 

## 6. Business rules 

- Profit = agreed price (converted to base currency) minus the sum of all expenses (converted). 

- Remaining to collect = agreed price minus all payments received (both channels, converted). 

- Exchange rates (MAD/CNY and USD/CNY) are stored per transaction, for both payments and expenses; reports use the stored rates, never today's rates. 

- Auto-fetched rates are only a suggestion: the user's final entered value is what is saved. 

- An order cannot be set to Closed while amounts remain to be collected, unless the user confirms. 

- Default split 30/70 can be changed per order. 

- Deleting is soft (recoverable) for orders, payments and expenses. 

## 7. Non-functional requirements 

- Mobile-first, fast on slow connections (including in China). 

- Works with Arabic RTL and Chinese text in UI and PDFs. 

- Data export at any time (Excel/CSV and a zip of files). 

- Simple and clean UI, with large buttons for quick entry on a phone. 

- Code in a git repo with a README (setup, environment variables, backup and restore) and basic tests for money calculations. 

## 8. Delivery phases 

Phase 1 (MVP): login, customers, orders, expenses, two-channel payments, financial summary per order, document upload, invoice generator (proforma and commercial, PDF), manual shipment fields (vessel, company, B/L), manual reminders, Excel export. 

Phase 1 also includes the master Owner account, worker accounts, module-level permissions, data scope per assigned orders, field-level hiding of prices/profit/payments, and the audit log (security is built in from day one, not added later), and the rulesengine part of the Smart Advisor (margin, balance, overdue and missing-expense alerts). 

Phase 2: Smart Advisor with AI analysis, chat and weekly/monthly reports, automatic reminders and daily summary, vessel link and API tracking, AI document extraction and cross-check, packing list, multilingual invoices, global dashboard and reports. 

Phase 3: WhatsApp/Telegram/email notifications, advanced approval workflows, offline mode, supplier payments module, integration with accounting export. 

## 9. Acceptance criteria (examples) 

- I create Order #1 (customer, city, agreed price) and add at least 10 different expenses, each shown by name and tied to Order #1; the profit updates instantly. 

- I record a 30% payment in "Direct" and a 70% payment in "Bank"; the app shows paid and remaining correctly per channel and in total. 

- On a USD payment I can enter or auto-fetch the market USD/CNY rate, the MAD/CNY rate, and the Chinese bank's USD/CNY rate; the app shows the CNY actually received and the gap versus the market rate, and these values never change afterward. 

- Without me asking, the dashboard shows advisor insights (e.g. low margin on an order, a transport cost far above my usual, a balance due soon, a delayed vessel), each with the data behind it and suggested actions. 

- I can ask the chat "how much do I still need to collect on Order 2 in CNY?" and get a correct answer that lists the records used. 

- I create a worker account, assign him two orders, and allow only the Shipments and Documents tabs with prices hidden; when he logs in he sees nothing else, and the same restrictions apply in search, exports and the advisor chat. 

- I enter vessel name and shipping company; the 

- "Track" button opens the right tracking page; I get 

a reminder before the ETA. 

- I upload a packing list and a B/L; the app lists every difference versus the invoice. 

- I generate a proforma invoice PDF from the order in under 2 minutes, with my Chinese company details, bank details and 30/70 terms. 

- The app works in Arabic, French and English, and PDFs display Chinese characters correctly. 

## 10. Open questions for the client (to confirm before or during development) 

1. Which base currency for profit: USD, CNY, or MAD? 

2. Should the app be hosted on a server (reachable anywhere) or run locally on one PC? 

3. How many workers will have accounts, what is each one's job, and for each job which screens and data must be visible or hidden (use the examples in section 4.9 as a starting point)? 

4. Which messaging channel for reminders: in-app only, email, WhatsApp, or Telegram? 

5. Which vessel tracking site or provider does he use today, and does he accept a paid API? 

6. Exact invoice templates: please provide 1-2 existing invoices (proforma and commercial) and the packing list as models. 

7. Seller details and bank accounts to pre-load (Chinese company address, tax numbers, bank accounts, stamp image). 

8. Should invoice numbering follow a specific format? 

9. Does he need expenses paid in cash to be linked to a person (driver, worker)? 

10. Should the customer be able to see anything (a read-only link to shipment status)? 

