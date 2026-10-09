# API Contract: Expenses and Exchange-Rate Service (003)

Conventions are the same as in 001 and 002. Additions:
- **Rates** are decimal strings with up to 6 decimals, meaning "1 unit = X CNY" (e.g. `"7.1"`). Responses always give 6 decimals (`"7.100000"`).
- **Amounts** are 2-decimal strings, as in 002.
- **Sensitive fields** (D6): expense `amount`, `rate`, `cnyAmount`; order `agreedRate` and `financials`.

---

## Expenses

```json
Expense = {
  "id": "…", "orderId": "…", "name": "Trucking Linyi to Qingdao port",
  "category": { "id": "cat-inland_transport_china", "key": "inland_transport_china", "name": null },
  "amount": "1200.00", "currency": "USD", "rate": "7.100000", "rateSource": "auto_edited", "cnyAmount": "8520.00",
  "expenseDate": "2026-10-07",
  "paidTo": { "supplier": { "id": "…", "name": "Linyi Heavy" } } | { "name": "Driver Li" } | null,
  "paymentMethod": "cash", "advancedBy": "Ahmed", "reimbursed": false,
  "status": "paid", "dueDate": null, "hasReceipt": true, "receiptId": "…" | null, "receiptMime": "image/jpeg" | null, "notes": null,
  "createdAt": "…", "createdBy": "hicham", "updatedAt": "…", "updatedBy": "hicham", "deletedAt": null
}
```

### `GET /api/orders/:id/expenses?deleted=` — expenses:view
`deleted=true` lists only the deleted expenses and needs `expenses:delete`.

```json
{ "items": Expense[],                                   // date desc, then newest first
  "totals": { "grand": "1203500.00", "unpaid": "40000.00",
              "byCategory": [ { "category": {…}, "total": "8520.00" } ],
              "byAdvancedBy": [ { "name": "Ahmed", "total": "3500.00", "toReimburse": "1500.00" } ] } }
```
Returns `404` if the order does not exist or is deleted.

### `POST /api/orders/:id/expenses` — expenses:create
Request:
```json
{ "name": "…", "categoryId": "…", "amount": "1200", "currency": "USD", "rate": "7.1", "rateSource": "auto_edited",
  "expenseDate": "2026-10-07", "paidToSupplierId": "…" | null, "paidToName": "…" | null, "paymentMethod": "cash",
  "advancedBy": "Ahmed" | null, "reimbursed": false, "status": "paid", "dueDate": null, "receiptId": "…" | null, "notes": null }
```
- For CNY, `rate` is optional and forced to 1.
- Returns `201 Expense`, or `400 validation_failed` with field codes from data-model.md.
- Audit: `record.created` (target `expense`).

### `GET /api/expenses/:id` — expenses:view
`200 Expense` or `404`.

### `PUT /api/expenses/:id` — expenses:edit
- Same body as POST; it is a full replace.
- `receiptId: null` removes the receipt link; the file is cleaned up as an orphan.
- The CNY amount is recomputed, and USD/MAD snapshots are refreshed only when the date changes.
- Returns `200 Expense`. Audit: `record.updated` with changed fields only.

### `PATCH /api/expenses/:id/status` — expenses:edit
`{ "status": "paid" | "to_pay" }` and/or `{ "reimbursed": true | false }`. Returns `200 Expense` and is audited.

### `DELETE /api/expenses/:id` — expenses:delete
`204` (recoverable). `POST /api/expenses/:id/restore` (expenses:delete) returns `200 Expense`. Both are audited.

### `GET /api/expenses/:id/receipt` — expenses:view
Returns `200` with the file bytes (headers per research R7), or `404` if there is no receipt.

### `POST /api/receipts` — expenses:create
- Multipart, with field `file`. Limit 10 MB (`413 file_too_large`). Type sniffed (`400 file_type_invalid`).
- Returns `201 { "id": "…", "mime": "image/jpeg", "size": 412345 }`.
- The file stays unattached until an expense references it.

### `GET /api/expenses/advanced-by?q=` — expenses:view
`200 { "items": ["Ahmed", "Driver Li"] }`: distinct names, most recent spelling, prefix or substring match, up to 10.

### `GET /api/expenses/reimbursements` — expenses:view
`200 { "items": [ { "name": "Ahmed", "toReimburse": "3500.00", "expenseCount": 2 } ] }`
- Only amounts above 0, largest first.
- Counts non-reimbursed, non-deleted expenses of non-deleted orders.

