# API Contract: Payments and Order Financial Summary (004)

Conventions are the same as in 001–003:
- **Amounts** are 2-decimal strings.
- **Rates** are 6-decimal strings, meaning "1 unit = X CNY".
- **Percentages** are 1-decimal strings (`"30.0"`). In plans they have up to 2 decimals (`"30"`, `"12.5"`).
- **Sensitive fields** (D6, research R9): every amount, rate, value and summary figure below, and the order's `financials`.

---

## Payments

```json
Payment = {
  "id": "…", "orderId": "…", "channel": "bank", "type": "balance",
  "amount": "133000.00", "currency": "USD", "paymentDate": "2026-10-07", "reference": "BOC-778812",
  "rates": { "USD": "7.100000", "MAD": "0.710000", "EUR": null },
  "rateSource": "auto", "ratesFetchedAt": "…" | null,
  "marketRate": { "rate": "7.100000", "rateDate": "2026-10-07" } | null,
  "bank": { "rate": "7.050000", "name": "Bank of China", "rateType": "buying", "at": "2026-10-07T02:30:00.000Z" } | null,
  "cnyAmount": "937650.00",
  "countsAs": { "amount": "133000.00", "currency": "USD", "manual": false },
  "usdAmount": "133000.00", "madAmount": "1320633.80",
  "gap": { "cny": "-6650.00", "percent": "-0.7" } | null,
  "hasProof": true, "proofId": "…" | null, "proofMime": "image/jpeg" | null, "notes": null,
  "createdAt": "…", "createdBy": "hicham", "updatedAt": "…", "updatedBy": "hicham", "deletedAt": null
}
```

- `gap` is present only when both a bank rate and a market rate are known.
- `madAmount` in the example = 937,650.00 ÷ 0.71, rounded half up.

### `GET /api/orders/:id/payments?deleted=` — payments:view

- `deleted=true` lists only the deleted payments and needs `payments:delete`.
- Channels the viewer may not see are left out of `items` and `summary` (R9).

```json
{ "items": Payment[],   // payment date desc, then newest first
  "summary": PaymentSummary }

PaymentSummary = {
  "currency": "USD", "agreedPrice": "190000.00",
  "channels": [
    { "channel": "direct", "name": null, "planned": "57000.00", "received": "57000.00", "remaining": "0.00" },
    { "channel": "bank",   "name": null, "planned": "133000.00", "received": "0.00", "remaining": "133000.00" } ],
  "plan": [ { "id": "…", "position": 0, "type": "deposit", "channel": "direct", "percent": "30",
              "amount": "57000.00", "dueBeforeStatus": "in_production", "dueDate": null }, … ],
  "received": "57000.00", "remaining": "133000.00", "overpaid": "0.00", "percentPaid": "30.0",
  "receivedTotals": { "cny": "404700.00", "usd": "57000.00", "mad": "570000.00" },
  "averageRates": [ { "currency": "USD", "rate": "7.100000" } ],
  "agreedRate": "7.100000" | null, "remainingCny": "944300.00" | null, "fxResultCny": "0.00" | null,
  "warnings": { "overpaid": "1000.00" | null, "bankOverInvoice": "1000.00" | null }
}
```

- `name: null` means the translated default channel name.
- Returns `404` if the order does not exist or is deleted.

### `POST /api/orders/:id/payments` — payments:create, plus the channel's scope

Request:

```json
{ "channel": "bank", "type": "balance", "amount": "133000", "currency": "USD", "paymentDate": "2026-10-07",
  "reference": "BOC-778812",
  "rates": { "USD": "7.1", "MAD": "0.71", "EUR": null }, "rateSource": "auto", "ratesFetchedAt": "2026-10-07T02:31:00.000Z" | null,
  "bank": { "rate": "7.05", "name": "Bank of China", "rateType": "buying", "at": "2026-10-07T02:30:00.000Z" } | null,
  "countsAs": null | "56800",
  "proofId": "…" | null, "notes": null }
```

- `countsAs: null` means it is computed (research R1). A string is a manual override, allowed only when the payment's currency differs from the order's.
- The server sets `marketRate` from the rate cache (R3) and computes every value.
- Returns `201 Payment`, or `400 validation_failed` with field codes from data-model.md. Audit: `record.created` (target `payment`).

### `GET /api/payments/config` — payments:view

`200 { "channels": { "direct": { "name": null | "Cash and agents" }, "bank": { "name": null } }, "banks": ["Bank of China", "ICBC", "ABC", "CCB"] }`.

### `GET /api/payments/:id` — payments:view

`200 Payment`, or `404`.

### `PUT /api/payments/:id` — payments:edit

