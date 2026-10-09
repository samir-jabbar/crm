# Feature Specification: Workers and Permissions

**Feature Branch**: `005-workers-permissions`
**Created**: 2026-10-08
**Status**: Draft
**Input**: User description: "Feature 005 'Workers and permissions' for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D8, especially D6, and the entry '005 Workers and permissions') and the brief sections it lists. Build on features 001-004 and apply the permission model to everything they expose. Specify only the In-scope items."

## Context

Until now only the Owner uses the app. This feature lets the Owner bring in **workers** (a logistics assistant, an assistant travelling to a site, an accountant) and decide exactly what each one sees and does.

People join as decided in ROADMAP D9. A worker **registers** with a username and password, and the account stays **pending** until the Owner approves it. When approving, the Owner chooses a **role template**, such as "Logistics assistant". The template fills in the worker's permissions, which the Owner can then adjust for that person.

A worker's permissions have four parts:
- **Modules and actions**: for each module (Orders, Expenses, Bank payments and so on), whether the worker may view, create, edit, delete or export.
- **Data scope**: which orders the worker can reach (all orders, the orders assigned to them, or the orders of selected customers), whether they only see the expenses and payments they recorded themselves, and an optional date when their access ends.
- **Hidden values**: groups of sensitive values the worker never sees or receives, for example selling prices and profit, or payment amounts.
- **Inheritance (ROADMAP D6)**: any figure computed from a hidden value is hidden too. For example, a worker who cannot see the agreed price cannot see what remains to collect, the percentage paid, profit or margin.

All of this is enforced on the server, for every screen, list, search, file and data request built in features 001–004. Hiding a button is never the protection: a request the worker is not allowed to make is refused.

Brief references: §4.9 (Adding workers, Permissions 1–3, Security rules), §9 acceptance criterion 6 (Phase 1 part), §10 question 3.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A new worker registers and the Owner lets them in (Priority: P1)

Youssef will handle shipments. On the sign-in screen he taps **Register** and enters a username, his display name, a password (twice) and his language. The app tells him his account is waiting for the Owner's approval. If he tries to sign in before then, the app tells him the same thing.

The Owner sees "1 pending" next to **Users** in the navigation. They open the registration, see Youssef's name, username, language, when he registered and from which device and approximate location, and approve him with the "Logistics assistant" template. Youssef can now sign in and sees only what that template allows. A registration the Owner does not recognise is rejected.

**Why this priority**: without accounts for workers, no other part of this feature can be used. It is the entry point decided in ROADMAP D9.

**Independent Test**: register a new account, check that it cannot sign in, approve it with the "Read-only" template, sign in as the worker, and check that viewing works while every change is refused. Register a second account, reject it, and check that it cannot sign in and that its username can be registered again.

**Acceptance Scenarios**:

1. **Given** registration is open, **When** a person registers with a free username, a display name, a valid password and a language, **Then** the account is created as pending and the person is told it awaits the Owner's approval.
2. **Given** a pending account, **When** its owner signs in with the correct password, **Then** sign-in is refused with "Your account is waiting for the Owner's approval". With a wrong password, the usual message for a failed sign-in is shown.
3. **Given** a pending registration, **When** the Owner approves it with the "Read-only" template, **Then** the worker can sign in in their own language and has exactly the template's permissions.
4. **Given** a pending registration, **When** the Owner rejects it, **Then** the account can never sign in and its username becomes free again.
5. **Given** the Owner has closed registration in Settings, **When** someone opens the sign-in screen, **Then** no Register link is shown, and any registration attempt is refused.
6. **Given** a username that is already taken, by an active, pending, suspended or deleted account, **When** someone tries to register with it, **Then** they are told it is not available.

---

### User Story 2 — The Owner decides which modules and actions each worker has (Priority: P1)

For each worker, the Owner sees one row per module, with the actions View, Create, Edit, Delete and Export. "No access" means no action at all. The Owner can start from a template and change any box.

The worker's navigation, order tabs, buttons and links show only what they may use. Anything else, whether opened from a link or requested directly, is refused by the server. The Owner edits the five default templates or creates new ones, so that the next worker approved with a template gets the right set at once.

**Why this priority**: this is the core of the brief's permission model (§4.9 Permissions 1), and every other permission rule builds on it.