### `GET /api/expenses/to-reimburse?person=` — expenses:view
The expenses behind one line of the reimbursements block (FR-020), matched on the normalized name.
`200 { "person": "Ahmed", "total": "3500.00", "items": (Expense & { "order": { "id", "number", "title" } })[] }`, newest first.

## Expense categories

```json
Category = { "id": "cat-labor", "key": "labor", "name": null, "position": 7, "hidden": false }
```

- `GET /api/expense-categories?includeHidden=` — expenses:view. Returns `200 { items: Category[] }` in display order.
- `POST /api/expense-categories` — owner. Takes `{ "name": "Spare parts" }` and returns `201 Category` at the end of the list. Audited.
- `PATCH /api/expense-categories/:id` — owner. Takes `{ "name"?: string, "hidden"?: boolean }`. Renaming a default stores the typed name. Returns `200 Category`. Audited.

## Exchange rates

### `GET /api/rates?currency=USD&date=2026-10-01` — authenticated
- `date` is optional (default: latest). Served from the cache, or fetched per research R3.
- Returns `200 { "currency": "USD", "rate": "7.100000", "rateDate": "2026-10-01", "provider": "currency_api", "exact": true }`.
  `exact: false` means the provider had no rate for that date and this is the latest one, labelled with its own `rateDate`.
- Returns `503 rates_unavailable` within 5 s when the provider fails or is `manual`.
- `currency=CNY` is not allowed (`400 currency_invalid`).

### `GET /api/rates/config` — authenticated
What every rate field needs, for any signed-in user: `200 { "provider": "currency_api", "autoFill": true, "attribution": null | { "text", "url" } }`. It never includes the key or the fetch status.

### `GET /api/settings/exchange-rates` — owner
```json
{ "provider": "currency_api", "providers": ["currency_api", "exchangerate_api_open", "manual"],
  "apiKeySet": false, "apiKeyLast4": null, "autoFill": true,
  "lastFetchAt": "…" | null, "lastError": "rates_unavailable" | null, "lastErrorAt": "…" | null,
  "attribution": null | { "text": "Rates By Exchange Rate API", "url": "https://www.exchangerate-api.com" } }
```

### `PATCH /api/settings/exchange-rates` — owner
Takes `{ "provider"?, "apiKey"?: string | null, "autoFill"? }` and returns `200` with the same shape. Audited as `settings.updated`, with the key masked out.

### `POST /api/rates/refresh` — owner
Fetches the latest now and returns `200 { "rates": [ { "currency": "USD", "rate": "…", "rateDate": "…" } ], "fetchedAt": "…" }`, or `503 rates_unavailable`.

## Orders (extended from 002)

- **Order input** (POST and PUT) gains `agreedRate` (rate string). It is required when `currency ≠ CNY` (`rate_required`), and ignored for CNY.
- **The `Order` response** gains:
```json
"agreedRate": "7.100000" | null,
"financials": {
  "agreedPriceCny": "1349000.00" | null, "expensesTotal": "1203500.00", "unpaid": "40000.00",
  "profit": "145500.00" | null, "marginPercent": "10.8" | null, "budgetUsedPercent": "100.3" | null,
  "profitUnavailableReason": null | "agreed_rate_missing"
}
```
- **Duplicate** copies `agreedRate`.
- **Supplier delete** returns `409 in_use { count }`, where the count now includes expenses paid to the supplier.

## New error codes

`category_invalid`, `rate_invalid`, `rate_required`, `receipt_invalid`, `file_too_large`, `file_type_invalid`, `rates_unavailable`.

---

## Client UI contract

| Where | What |
|---|---|
| Order page → **Expenses** tab | List with totals (category, unpaid, grand, per person), "Add expense", "Show deleted expenses" |
| `/orders/:id/expenses/new`, `/expenses/:id/edit` | Expense form (full screen on phones): camera/file receipt, live CNY amount, rate with "Fetch rate" + date/source label, typo warning, paid-to picker (supplier or name), advanced-by with suggestions |
| `/expenses/:id` | Expense detail: receipt preview, created/updated by, mark paid / reimbursed, edit, delete |
| Order page summary | Agreed price (CNY), expenses, profit, margin, unpaid, budget used, or the "Set the agreed rate" link |
| Order form | "Agreed rate (1 USD = … CNY)" with "Fetch rate", shown when currency ≠ CNY |
| Dashboard | "To reimburse" block; each person links to `/reimbursements?person=` (their open expenses, each with "Mark reimbursed") |
| Settings | "Exchange rates" (provider, key, auto-fill, refresh, status, attribution) and "Expense categories" (add, rename, hide/show) |
