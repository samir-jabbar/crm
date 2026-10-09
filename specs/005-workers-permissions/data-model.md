# Data Model: Workers and Permissions (005)

One generated migration (`0008_workers_permissions.sql`) and one seed migration (`0009_role_templates.sql`). Both run under the 004 safe-migration procedure: a pre-migration copy, foreign keys off around Drizzle's transaction, then `foreign_key_check`. No table is rebuilt: every change is an added column or a new table.

## Shared types (`packages/shared`)

```ts
MODULES = ['orders','customers','suppliers','expenses','payments.direct','payments.bank',
           'shipments','documents','invoices','dashboard','advisor','rates','settings']
MODULE_ACTIONS: Record<Module, PolicyAction[]>   // dashboard: view, export · advisor: view · rates, settings: view, edit · others: all five
ORDER_BOUND_MODULES = ['expenses','payments.direct','payments.bank','shipments','documents','invoices']
HIDDEN_GROUPS = ['sellingPrice','supplierPrices','supplierIdentity','customerContacts','paymentAmounts','bankDetails']
ORDER_SCOPES  = ['all','assigned','customers']
TEMPLATE_KEYS = ['logistics','site_assistant','accountant','sales_assistant','read_only']

PermissionSet = { modules: Partial<Record<Module, PolicyAction[]>>; hidden: HiddenGroup[] }
Access        = PermissionSet & { orderScope; ownEntriesOnly; customerIds?; owner: boolean }   // built per request
```

`permissionSetSchema` normalizes (adds `view`, drops actions a module does not offer, sorts) and rejects conflicts (research R10).

## Changed tables

### `users` (001) — added columns

| Column | Type | Rule |
|---|---|---|
| `permissions` | text (JSON `PermissionSet`) | null for the Owner and pending accounts; required when a worker is active, suspended or past their end date |
| `order_scope` | text | `all` / `assigned` / `customers`, default `all`; CHECK |
| `own_entries_only` | integer 0/1 | default 0 |
| `access_ends_on` | text `YYYY-MM-DD` | nullable; China date, inclusive |
| `template_id` | text → `role_templates.id` | nullable |
| `permissions_adjusted` | integer 0/1 | 1 once the access differs from the template it was copied from |
| `must_change_password` | integer 0/1 | default 0; set by an Owner reset |
| `approved_at`, `approved_by` | integer, text → users | set on approval |
| `rejected_at` | integer | set on rejection; with `status='deleted'` and `username_normalized='!rejected:<id>'` (frees the username) |
| `deleted_at` | integer | set when the Owner deletes a worker; `username_normalized` kept, so the name is never reused |

The existing triggers still protect the Owner: the Owner cannot be deleted, demoted or suspended.

**States**:

```
pending ──approve──▶ active ◀──reactivate── suspended
   │                  │  └──suspend──────────▲
   └─reject─▶ deleted(rejected)   active/suspended ──delete──▶ deleted
"Access ended" is derived (active + access_ends_on < today, China time), not a stored status.
```

### `company_settings` (001)
- `registration_open` integer 0/1, default 1. It is Owner-only, with session timeout.

### `sign_in_attempts.reason` (001)
- The enum gains `account_pending`, `account_suspended` and `access_ended`. Reasons are stored as text, so this needs no schema change.

## New tables

### `role_templates`
| Column | Type | Rule |
|---|---|---|
| `id` | text PK | seeds use `tpl-<key>` |
| `default_key` | text, unique, nullable | one of `TEMPLATE_KEYS` for the five defaults |
| `name` | text, nullable | null shows the translated default name; 1–60 characters when set; unique among live templates (normalized) |
| `permissions` | text JSON `PermissionSet` | validated |
| `order_scope`, `own_entries_only` | as on `users` | the default scope copied on apply |
| `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` | | soft delete |

Seed contents follow spec FR-015.

### `order_assignments`
| Column | Type | Rule |
|---|---|---|
| `order_id` | text → orders | PK part |
| `user_id` | text → users | PK part; the user must be a worker |
| `assigned_at`, `assigned_by` | integer, text → users | |

Index: `(user_id, order_id)`. Rows of deleted orders stay, so a restored order keeps its assignees. Rows of a deleted worker are removed.

### `user_customers`
| Column | Type | Rule |
|---|---|---|
| `user_id` | text → users | PK part |
| `customer_id` | text → customers | PK part |

Index: `(user_id, customer_id)`. Used when `order_scope = 'customers'`.

### `registrations`
| Column | Type | Rule |
|---|---|---|
| `id` | text PK | |
| `user_id` | text → users | the registered account |
| `ip`, `user_agent`, `device_label`, `location` | text | the same fields as a sign-in attempt |
| `created_at` | integer | |

Index: `(ip, created_at)`, used to limit registrations to 5 per hour from one network origin.

## New indexes on existing tables
- `expenses(created_by)`, `payments(created_by)`: for "own entries only".

## Validation rules (from the spec)

| Rule | Where |
|---|---|
| Username 3–32 characters `[A-Za-z0-9._-]`, unique case-insensitive; password ≥ 10 characters, not common (001) | register, temporary password |
| Approving needs a live template | approve |
| `order_scope='customers'` needs at least one customer; `'assigned'` may start empty | access update |
| `access_ends_on` ≥ today (China date) when set | access update |
| Conflicting permission sets → `400 permission_conflict { reason }` | access update, templates |
| The Owner cannot be the target of any account action | every user route |
| Assignments only to workers that are active, suspended or pending | assignment routes |

## Audit (new actions)

`user.registered`, `user.approved`, `user.rejected`, `user.access_changed` (before/after: permissions, scope, customers, end date, template), `user.updated` (display name, language), `user.suspended`, `user.reactivated`, `user.deleted`, `user.password_reset`, `user.signed_out_everywhere`, `template.created`, `template.updated`, `template.deleted`, `order.assignees_changed` (before/after user ids). `settings.updated` now also covers `registrationOpen`.
