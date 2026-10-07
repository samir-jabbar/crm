# API Contract: Customers, Suppliers and Orders (002)

Conventions are the same as 001 ([../../001-platform-foundation/contracts/api.md](../../001-platform-foundation/contracts/api.md)):
- same-origin JSON;
- `hj_session` cookie;
- `{error:{code,details}}` errors;
- every route declares a policy, and responses go through presenters.

Additional conventions:
- **Amounts** are decimal strings with 2 decimals, e.g. `"190000.00"`. Requests accept 0–2 decimals.
- **Policies** are written `orders:view`, `customers:edit`, … (`{ module, action }`). They are Owner-only until 005.
- **Sensitive fields** (D6, hidden for restricted users from 005): `agreedPrice`, `budgetCny`, `itemsTotal`, `priceDifference`, `items[].unitPrice`, `items[].lineTotal`, `items[].supplier`.
- `?deleted=true` on a list returns only deleted records (for restore). It needs the `delete` action of that module.

---

## Customers

### `GET /api/customers?q=&cursor=&limit=&deleted=` — customers:view
`200 { items: Customer[], nextCursor }`, sorted by name. `q` matches name, company, city or phone (normalized, R3).

```json
Customer = { "id": "…", "name": "شركة الدار البيضاء للمعدات", "company": null, "city": "Casablanca", "country": "Morocco",
             "phone": "+212 6 12 34 56 78", "email": null, "notes": null, "orderCount": 3,
             "createdAt": "…", "updatedAt": "…", "deletedAt": null }
```

### `POST /api/customers` — customers:create
Request: `{ name, company?, city?, country?, phone?, email?, notes?, confirmDuplicate? }`
- `201 Customer`
- `400 validation_failed`
- `409 customer_name_exists { existingId }`: the same name exists and `confirmDuplicate` was not set.
- Audit: `record.created` (target `customer`).

### `GET /api/customers/:id` — customers:view
`200 Customer`, or `404`.

### `PATCH /api/customers/:id` — customers:edit
Any subset of the fields. `200 Customer`. Audit: `record.updated`, with the changed fields.

### `GET /api/customers/:id/orders` — customers:view + orders:view
`200 { items: OrderListItem[] }`, newest first, non-deleted only.

### `DELETE /api/customers/:id` — customers:delete
- `204`
- `409 in_use { count }`
- Audit: `record.deleted`.

### `POST /api/customers/:id/restore` — customers:delete
- `200 Customer`
- `404` if the customer is not deleted.
- Audit: `record.restored`.

## Suppliers

Same shape and rules as customers, with these differences:
- **Fields**: `{ name, company, contactPerson, phone, wechat, email, city, country, notes }`, with `country` defaulting to `"China"`. Response adds `orderCount` (orders using the supplier).
- **No duplicate-name check.**
- **Routes**:
  - `GET /api/suppliers` — suppliers:view;
  - `POST /api/suppliers` — suppliers:create;
  - `GET /api/suppliers/:id` — suppliers:view;
  - `PATCH /api/suppliers/:id` — suppliers:edit;
  - `GET /api/suppliers/:id/orders` — suppliers:view + orders:view;
  - `DELETE /api/suppliers/:id` — suppliers:delete. Returns `409 in_use { count }` while items of non-deleted orders use it;
  - `POST /api/suppliers/:id/restore` — suppliers:delete.

## Orders

```json
OrderListItem = { "id": "…", "number": "HJ-2026-001", "title": "2 Doosan excavators for MJTR Gold",
                  "customer": { "id": "…", "name": "MJTR Gold" }, "status": "confirmed",
                  "agreedPrice": "190000.00", "currency": "USD", "createdAt": "…", "deletedAt": null }

Order = OrderListItem + {
  "deliveryCity": "Casablanca", "incoterm": "CIF", "destinationPort": "Casablanca",
  "expectedDeliveryDate": "2026-12-15", "budgetCny": "1200000.00",
  "items": [ { "id": "…", "position": 0, "productName": "Excavator", "brandModel": "Doosan DX225LC",
               "year": 2021, "quantity": 2, "unitPrice": "85000.00", "lineTotal": "170000.00",
               "hsCode": "8429.52", "specs": "…", "supplier": { "id": "…", "name": "Linyi Heavy" } } ],
  "itemsTotal": "182500.00", "priceDifference": "7500.00", "updatedAt": "…"
}
```