**Independent Test**: give a worker Expenses View and Create only. Check that they can open orders' Expenses tabs and add an expense, but cannot edit or delete one, cannot see payments or settings, and that the same requests sent directly are refused.

**Acceptance Scenarios**:

1. **Given** a worker with Expenses View and Create only, **When** they open an order, **Then** the order page shows the order's number, title, customer and status, and only the Expenses tab. They can add an expense but see no edit or delete action.
2. **Given** the same worker, **When** they request an expense edit, a payment, the settings or the audit log directly, **Then** each request is refused and nothing is changed or returned.
3. **Given** a worker with Bank payments View but no access to Direct payments, **When** they open the Payments tab, **Then** they see only the Bank section, its payments and its plan stages. Nothing about Direct payments appears anywhere.
4. **Given** the Owner removes Expenses Create from a worker who is signed in, **When** the worker then saves a new expense, **Then** the save is refused with a clear message, and the worker does not need to sign in again for the change to apply.
5. **Given** the Owner edits the "Accountant" template, **When** they approve a new worker with it, **Then** the new worker gets the edited permissions, and workers set up earlier with that template keep theirs until the Owner applies the template to them again.
6. **Given** any worker, whatever their permissions, **When** they try to reach user management, the audit log or the security settings, **Then** access is refused.

---

### User Story 3 — The Owner limits a worker to some orders, their own entries, or a period (Priority: P2)

Youssef should only work on the two orders he handles, so his scope is "assigned orders". The Owner assigns him to HJ-2026-003 and HJ-2026-007 from each order's page, and can also see and change his orders from Youssef's page. Ahmed, who travels to a site and pays hotels and trucks, may add expenses to his assigned order but should see only the expenses he entered himself. A temporary helper gets access only until 30 November.

**Why this priority**: most workers should not see the whole business. Scope is the second part of the brief's permission model (§4.9 Permissions 2).

**Independent Test**: with five orders, assign two to a worker whose scope is "assigned orders" and check that only those two appear in lists, search, pickers and direct requests. Turn on "own entries only" and check that the worker sees only the expenses they created. Set an access end date in the past and check that the worker can no longer sign in.

**Acceptance Scenarios**:

1. **Given** a worker with "assigned orders" scope assigned to two of five orders, **When** they open the order list or search for any order number, title or customer, **Then** only those two orders can appear.
2. **Given** the same worker, **When** they request one of the other three orders, or anything belonging to it, directly, **Then** the app answers as if it did not exist.
3. **Given** a worker with "orders of selected customers" scope for the customer "Atlas Engins", **When** a new order is created for Atlas Engins, **Then** the worker sees it without any further change.
4. **Given** a worker with "own entries only" on an order with 12 expenses, 3 of them entered by the worker, **When** they open the Expenses tab, **Then** they see their 3 expenses and totals labelled "Your entries", and never the order's totals.
5. **Given** a worker whose access ends on 30 November, **When** 1 December begins (China time), **Then** their sessions end, sign-in is refused with "Your access ended on 30/11/2026", and the Owner sees them as "Access ended". Setting a later date restores access.
6. **Given** a worker with "assigned orders" scope who may create orders, **When** they create an order, **Then** it is assigned to them automatically and stays visible to them.
7. **Given** the Owner unassigns an order while the worker has it open, **When** the worker takes their next action on it, **Then** the app says the order is no longer available.

---

### User Story 4 — The Owner hides sensitive values, and everything computed from them (Priority: P2)

Youssef may see the order's details, but not what the customer pays. The Owner ticks "Selling price, profit and margin" and "Payment amounts and rates" as hidden for him. He then never sees the agreed price, item prices, profit, what remains to collect or the percentage paid, on any screen, in search, in a file or in a warning. Nothing is sent to his phone either.

**Why this priority**: the brief's example workers all depend on hidden prices (§4.9 Permissions 3). The inheritance rule (D6) is what makes hiding safe: hiding a price must also hide every figure that would reveal it.

**Independent Test**: for each hidden group, sign in as a worker with only that group hidden and go through every screen and data request of features 001–004. No hidden value and no figure computed from it may appear, and searching for a hidden value finds nothing.

**Acceptance Scenarios**:

1. **Given** a worker with Orders View and "Selling price, profit and margin" hidden, **When** they open an order, the order list or a customer page, **Then** no agreed price, agreed rate, item price, item total, price difference, budget, profit or margin is shown or sent.
2. **Given** the same worker with Bank payments View, **When** they open the Payments tab, **Then** they see the Bank payments with their amounts, but no planned amount, remaining amount, percentage paid or overpayment warning.
3. **Given** a worker with Bank payments View and "Payment amounts and rates" hidden, **When** they open the Payments tab, **Then** each payment shows its date, type, channel and reference, but no amount, rate, converted value, gap or proof.
4. **Given** a worker with "Customer contact details" hidden, **When** they search the customer list for a customer's phone number, **Then** no customer is found, and no customer page shows a phone, email or the customer's notes.
5. **Given** a worker with "Supplier purchase prices" hidden and Expenses View on all entries, **When** they open the Expenses tab, **Then** equipment-purchase expenses and expenses paid to a supplier are listed without amounts. The receipts of those expenses cannot be opened. The order's total expenses, the equipment-purchase total, the unpaid total, budget used, profit and margin are not shown, while the other category totals are.
6. **Given** a worker with prices hidden who may edit orders, **When** they change an order's delivery date and save, **Then** the agreed price and item prices are unchanged, and the item lines are read-only for them.
7. **Given** a worker without the remaining amount visible who may edit orders, **When** they look at the status choices, **Then** "Closed" is not offered to them.

---

### User Story 5 — The brief's example workers work out of the box (Priority: P2)

The brief describes three workers the app must support (§4.9) and one acceptance check (§9 AC6). The default templates cover them, and automated tests prove that each one sees and does exactly what the brief says, no more.

**Why this priority**: these are the brief's own examples and its acceptance criterion for permissions. They prove that US1–US4 work together.

**Independent Test**: create the AC6 worker and the three example workers from the default templates, then run the automated checks below.

**Acceptance Scenarios**:

1. **(AC6)** **Given** a worker allowed only Shipments and Documents, with prices hidden and two assigned orders, **When** they sign in, **Then** they see those two orders and, on each, only the Shipments and Documents tabs. Those tabs say "coming in a later update" until feature 007 delivers them. Every other screen, link, search and data request returns nothing about other orders and no price.
2. **(Logistics worker)** **Given** a worker set up with the "Logistics assistant" template and two assigned orders, **When** they use the app, **Then** they see only those orders, their details and items without prices, and the Shipments and Documents tabs. They see no payment, no expense and no profit.
3. **(Site/trip assistant)** **Given** a worker set up with the "Site/trip assistant" template and one assigned order, **When** they add hotel, transport and labour expenses, **Then** they see only their own expenses, and no other expense and no payment.
4. **(Accountant)** **Given** a worker set up with the "Accountant" template, **When** they use the app, **Then** they can view expenses, Bank payments and the dashboard for all orders, with export allowed, but cannot change anything, cannot open Settings, and cannot edit shipments.

---

### User Story 6 — The Owner manages worker accounts (Priority: P3)

When a worker loses their phone, the Owner forces them to sign out everywhere. When a worker forgets their password, the Owner sets a temporary one, and the worker chooses a new one at their next sign-in. A worker on leave is suspended and later reactivated. A worker who leaves the company is deleted, and their past entries still show their name.

**Why this priority**: these controls are needed before workers use the app daily, but they act on accounts that US1 already creates.

**Independent Test**: suspend a signed-in worker and check that their next request is refused, then reactivate them. Reset a worker's password and check that their sessions end and that they must choose a new password. Delete a worker and check that their expenses still show their name and that the audit log keeps their actions.

**Acceptance Scenarios**:

1. **Given** a worker signed in on two devices, **When** the Owner forces a logout, **Then** both sessions end at the worker's next request.
2. **Given** an active worker, **When** the Owner suspends them, **Then** their sessions end and sign-in is refused with "Your access is suspended". **When** the Owner reactivates them, **Then** they can sign in again with the same permissions.
3. **Given** a worker who forgot their password, **When** the Owner sets a temporary password, **Then** the worker's sessions end, and after signing in with it the worker must choose a new password before doing anything else.
4. **Given** a worker who recorded expenses, **When** the Owner deletes the worker after confirming, **Then** the worker can never sign in again, their expenses still show "Created by" with their name, the audit log keeps their actions, and their username cannot be registered again.
5. **Given** the Users area, **When** the Owner looks at the list, **Then** every account shows its display name, username, status, the template it started from and its last sign-in. The Owner can open a worker's active sessions and sign-in history.

