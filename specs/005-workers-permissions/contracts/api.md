# API Contract: Workers and Permissions (005)

All routes go through `route()` with one policy. Bodies are JSON. State-changing requests need an allowed `Origin` (001). The errors use the existing shape `{ error: { code, details? } }`.

## Public

### `GET /api/auth/registration` — `public`
`200 { open: boolean }`

### `POST /api/auth/register` — `public`
Request: `{ username, displayName, password, language }`. The password is typed twice in the web form, and only one copy is sent.
- `201 { status: 'pending' }`
- `400 validation_failed` with fields: `username`, `displayName`, `password` (001 codes); `username_taken` also covers pending, suspended and deleted accounts.
- `403 registration_closed`
- `429 too_many_attempts { retryAfterSeconds }`: more than 5 registrations from this network origin within an hour.

### `POST /api/auth/sign-in` (001) — new outcomes after a correct password
- `403 account_pending`
- `403 account_suspended`
- `403 access_ended { date: 'YYYY-MM-DD' }`
- A deleted account, or a wrong password: `401 invalid_credentials`, as before.

## Self

### `GET /api/me` (001) — extended
```jsonc
{
  "user": { "...": "...", "role": "worker", "mustChangePassword": false },
  "access": {
    "owner": false,
    "modules": { "orders": ["view"], "shipments": ["view","create","edit"] },
    "hidden": ["sellingPrice","paymentAmounts"],
    "orderScope": "assigned",
    "ownEntriesOnly": false,
    "accessEndsOn": null,
    "basicOrdersOnly": false        // true when the worker has an order-bound module but not orders.view
  },
  "company": { "name": "…" },
  "session": { "...": "..." }
}
```
For the Owner: `access = { owner: true, modules: <every module with every action>, hidden: [], orderScope: 'all', ... }`.

### Password change required
While `mustChangePassword` is true, every authenticated route except `GET /api/me`, `POST /api/me/password` and `POST /api/auth/sign-out` answers `403 password_change_required`.

## Owner: users (`owner` policy)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/users?status=pending\|active\|suspended\|ended&deleted=true` | — | `{ items: UserListItem[], pendingCount }` |
| GET | `/api/users/:id` | — | `UserDetail` |
| POST | `/api/users/:id/approve` | `{ templateId, access?: AccessInput }` | `200 UserDetail`; `409 already_decided` |
| POST | `/api/users/:id/reject` | — | `204`; `409 already_decided` |
| PATCH | `/api/users/:id` | `{ displayName?, language? }` | `UserDetail` |
| PUT | `/api/users/:id/access` | `AccessInput` | `UserDetail`; `400 permission_conflict { reason }` |
| POST | `/api/users/:id/apply-template` | `{ templateId }` | `UserDetail` |
| PUT | `/api/users/:id/orders` | `{ orderIds: string[] }` | `UserDetail` (assigned orders replaced) |
| POST | `/api/users/:id/suspend` | — | `UserDetail` |
| POST | `/api/users/:id/reactivate` | — | `UserDetail` |
| POST | `/api/users/:id/password` | `{ temporaryPassword }` | `204` |
| POST | `/api/users/:id/sign-out-everywhere` | — | `204` |
| DELETE | `/api/users/:id` | — | `204` |
| GET | `/api/users/:id/sessions` | — | `SessionItem[]` (001 shape) |
| GET | `/api/users/:id/sign-in-history?cursor=` | — | 001 shape |

Every route answers `404 not_found` for an unknown id, and `403 forbidden` when `:id` is the Owner.

```ts
AccessInput = {
  permissions: PermissionSet;
  orderScope: 'all' | 'assigned' | 'customers';
  customerIds?: string[];            // required (≥1) for 'customers'
  ownEntriesOnly: boolean;
  accessEndsOn: string | null;       // YYYY-MM-DD, not before today (China)
}

UserListItem = {
  id; username; displayName; language; status: 'pending'|'active'|'suspended'|'deleted';
  accessEnded: boolean; template: { id; name; deleted: boolean } | null; adjusted: boolean;
  lastSignInAt: string | null; registeredAt: string;
  registration?: { device; location; at }          // pending only
}
UserDetail = UserListItem & AccessInput & {
  assignedOrders: { id; number; title; status }[];
  customers: { id; name }[];
  mustChangePassword: boolean;
}
```

## Owner: role templates (`owner` policy)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/role-templates` | — | `RoleTemplate[]` (live ones) |
| POST | `/api/role-templates` | `{ name, permissions, orderScope, ownEntriesOnly }` | `201 RoleTemplate` |
| PUT | `/api/role-templates/:id` | `{ name?: string \| null, permissions, orderScope, ownEntriesOnly }` | `RoleTemplate`. A `null` name on a default template restores the translated name |
| DELETE | `/api/role-templates/:id` | — | `204` (soft) |

`RoleTemplate = { id, defaultKey: TemplateKey | null, name: string | null, permissions, orderScope, ownEntriesOnly, usedBy: number }`.

## Owner: order assignees

| Method | Path | Policy | Body | Result |
|---|---|---|---|---|
| GET | `/api/orders/:id/assignees` | `owner` | — | `{ userId, displayName }[]` |
| PUT | `/api/orders/:id/assignees` | `owner` | `{ userIds: string[] }` | the same list |

## Settings

### `PATCH /api/settings` (001) — policy changes from `owner` to `settings:edit`
- `companyName`: workers with `settings.edit` may change it.
- `sessionIdleTimeoutMinutes` and the new `registrationOpen`: Owner only. A worker sending them gets `403 forbidden`.
- `GET /api/settings` (`settings:view`): workers do not receive `sessionIdleTimeoutMinutes` or `registrationOpen`.

### Other settings routes
| Route | Policy before | Policy now |
|---|---|---|
| order-number prefix | owner | `settings:edit` |
| expense categories (changes) | owner | `settings:edit` + `expenses:view` |
| `GET/PATCH /api/settings/payments` | owner | `settings:view/edit`, and both payment channels |
| `GET/PATCH /api/settings/exchange-rates` | owner | `rates:view/edit` |
| audit log, sessions of others | owner | owner (unchanged) |

## Changes to existing 001–004 routes (no new paths)

- **Module policies are now enforced** through `can()` (research R2). `orders:view` routes accept any order-bound module, and the response is the basic order view when the viewer lacks `orders.view`.
- **Scope**: every list, detail, picker, search, total and file route filters by the viewer's scope. An out-of-scope id gives `404 not_found`.
- **Hidden groups**: the keys listed in research R4 are omitted from responses. Derived figures are omitted per the `FIGURES` table. With "own entries only", expense and payment totals come as `yourEntries` instead of the order totals.
- **Saves**: hidden fields are optional in update bodies and are kept from the current record (R11).
  - `403 purchase_hidden`: a viewer with supplier prices or identity hidden saves a purchase expense.
  - `403 forbidden`: setting `closed` without the remaining amount visible.
- **Creating** an order assigns it to its creator when the creator is a worker with the `assigned` scope. A customer created by a worker with the `customers` scope joins their selection.
- **Receipts and proofs**: `404` when the viewer may not see the record. A proof also needs `paymentAmounts` visible. A receipt of a purchase expense needs `supplierPrices` visible.
- **Customer search** drops the phone match when `customerContacts` is hidden.