### `GET /api/orders?q=&status=&customerId=&from=&to=&deleted=&cursor=&limit=` — orders:view
- `status` is a comma-separated list of codes.
- `from` / `to` are ISO instants on the creation time; `to` is inclusive.
- `q` matches the number, title, customer name, and item product name or brand/model (R3).
- Returns `200 { items: OrderListItem[], nextCursor }`, newest first.

### `GET /api/orders/summary` — orders:view
`200 { "openByStatus": { "draft": 2, "confirmed": 1, … }, "openTotal": 7 }`. Only open statuses, non-deleted.

### `POST /api/orders` — orders:create
Request:
```json
{ "title": "…", "customerId": "…", "deliveryCity": "…", "status": "draft",
  "agreedPrice": "190000", "currency": "USD", "incoterm": "CIF", "destinationPort": "Casablanca",
  "expectedDeliveryDate": "2026-12-15", "budgetCny": "1200000",
  "items": [ { "productName": "Excavator", "brandModel": "Doosan DX225LC", "year": 2021, "quantity": 2,
               "unitPrice": "85000", "hsCode": "8429.52", "specs": "…", "supplierId": "…" } ] }
```
- `201 Order`, with its number assigned (R2).
- `400 validation_failed`. Item errors are keyed `items.<index>.<field>`.
- Audit: `record.created` (target `order`, with number, title, customer, price, currency, item count).

### `GET /api/orders/:id` — orders:view
`200 Order`, or `404`. Deleted orders return `404`, except with `?deleted=true` (orders:delete).

### `PUT /api/orders/:id` — orders:edit
- The full editable order, as in POST. Items carry `id` when they already exist; missing items are removed, and array order sets `position` (R4).
- The number never changes.
- `200 Order`. Audit: one `record.updated`, with the changed fields and, if changed, `items` before/after.

### `PATCH /api/orders/:id/status` — orders:edit
`{ "status": "purchased" }` → `200 Order`. Audit: `record.updated` with `{ status }` before/after.

### `POST /api/orders/:id/duplicate` — orders:create
`201 Order`: the copy (FR-016). It has a new number, status `draft`, the title suffixed with the translated "(copy)" sent by the client as `titleSuffix`, no notes, and no expected delivery date.

Request `{ "titleSuffix": " (copy)" }`, optional.

Audit: `record.created` with `{ duplicatedFrom: "<number>" }`.

### `DELETE /api/orders/:id` — orders:delete
`204`. Audit: `record.deleted`.

### `POST /api/orders/:id/restore` — orders:delete
- `200 Order`
- `409 customer_deleted`: restore the customer first.
- `404` if the order is not deleted.

## Order notes

```json
OrderNote = { "id": "…", "body": "Customer asked for an extra bucket",
              "author": { "id": "…", "label": "hicham" }, "createdAt": "…" }
```

- `GET /api/orders/:id/notes` — orders:view. Returns `200 { items: OrderNote[] }`, newest first, non-deleted.
- `POST /api/orders/:id/notes` — orders:edit. Takes `{ body }` and returns `201 OrderNote`. Audit: `record.created` (target `order_note`).
- `DELETE /api/orders/:id/notes/:noteId` — orders:edit. Returns `204`. Audit: `record.deleted`.

## Settings (extended from 001)

- `GET /api/settings` adds `"orderNumberPrefix": "HJ"` and `"nextOrderNumber": "HJ-2026-008"` (a preview; nothing is reserved).
- `PATCH /api/settings` accepts `orderNumberPrefix` (`prefix_invalid` on a bad value). Audited as `settings.updated`.

---

## Client routes (UI contract)

| Path | Screen |
|---|---|
| `/orders` | Order list: search, status/customer/date filters, "Deleted" toggle, "New order" |
| `/orders/new` | New-order form (customer picker with inline create, items editor) |
| `/orders/:id?tab=overview\|expenses\|payments\|shipment\|documents\|invoices\|notes\|reminders` | Order control center |
| `/orders/:id/edit` | Edit order (same form as new) |
| `/customers`, `/customers/new`, `/customers/:id`, `/customers/:id/edit` | Customer list, form, page with orders |
| `/suppliers`, `/suppliers/new`, `/suppliers/:id`, `/suppliers/:id/edit` | Supplier list, form, page with orders |

The dashboard (`/`) adds "Orders", "Customers" and "Suppliers" cards, and open orders by status. Settings adds an "Order numbers" section with the prefix and a preview.