---

### Edge Cases

- **Two people try to register the same username at the same time**: one succeeds, the other is told it is not available.
- **Registration is flooded**: after 5 registrations from the same network origin within an hour, more are refused for a while. The Owner can also close registration.
- **The Owner approves a registration on two devices at once**: the second approval is told the account is already approved, and nothing is applied twice.
- **A worker's permissions are reduced while they are typing a form**: the save is refused with a clear message. What they typed stays on their screen until they leave it (001), but nothing is saved.
- **An order assigned to a worker is deleted, then restored**: it disappears from the worker's view and comes back with its assignment.
- **A customer is removed from a worker's selected customers**: that customer's orders disappear from the worker's view at their next action.
- **A template used by workers is deleted**: those workers keep their permissions. Their page shows the template as deleted.
- **A worker who created records is deleted**: the records keep the worker's name as author and in the audit log.
- **A free-text field contains a hidden value**, for example an expense named "Excavator — 85,000 USD" or a note giving a price: free text is shown as typed. The app cannot hide what is written inside text, so the Owner keeps sensitive figures out of titles, names and notes.
- **A worker can see the agreed price and the Bank payments but not Direct payments**: they may notice that Bank payments cover only part of the price. Hiding the Direct channel hides its payments and every figure that includes them. It cannot hide the gap between the price and the Bank payments, unless the agreed price is hidden too.
- **A worker without access to an order follows a link to it**: the app says the page is not available, exactly as for an order that does not exist.
- **The Owner tries to give a worker a combination that cannot work**, such as creating orders while selling prices are hidden: the permission editor refuses it and says why.
- **A worker's access end date is today**: they keep access until the end of the day, China time.
- **A worker opens a screen of a module that arrives in a later feature** (Shipments, Documents, Invoices): if allowed, the tab says "coming in a later update"; if not allowed, it is not shown.

## Requirements *(mandatory)*

### Functional Requirements

**Registration and approval (D9)**

- **FR-001**: While registration is open, the sign-in screen MUST offer "Register". Registration asks for a username, a display name, a password (entered twice) and a language. Usernames and passwords follow the rules of 001 (FR-007, FR-008).
- **FR-002**: A registered account MUST be pending and unable to sign in until approved. With the correct password, sign-in is refused with "Your account is waiting for the Owner's approval". With a wrong password, the usual failed sign-in message is shown (001 FR-010).
- **FR-003**: The Owner MUST see pending registrations in the Users area, with display name, username, language, date and time of registration, device and approximate location. The number of pending registrations MUST be visible in the Owner's navigation.
- **FR-004**: Approving MUST require choosing a role template. The template's modules, actions, hidden values and data scope are copied to the worker, and the Owner can adjust them before or after approving. An access end date is optional.
- **FR-005**: Rejecting MUST remove the pending account. Its username becomes free again.
- **FR-006**: Registrations MUST be limited per network origin: by default 5 per hour, after which more are refused for a while. The Owner MUST be able to close and reopen registration in Settings; it is open by default. While closed, the Register link is hidden and registrations are refused.

**Modules and actions**

- **FR-007**: Each worker's permissions MUST be a matrix of modules and actions:
  - modules: Orders, Customers, Suppliers, Expenses, Direct payments, Bank payments, Shipments, Documents, Invoices, Dashboard and reports, Advisor, Exchange rates, Settings;
  - actions: View, Create, Edit, Delete, Export. "No access" means none of them;
  - only the actions that make sense for a module are offered: Dashboard and reports has View and Export; Advisor has View; Exchange rates and Settings have View and Edit.