- Same body as POST; it is a full replace.
- A manual `countsAs` is kept only while it is sent. `countsAs: null` goes back to the computed value.
- The market rate is refreshed from the cache only when the date or the currency changes.
- Returns `200 Payment`. Audit: `record.updated` with the changed fields only.

### `DELETE /api/payments/:id` — payments:delete

`204`, recoverable. `POST /api/payments/:id/restore` (payments:delete) returns `200 Payment`. Both are audited.

### `GET /api/payments/:id/proof` — payments:view

Returns the file, with the same headers as receipts (003 R7): images inline, PDFs as downloads, `sandbox`, `nosniff`, `private, no-store`. Returns `404` when there is no proof.

### `POST /api/payment-proofs` — payments:create

- Multipart, with field `file`. Limit 10 MB (`413 file_too_large`). Type sniffed (`400 file_type_invalid`).
- Returns `201 { "id", "mime", "size" }`.

## Payment plan

### `PUT /api/orders/:id/payment-plan` — payments:edit

Request: `{ "stages": [ { "type": "deposit", "channel": "direct", "percent": "30", "dueBeforeStatus": "in_production" | null, "dueDate": null } ] }`

- The stages are 1–10 in display order and total exactly 100 (`400 plan_total_invalid`).
- Returns `200 { "plan": PlanStage[] }` with the computed amounts. Audit: `record.updated` (target `order`, field `paymentPlan`).

## Settings

### `GET /api/settings/payments` — owner

```json
{ "channelNames": { "direct": null, "bank": null },
  "defaultPlan": [ { "type": "deposit", "channel": "direct", "percent": "30", "dueBeforeStatus": "in_production" },
                   { "type": "balance", "channel": "bank", "percent": "70", "dueBeforeStatus": "on_vessel" } ],
  "banks": ["Bank of China", "ICBC", "ABC", "CCB"] }
```

### `PATCH /api/settings/payments` — owner

- Takes any of `{ "channelNames": { "direct"?: string | null, "bank"?: string | null }, "defaultPlan"?: […], "banks"?: string[] }`. `banks` replaces the whole list, in the order given.
- Returns `200` with the same shape. Audited as `settings.updated` (target `payment_settings`), changed parts only.

## Orders (extended from 002/003)

- **Order `financials`** gains:

```json
"received": "57000.00", "remaining": "133000.00", "overpaid": "0.00", "percentPaid": "30.0",
"receivedCny": "404700.00", "remainingCny": "944300.00" | null, "fxResultCny": "0.00" | null
```

  `profit` and `marginPercent` now follow D2 (research R5). `agreedPriceCny`, `expensesTotal`, `unpaid` and `budgetUsedPercent` are unchanged from 003.
- **`PATCH /api/orders/:id/status`** takes `{ "status", "confirmOutstanding"?: true }`. Closing with money remaining and no confirmation returns `409 balance_outstanding { "remaining": "133000.00", "currency": "USD" }`.
- **`PUT /api/orders/:id`**: the same `confirmOutstanding` rule. Changing `currency` while payments exist returns `400 validation_failed { "currency": "currency_locked" }`.
- **Create** copies the default plan. **Duplicate** copies the source order's plan (not its payments).

## New error codes

`balance_outstanding`, `currency_locked`, `plan_total_invalid`, `channel_invalid`, `payment_type_invalid`, `bank_rate_incomplete`, `proof_invalid`.

`details` gains `remaining?: string` and `currency?: CurrencyCode`.

---

## Client UI contract

| Where | What |
|---|---|
| Order page → **Payments** tab | Summary (received / remaining / % paid; CNY, USD, MAD totals; average rates; exchange result; warnings); the plan card with "Edit plan"; two channel sections (planned / received / remaining + "Add payment"); history (cards on phones, a table from `sm`); "Show deleted payments" |
| `/orders/:id/payments/new?channel=`, `/payments/:id/edit` | Payment form (full screen on phones): channel, type, amount, currency, date, reference; the rate block (USD, MAD, EUR when needed, inverses, "Fetch rate", source); the optional bank block; live results (CNY / USD / MAD, "Counts as" with an override, the three rates side by side, CNY actually received, the gap); live warnings; proof; notes |
| `/payments/:id` | Payment detail: every value as frozen, proof, created/updated by, edit, delete |
| `/orders/:id/payment-plan` | Plan editor: stages with type, channel, %, due before (status) and due date; live amounts and total |
| Order Overview summary | 003 figures + received, remaining to collect, % paid, exchange result; D2 profit |
| Status select and order form | Confirmation dialog on `balance_outstanding`, then resend with `confirmOutstanding: true` |
| Settings | "Payments" section: channel names, default plan, list of Chinese banks |
