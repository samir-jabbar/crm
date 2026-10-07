# Feature Specification: Customers, Suppliers and Orders

**Feature Branch**: `002-customers-suppliers-orders`
**Created**: 2026-10-07
**Status**: Draft
**Input**: User description: "Feature 002 'Customers, suppliers and orders' for the HANJING Order Manager. Read ROADMAP.md (decisions D1-D9 and the entry '002 Customers, suppliers and orders') and the brief sections it lists. Build on feature 001. Specify only the In-scope items."

## Context

Feature 001 delivered the secure, installable, three-language shell with the Owner account. This feature adds the first business records:
- an **address book** of customers and suppliers;
- **orders** with their equipment items.

Each order gets a page that becomes the **control center**. Later features fill its tabs:
- expenses (003);
- payments (004);
- invoices (006);
- documents and shipments (007);
- reminders (008).

Decisions made for this feature (2026-10-07):
- **Order numbers** look like `HJ-2026-001`: a prefix, then the year, then a counter that restarts every January. The prefix can be changed in Settings.
- **The agreed price is typed by hand.** The item lines describe what is sold, and their total is shown next to the agreed price for comparison only.

Brief references: §3 (Customer, Order), §4.1, §4.8, §5.3, §5.4, §5.6, §6 (recoverable deletion).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Create an order from the phone (Priority: P1)

The Owner closes a deal for two Doosan excavators with a customer in Casablanca. On the phone, they create a new order. They:
1. type a title;
2. pick the customer, or create them on the spot if they are new;
3. confirm the delivery city;
4. type the agreed price and its currency;
5. choose the Incoterm and the destination port;
6. add the equipment lines (product, brand/model, year, quantity, unit price, optional HS code, specs, supplier).

The order receives its number automatically, e.g. `HJ-2026-001`, and opens on its own page.

**Why this priority**: Orders are the heart of the app. Every later feature (expenses, payments, invoices, shipments) hangs off an order.

**Independent Test**: On a phone, create an order with a brand-new customer and two items, and confirm it gets the next number and appears in the order list.

**Acceptance Scenarios**:

1. **Given** no orders yet this year, **When** the Owner saves a new order, **Then** it is numbered `HJ-<current year>-001`, and the next one `HJ-<current year>-002`.
2. **Given** the new-order form, **When** the Owner types a customer name that doesn't exist yet and chooses "Create customer", **Then** the customer is created and selected without leaving the form, and anything already typed in the order form is kept.
3. **Given** a selected customer, **When** the order form opens the delivery city, **Then** it is pre-filled from the customer's city and can be changed for this order.
4. **Given** two item lines (2 × 85,000 and 1 × 12,500), **When** the Owner types an agreed price of 190,000 USD, **Then** the form shows an item total of 182,500 USD and a difference of +7,500 USD next to the agreed price, without blocking the save.
5. **Given** a required field is missing (title, customer, agreed price, currency, or an item's product name/quantity), **When** the Owner saves, **Then** the missing fields are highlighted with a message in the current language, and nothing typed is lost.

---

### User Story 2 — Find any order and work from its page (Priority: P2)

The Owner opens the order list. By default it shows the newest orders first, each with number, title, customer, status, agreed price and date.
- They filter by status, customer and date range, and search by text. The search covers order number, title, customer name, and item product or model, in any script.
- Opening an order shows its control center:
  - a header with number, title, customer, status and agreed price;
  - a summary area;
  - tabs for Overview, Expenses, Payments, Shipment, Documents, Invoices, Notes and Reminders.
- From the page they can edit any detail or item, and change the status.

**Why this priority**: After a few weeks there will be dozens of orders. Finding the right one quickly from a phone is what makes the app usable day to day.

**Independent Test**: With 30 orders across several customers and statuses, find a given order by a fragment of its customer name, by an item model, and by status filter. Open it, change its status and edit one item.

**Acceptance Scenarios**:

1. **Given** many orders, **When** the Owner types "doosan" in the search, **Then** every order with "Doosan" in its title or in an item's product/model is listed, regardless of capitals.
2. **Given** orders with Arabic or Chinese customer names, **When** the Owner searches part of such a name (e.g. "汉景" or "الدار"), **Then** the matching orders are listed.
3. **Given** the list, **When** the Owner filters by status "On vessel" and a customer, **Then** only orders matching both are shown. Clearing the filters shows everything again.
4. **Given** an order page, **When** the Owner changes the status from "Confirmed" to "Purchased", **Then** the header shows the new status, and the change is in the audit log with the old and new values.
5. **Given** an order page on a 360-pixel-wide phone, **When** the Owner switches tabs, **Then** each tab is reachable without sideways scrolling. Tabs whose features are not built yet show a short "coming soon" message.

---

### User Story 3 — Keep an address book of customers and suppliers (Priority: P3)

The Owner maintains customers and suppliers.
- **Customer**: name, company, city, country, phone, email, notes.
- **Supplier**: name, company, contact person, phone, WeChat ID, email, city, country, notes.

Each customer page lists that customer's orders. Each supplier page lists the orders whose items come from that supplier. Both lists can be searched.

**Why this priority**: Customers are needed to create orders, and suppliers are linked to item lines. A full address book makes repeat business faster, but orders can already be created with customers created on the fly (US1).

**Independent Test**: Create a customer and a supplier with mixed-script details, link the supplier to an order item, then open each page and see the linked order.

**Acceptance Scenarios**:

1. **Given** the customer list, **When** the Owner adds "شركة الدار البيضاء للمعدات" in Casablanca, Morocco, **Then** the customer is saved exactly as typed and can be found by searching any part of the name.
2. **Given** a customer with three orders, **When** the Owner opens the customer page, **Then** the three orders are listed, newest first, with number, title, status and agreed price.
3. **Given** a supplier linked to items in two orders, **When** the Owner opens the supplier page, **Then** both orders are listed.
4. **Given** a new customer named exactly like an existing one, **When** the Owner saves, **Then** they are warned that a customer with the same name exists, and can still save.

---

### User Story 4 — Duplicate an order and keep notes on it (Priority: P4)

The Owner often sells the same machines again. From an existing order they choose "Duplicate". A new order is created with the next number, status Draft, and a copy of the title (marked as a copy), customer, delivery city, price, currency, Incoterm, destination port, budget and all item lines. Notes, dates and history are not copied.

On any order, the Owner adds short notes, for example "Customer asked for an extra bucket". Each note shows when it was written and by whom, newest first.

**Why this priority**: Duplicating saves minutes on every repeat deal, and notes keep the context of each order in one place. Both are useful but not required to start working.

**Independent Test**: Duplicate an order with three items and check the copy. Add two notes and check their order and timestamps.

**Acceptance Scenarios**:

1. **Given** order `HJ-2026-004` with three items, **When** the Owner duplicates it, **Then** a new order `HJ-2026-<next>` opens in Draft, with the same customer, price, currency, Incoterm, destination and the three items, and no notes.
2. **Given** an order, **When** the Owner adds a note, **Then** it appears at the top of the Notes tab with the author and the date and time in the Owner's language.
3. **Given** a note added by mistake, **When** the Owner deletes it (with confirmation), **Then** it disappears from the tab and the deletion is in the audit log.

---

### User Story 5 — Delete and restore records safely (Priority: P5)

The Owner deletes an order created by mistake. It disappears from lists and search but is not destroyed: a "Deleted orders" view lets the Owner restore it. The deletion and the restore are both in the audit log.

A customer or supplier can also be deleted and restored, but not while active orders still use them.

**Why this priority**: Mistakes happen on a phone. Recoverable deletion is required by the brief (§6), but it is rarely used day to day.

**Independent Test**: Delete an order, confirm it is gone from the list and search, restore it from "Deleted orders", and confirm it is back with the same number and items.

**Acceptance Scenarios**:

1. **Given** an order, **When** the Owner deletes it and confirms, **Then** it no longer appears in the order list, search, or the customer's page.
2. **Given** a deleted order, **When** the Owner restores it from "Deleted orders", **Then** it reappears with the same number, items and notes.
3. **Given** a customer with active orders, **When** the Owner tries to delete the customer, **Then** the app refuses and says how many active orders use them.
4. **Given** an order was deleted, **When** a new order is created, **Then** the deleted order's number is not reused.

---

### User Story 6 — Choose the order-number prefix (Priority: P6)

In Settings, the Owner sees the order-number format with a preview of the next number. They can change the prefix, for example from `HJ` to `HJM`. New orders use the new prefix. Existing order numbers never change.

**Why this priority**: The default `HJ` prefix works out of the box. Changing it is rare.

**Independent Test**: Change the prefix and create an order. Its number uses the new prefix and continues the year's counter, and older orders keep their numbers.

**Acceptance Scenarios**:

1. **Given** Settings, **When** the Owner views the order-number section, **Then** it shows the prefix (default `HJ`) and a preview of the next number.
2. **Given** the prefix is changed to `HJM` after `HJ-2026-007`, **When** a new order is created, **Then** it is numbered `HJM-2026-008`, and `HJ-2026-007` is unchanged.

---

### Edge Cases

- **Two orders saved at the same moment** (e.g. from phone and laptop): each gets a different number, and no number appears twice.
- **New year**: the first order created after midnight on 1 January (China time) is numbered `…-<new year>-001`.
- **More than 999 orders in a year**: the counter simply grows (`HJ-2026-1000`).
- **Deleted orders**: their numbers stay taken, whether the order is restored or not.
- **Agreed price differs from the item total**: allowed. The difference is shown, as information only.
- **Order without items**: allowed (a deal may be agreed before the exact machines are fixed). The item total shows as 0.
- **A customer is edited after orders exist**: existing orders keep their own delivery city. The customer's name shown on orders follows the customer record.
- **A supplier used on items is deleted**: refused while non-deleted orders use it.
- **Very long or mixed-script texts** (Chinese product names, Arabic customer names, French specs): stored exactly. They wrap on small screens and never cause sideways scrolling.
- **Connection drops while saving an order**: the save fails with a clear message, and everything typed stays in the form (001 FR-032).
- **Duplicate of an order whose customer has since been deleted**: not possible, because a customer cannot be deleted while it has active orders.

## Requirements *(mandatory)*

### Functional Requirements

**Customers**

- **FR-001**: The Owner MUST be able to create, view, edit, delete and restore customers with: name (required), company, city, country, phone, email, notes. All fields accept any script and are stored exactly as entered.
- **FR-002**: Saving a customer whose name exactly matches an existing customer (ignoring capitals and surrounding spaces) MUST show a warning. The Owner can still save.
- **FR-003**: The customer list MUST be searchable by name, company, city or phone, and sorted by name.
- **FR-004**: A customer's page MUST list that customer's orders, newest first, with number, title, status and agreed price.

**Suppliers**

- **FR-005**: The Owner MUST be able to create, view, edit, delete and restore suppliers with: name (required), company, contact person, phone, WeChat ID, email, city, country (default China), notes.
- **FR-006**: The supplier list MUST be searchable by name, company, contact person or city.
- **FR-007**: A supplier's page MUST list the orders that have at least one item from that supplier.

**Orders**

- **FR-008**: The Owner MUST be able to create an order with:
  - title (required);
  - customer (required; choose an existing one or create one without leaving the form);
  - delivery city (pre-filled from the customer, editable);
  - agreed price (required, typed by hand, zero or more, up to 2 decimals);
  - currency (required: CNY, USD, MAD or EUR);
  - Incoterm (Incoterms 2020 list, optional);
  - destination port (free text with suggestions, optional);
  - expected delivery date (optional);
  - budget (optional: the planned total cost in CNY).
- **FR-009**: Each order MUST receive an automatic, unique, never-reused number of the form `<prefix>-<year>-<counter>`. The counter starts at `001` each calendar year (China time), is at least 3 digits wide, and increases by one for every order created that year, whatever the prefix.
- **FR-010**: Each order MUST have a status from the brief's list: Draft, Confirmed, Purchased, In production, Inland transport, At port, On vessel, Arrived, Customs cleared, Delivered, Closed, Cancelled. New orders start as Draft, and the Owner can change the status at any time.
- **FR-011**: An order MUST hold zero or more item lines, each with:
  - product name (required);
  - brand/model;
  - year of manufacture (optional);
  - quantity (whole number of 1 or more, required);
  - unit price (zero or more, in the order's currency);
  - HS code (optional);
  - specifications (multi-line text);
  - supplier (optional; choose an existing one or create one without leaving the form).
- **FR-012**: Each item line MUST show its line total (quantity × unit price). The order MUST show the item total, and the difference between the agreed price and the item total, as information that never blocks saving.
- **FR-013**: The Owner MUST be able to edit every order field and item line after creation, and add, remove or reorder item lines.
- **FR-014**: The order list MUST:
  - show orders newest first, each with number, title, customer, status, agreed price with currency, and creation date;
  - filter by status (one or more), customer, and creation-date range;
  - search by text in order number, title, customer name, and item product name or model;
  - search case-insensitively for Latin letters and by substring for Chinese and Arabic text;
  - load more results as the Owner scrolls.
- **FR-015**: The order page MUST show:
  - a header with number, title, customer, status and agreed price;
  - a summary area, which shows the item total and the budget in this feature and is filled with costs, profit and payments in 003–004;
  - tabs for Overview (details and items), Expenses, Payments, Shipment, Documents, Invoices, Notes and Reminders. Tabs not yet built MUST show a short translated "coming soon" message.
- **FR-016**: The Owner MUST be able to duplicate an order. The copy gets the next number and status Draft. It copies the title (marked as a copy), customer, delivery city, agreed price, currency, Incoterm, destination port, budget and all item lines. It does not copy notes, the expected delivery date or history.

**Order notes**

- **FR-017**: The Owner MUST be able to add free-text notes to an order. Each note records its author and date and time. Notes are shown newest first and cannot be edited.
- **FR-018**: The Owner MUST be able to delete a note, after confirming.

**Deletion and restore**

- **FR-019**: Deleting an order, customer, supplier or note MUST be recoverable, using the platform's recoverable deletion from 001 (FR-024). Deleted records disappear from lists, search, pickers and related pages.
- **FR-020**: The Owner MUST be able to see deleted orders, customers and suppliers and restore them. A restored record comes back with all its data.
- **FR-021**: A customer or supplier MUST NOT be deletable while non-deleted orders use it. The refusal states how many orders use it.

**Settings**

- **FR-022**: The Owner MUST be able to set the order-number prefix: 1–10 characters, Latin letters, digits or dashes, default `HJ`. Settings MUST show a preview of the next order number. Changing the prefix affects only orders created afterwards.

**Audit and permissions**

- **FR-023**: Every create, edit, delete and restore of a customer, supplier, order, item line or note MUST be recorded in the audit log, with the previous and new values for edits.
- **FR-024**: Every new screen and data route MUST go through the permission gate from 001. Each one declares its module (orders, customers or suppliers) and action (view, create, edit, delete). In this feature only the Owner passes; feature 005 adds worker permissions. The agreed price, item prices, budget and supplier identity MUST be declared as sensitive fields, so 005 can hide them (ROADMAP D6).

**Usability**

- **FR-025**: Every screen of this feature MUST work on a 360-pixel-wide phone without sideways scrolling, in English, French and Arabic, with the Arabic layout right-to-left. Amounts MUST use Western digits and show their currency.
- **FR-026**: The dashboard MUST link to Orders, Customers and Suppliers, and show the number of orders in each open status. Open means not Delivered, Closed or Cancelled.

### Key Entities

- **Customer**: a buyer, usually in Morocco or Africa. Fields: name, company, city, country, phone, email, notes, plus recoverable-deletion data. It has many orders.
- **Supplier**: a seller in China, of equipment, transport or services. Fields: name, company, contact person, phone, WeChat ID, email, city, country, notes, plus recoverable-deletion data. Item lines refer to it, and expenses will from 003 on.
- **Order**: one deal with one customer.
  - Fields: number, title, customer, delivery city, status, agreed price, currency, Incoterm, destination port, expected delivery date, budget (CNY), creation date, recoverable-deletion data.
  - It has item lines and notes.
  - Expenses, payments, invoices, documents and shipments attach to it in later features.
- **Order item**: one equipment line of an order. Fields: product name, brand/model, year, quantity, unit price, HS code, specifications, supplier, position in the list.
- **Order note**: a timestamped free-text note on an order, with its author and recoverable-deletion data.
- **Order number counter**: the last number used in each calendar year. It guarantees unique, never-reused numbers.
- **Company settings** (from 001): extended with the order-number prefix.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a phone, the Owner creates an order with a new customer and two items in under 2 minutes.
- **SC-002**: With 5,000 orders stored, a search or filter shows results in under 1 second.
- **SC-003**: 100% of orders have a unique number. Across 1,000 orders created in the same year, including orders created at the same moment from two devices, no number repeats or is skipped, except numbers belonging to deleted orders.
- **SC-004**: Duplicating an order and opening the copy takes under 15 seconds.
- **SC-005**: 100% of creates, edits, deletes and restores of customers, suppliers, orders, items and notes appear in the audit log, with before/after values for edits.
- **SC-006**: Searches for Latin, Arabic and Chinese fragments find 100% of matching orders and customers in a tested sample.
- **SC-007**: Every screen of this feature has no sideways scrolling at 360 pixels wide, in all three languages.
- **SC-008**: 100% of deleted orders, customers and suppliers can be restored with all their data.

## Assumptions

- **Order numbers (decided 2026-10-07)**: `HJ-YYYY-NNN`, prefix editable in Settings, counter restarting every January.
  - The year follows China time (UTC+8), where the company is registered.
  - The counter is shared by all prefixes within a year, so changing the prefix never creates duplicates.
- **Agreed price (decided 2026-10-07)**: typed by hand. Item lines describe the goods, and their total is shown for comparison only. This replaces the proposed default in ROADMAP D7.
- **Currency conversion**: not in this feature. The agreed price stays in its own currency. Exchange rates and the agreed reference rate arrive in 003–004 (ROADMAP D1, D2).
- **Default currency** for a new order is USD, the usual currency for equipment exports. The Owner can change it per order.
- **Budget** is the planned total cost, entered in CNY because costs are compared in the base currency. It is optional; the over-budget alert comes in 008.
- **Quantities** are whole numbers, since machines are sold by the unit.
- **Incoterms** offered: the 11 Incoterms 2020 rules (EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP).
- **Destination port suggestions**: Casablanca, Tanger Med, Agadir, Nador, Jorf Lasfar, Dakar, Abidjan. Any other port can be typed.
- **Status changes** are manual in this feature. The rule against closing an order while money is still owed comes in 004. Status suggestions from shipments come in 007 (ROADMAP D4).
- **Single user**: only the Owner exists until feature 005. "Author" of notes and audit entries is always the Owner for now, but the data records the author so workers fit in later.
- **Volumes**: up to a few thousand orders and customers over several years. Lists load more results as the Owner scrolls rather than all at once.
- **Out of scope here**:
  - expenses, profit and the financial summary figures (003–004);
  - payments and balances (004);
  - invoices (006);
  - documents and shipments (007);
  - reminders (008);
  - exports (009);
  - worker access (005).