- **FR-008**: Create, Edit, Delete and Export MUST each include View. Delete MUST also allow seeing and restoring that module's deleted records.
- **FR-009**: What each module covers among features 001–004:
  - **Orders**: the order list and order page Overview (details, items, notes, financial summary), creating, editing and duplicating orders, changing their status, adding and deleting notes;
  - **Customers**, **Suppliers**: their lists, pages and pickers;
  - **Expenses**: the Expenses tab, receipts and reimbursements;
  - **Direct payments**, **Bank payments**: that channel's section of the Payments tab, its payments, proofs and plan stages. Editing an order's payment plan needs Edit on both channels;
  - **Dashboard and reports**: the dashboard's figures, such as "To reimburse";
  - **Exchange rates**: the exchange-rate settings. Fetching a rate inside an expense or payment form is available to anyone who may record expenses or payments;
  - **Settings**: company name, order numbering, expense categories and payment settings. A settings section about a module is shown only to workers who also have that module: expense categories need Expenses, and payment settings need both payment channels;
  - **Shipments**, **Documents**, **Invoices**, **Advisor**: these can be set now and take effect when features 006–008 deliver them. Until then an allowed tab shows "coming in a later update", and a tab that is not allowed is not shown.
- **FR-010**: A worker who has any module tied to orders (Expenses, a payment channel, Shipments, Documents or Invoices) but not Orders View MUST still see the orders in their scope. The order list and page header then show only the number, title, customer name and status.
- **FR-011**: These MUST stay Owner-only and MUST NOT be grantable: user management (registrations, accounts, permissions, templates and order assignments), the audit log, the security settings (session timeout, and registration open or closed), and backups when 009 adds them. This replaces 001 FR-019's rule that all settings are Owner-only: the business settings in FR-009 become grantable.
- **FR-012**: Navigation, order tabs, buttons and links MUST show only what the worker may use. A screen the worker may not use MUST show an access message and no data.
- **FR-013**: The server MUST refuse every request the worker's permissions do not allow, whatever the interface shows (001 FR-017). A record outside the worker's scope MUST be answered as if it did not exist.
- **FR-014**: A permission change MUST apply from the worker's next request, on every device, without signing out.

**Role templates**

- **FR-015**: The app MUST provide five default templates, named in the user's language until renamed:

  | Template | Modules and actions | Hidden values | Data scope |
  |---|---|---|---|
  | Logistics assistant | Orders View; Suppliers View; Shipments View, Create, Edit; Documents View, Create | Selling price, profit and margin; Supplier purchase prices; Payment amounts and rates; Bank details; Customer contact details | Assigned orders |
  | Site/trip assistant | Expenses View, Create | Selling price, profit and margin; Supplier purchase prices; Supplier identity; Payment amounts and rates; Bank details; Customer contact details | Assigned orders, own entries only |
  | Accountant | Orders, Customers, Suppliers, Shipments, Exchange rates: View. Expenses, Bank payments, Invoices, Dashboard and reports: View, Export | none | All orders |
  | Sales assistant | Orders View, Create, Edit; Customers View, Create, Edit; Bank payments View; Invoices View, Create | Supplier purchase prices; Supplier identity; Bank details | All orders |
  | Read-only | View on Orders, Customers, Suppliers, Expenses, Bank payments, Shipments, Documents, Invoices, Dashboard and reports, Exchange rates | none | All orders |

- **FR-016**: No default template MUST include Direct payments. The Owner can grant it to a named worker.
- **FR-017**: The Owner MUST be able to edit, rename, create and delete templates. Applying a template copies it to the worker. Later changes to the template do not change workers already set up, until the Owner applies the template to them again. Each worker's page shows the template they started from, marked when their permissions have been changed since.

**Data scope**

- **FR-018**: Each worker MUST have one order scope: all orders, assigned orders only, or the orders of selected customers, including that customer's future orders.
- **FR-019**: The Owner MUST be able to assign and unassign workers from an order's page, and see and change a worker's assigned orders from the worker's page. Only the Owner sees and changes assignments.
- **FR-020**: An order a worker creates MUST be assigned to them automatically. With the "selected customers" scope, a customer the worker creates MUST be added to their selection.
- **FR-021**: An "own entries only" option MUST limit the worker, within the orders in their scope, to the expenses and payments they recorded themselves.
- **FR-022**: With the "all orders" scope, a worker sees every customer and supplier their modules allow. With another scope, they see only the customers and suppliers linked to orders in their scope, plus those they created themselves.
- **FR-023**: An optional access end date MUST end the worker's access after the end of that day, China time. Their sessions end, sign-in is refused with "Your access ended on <date>", and the Users area shows them as "Access ended". A later date restores access.
- **FR-024**: Scope MUST apply to every list, page, picker, search, total, file and data request.

**Hidden values (D6)**

- **FR-025**: The Owner MUST be able to hide any of these groups per worker. Each group removes:

  | Group | Values removed | Also removed, because computed from them (D6) |
  |---|---|---|
  | Selling price, profit and margin | agreed price, agreed rate, item unit prices and line totals, item total and its difference from the agreed price, budget | profit, margin, budget used, remaining to collect, percentage paid, planned amounts of plan stages and channels, channel remaining, exchange gain or loss, overpayment and bank-over-invoice warnings, the outstanding amount when closing, customer balances |
  | Supplier purchase prices | the amounts, rates and converted values of expenses in the "Equipment purchase" category or paid to a supplier, and their receipts | the order's total expenses, the totals of the categories that contain them, unpaid total, budget used, profit, margin |
  | Supplier identity | the supplier on item lines, the supplier an expense was paid to, and the whole Suppliers module | — |
  | Customer contact details | customer phone, email and notes | — |
  | Payment amounts and rates | payment amounts, "counts as" amounts, customer and bank rates, market rates and gaps, CNY, USD and MAD values, and proofs | received totals, remaining to collect, percentage paid, average rates, exchange gain or loss, warnings, profit, margin |
  | Bank details | the bank named on a payment's conversion; the seller's bank accounts on invoices when 006 adds them | — |

- **FR-026**: Hidden values and the figures computed from them MUST never be shown or sent to the worker's device. This covers screens, lists, search results, pickers, files, warnings, confirmations and error messages.
- **FR-027**: Inheritance MUST hold for every figure: a figure about a record, such as an order's total expenses, profit or remaining amount, is shown only if the worker may see every value it is computed from. This includes records outside their own entries and payments of a channel they cannot see.
- **FR-028**: A worker who sees only their own entries MUST see totals of their own entries, labelled "Your entries", instead of the order's totals. Totals across several orders, such as "To reimburse", cover only what the worker can see and say so when the worker does not see all orders.
- **FR-029**: Without access to Direct payments, the worker MUST see nothing about them: no Direct section, payment, plan stage or warning, and no figure that combines both channels (total received, remaining to collect, percentage paid, average rates, exchange gain or loss, profit, margin).
- **FR-030**: Search MUST never match on a value the worker cannot see.
- **FR-031**: Saving MUST never change a value the worker cannot see. With selling prices hidden, item lines are read-only for that worker.
- **FR-032**: The permission editor MUST refuse combinations that cannot work, and say why:
  - creating orders needs selling prices visible and Customers View;
  - creating or editing payments needs payment amounts visible;
  - recording expenses paid to a supplier or in "Equipment purchase" needs supplier identity and purchase prices visible;
  - the Suppliers module needs supplier identity visible;
  - closing an order needs the remaining amount visible, so without it "Closed" is not offered.
- **FR-033**: Receipts and payment proofs MUST be served only to workers who may see that expense or that payment's amounts.

**Managing accounts**

- **FR-034**: The Users area MUST list every account that is not deleted, with display name, username, status (pending, active, suspended, access ended), the template it started from, and last sign-in. Deleted accounts appear only under "Show deleted users".
- **FR-035**: For each worker, the Owner MUST be able to: edit the display name and language; change permissions, scope and access end date; suspend and reactivate; reset the password; force logout; delete; and see their active sessions and sign-in history.
- **FR-036**: Suspending MUST end all the worker's sessions at once and refuse sign-in with "Your access is suspended". Reactivating restores the same permissions.
- **FR-037**: Resetting a password MUST let the Owner set a temporary password that follows 001's rules. It ends all the worker's sessions, and at their next sign-in the worker must choose a new password before doing anything else. The Owner never sees a worker's own password.
- **FR-038**: Force logout MUST end all the worker's sessions at once.
- **FR-039**: Deleting a worker MUST require confirmation, which suggests suspending instead. It ends their sessions and removes their assignments. Records they created keep their name, the audit log keeps their actions, and their username is never reused. Deletion cannot be undone.
- **FR-040**: None of these actions MUST apply to the Owner account (001 FR-004).

**Audit**

- **FR-041**: The audit log MUST record, with before and after values where relevant:
  - registrations, approvals and rejections;
  - changes to a worker's permissions, scope, hidden values and access end date;
  - template changes;
  - order assignments;
  - suspensions, reactivations, deletions, password resets by the Owner and forced logouts;
  - changes to registration being open or closed.

  Refused sign-ins of pending, suspended and ended accounts MUST appear in the sign-in history with that reason.

**Exports and usability**

- **FR-042**: The Export permission MUST be stored for each module. Features 001–004 have no export. Every export added later (009, 011) MUST apply the same scope and hidden values.
- **FR-043**: Every new screen (Register, Users, a worker's page, the permission editor, templates) MUST work on a 360-pixel-wide phone without sideways scrolling, in English, French and Arabic, with Western digits.
- **FR-044**: The permission editor MUST show one module per row with its actions, and each hidden group with a one-line explanation of what it hides, including the figures that follow it.

### Key Entities

- **User** (from 001): gains the pending, suspended and deleted states in use, an optional access end date, the template it started from, a "must choose a new password" flag, and its permissions.
- **Permissions of a worker**: the module × action grants, the hidden value groups, the order scope (with selected customers when relevant), the "own entries only" option and the access end date.
- **Role template**: a named, reusable set of permissions, hidden groups and a default scope. Five are provided; the Owner can edit them and add more.
- **Order assignment**: links a worker to an order, for the "assigned orders" scope.
- **Customer selection**: the customers whose orders a worker with the "selected customers" scope can reach.
- **Registration**: a pending account, with when, from which device and from where it registered.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (AC6)**: For the worker of US5 scenario 1, an automated sweep of every screen, link, search and data request of features 001–004 finds nothing outside the two assigned orders' Shipments and Documents tabs, and no price, in 100% of cases.
- **SC-002**: Each of the brief's three example workers passes all of their automated checks: every allowed action succeeds and every other attempt is refused.
- **SC-003**: For each hidden group, a sweep of every response of features 001–004 finds no hidden value and no figure computed from one, including in search results, files, warnings and error messages.
- **SC-004**: On a phone, a new worker registers in under 2 minutes, and the Owner approves them with a template in under 1 minute.
- **SC-005**: Suspension, forced logout, password reset, reduced permissions and the end of access take effect at the worker's next request on every device, in 100% of tests.
- **SC-006**: 100% of registrations, approvals, rejections, permission changes and account actions appear in the audit log, with before and after values for changes.
- **SC-007**: A worker's order list and order page open within 2 seconds on a mid-range phone, with 1,000 orders in the app.
- **SC-008**: Every new screen works on a 360-pixel-wide phone in English, French and Arabic without sideways scrolling.

## Assumptions

- **Team size**: up to about 10 workers and a handful of templates. There is still exactly one Owner, and ownership cannot be transferred.
- **Who the workers are** (brief §10 Q3): to be confirmed in `/speckit-clarify`. Until then the default templates follow the brief's §4.9 examples. A "Site/trip assistant" template is added to the brief's four, because it is one of the three examples the app must support.
- **Templates are presets**: they are copied when applied, so editing a template never silently widens the access of existing workers.
- **Direct payments**: a separate permission, left out of every default template (ROADMAP 004 "Later"). The Owner can still grant it.
- **"Own entries only"** applies to expenses and payments inside the orders in scope. It is combined with the order scope rather than replacing it, which covers the brief's site/trip assistant.
- **The access end date** applies to the whole account, not to single orders.
- **Free text** (titles, names, references, notes) is shown as typed. Hidden values are fields and figures, not words inside text.
- **Out-of-scope records** are answered as if they did not exist, so a worker cannot learn that they exist.
- **Exports**: there are none in 001–004. The Export permission is recorded now and applied by 009 and 011.
- **Later modules** (Shipments, Documents, Invoices, Advisor, reports) can be configured now and take effect when built.
- **Workers keep 001's own-account features**: changing their own password, language and display name, and seeing their own sessions and sign-in history.
- **Out of scope**:
  - action limits such as a 24-hour edit window or amount caps, and the approval flow for money records (018);
  - device or IP restrictions and new-device alerts (018);
  - the advisor and chat respecting permissions (008, 015, 016);
  - inviting users by link or creating them with a temporary password (replaced by self-registration, D9).
- **Dependencies**: 001 (accounts, sessions, the permission gate, the audit log, sign-in protection) and 002–004 (the records and their declared sensitive fields).
