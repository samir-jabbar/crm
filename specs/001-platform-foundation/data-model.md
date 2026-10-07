# Data Model: Platform Foundation (001)

**Storage**: SQLite (WAL) via Drizzle ORM. Conventions apply to every feature:
- **IDs**: `text` UUID (random), except where noted.
- **Timestamps**: `integer` epoch milliseconds, in UTC. They are converted to local time only for display.
- **Text**: stored as UTF-8 exactly as entered (FR-028). Normalized copies exist only for lookups (`username_normalized`).
- **Recoverable deletion** (FR-024, used from 002 onward): business tables add `deleted_at integer NULL` and `deleted_by text NULL REFERENCES users(id)`. The default queries filter `deleted_at IS NULL`.
- **Money** (from 003, per D1): never floating point. Each money record stores its original amount, currency, and a frozen rate to CNY.

---

## users

A person who can sign in.

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUID |
| username | text | As entered (trimmed). 3–32 chars, `[A-Za-z0-9._-]` |
| username_normalized | text UNIQUE | `lower(trim(username))`, used for sign-in lookup (FR-007) |
| display_name | text | 1–80 chars, any script |
| password_hash | text | Argon2id encoded string |
| role | text | `owner` \| `worker` (`worker` used from 005) |
| status | text | `active` \| `pending` \| `suspended` \| `deleted` (`pending`/`suspended`/`deleted` used from 005) |
| language | text | `en` \| `fr` \| `ar` |
| password_changed_at | integer | |
| created_at | integer | |
| updated_at | integer | |

**Constraints**
- `CHECK (role IN ('owner','worker'))`, `CHECK (status IN (...))`, `CHECK (language IN ('en','fr','ar'))`.
- Partial unique index: at most one Owner. `CREATE UNIQUE INDEX users_one_owner ON users(role) WHERE role = 'owner'`.
- Trigger `users_owner_no_delete`: `BEFORE DELETE ON users WHEN OLD.role = 'owner'` → `RAISE(ABORT, 'owner_protected')`.
- Trigger `users_owner_no_demote`: `BEFORE UPDATE OF role, status ON users WHEN OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.status <> 'active')` → `RAISE(ABORT, 'owner_protected')`.

**State**: the Owner is always `active`. Worker transitions (`pending → active`, `active ↔ suspended`, `→ deleted`) are defined in 005.

---

## sessions

One signed-in device.

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUID. This is the public ID shown in the session list, never the token |
| token_hash | text UNIQUE | SHA-256 (hex) of the cookie token |
| user_id | text FK → users.id | |
| created_at | integer | Sign-in time |
| last_active_at | integer | Updated at most once per minute |
| expires_at | integer | `created_at + 30 days` (absolute, FR-013) |
| revoked_at | integer NULL | |
| revoked_reason | text NULL | `sign_out` \| `timeout` \| `remote` \| `revoke_all` \| `password_change` \| `server_reset` |
| ip | text | Network origin |
| user_agent | text | Raw value |
| device_label | text | e.g. "iPhone · Safari", parsed at sign-in |
| location | text NULL | e.g. "Casablanca, MA", or NULL if unknown |

**Indexes**: `(user_id, revoked_at)`.

**Validity rule**: a session is valid only if all of these hold:
- `revoked_at IS NULL`;
- `now < expires_at`;
- `now − last_active_at < settings.session_idle_timeout_minutes`.

When a session fails the idle check, it is marked `revoked_reason = 'timeout'`.

**Transitions**: `active → revoked(reason)`. This is terminal; a revoked session is never reactivated.

---

## sign_in_attempts

Feeds the sign-in history (FR-016) and the guessing blocks (FR-011).

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUID |
| occurred_at | integer | |
| username_input | text | As typed, truncated to 64 characters |
| username_normalized | text | For the per-account block count |
| user_id | text NULL FK → users.id | Set if the username matched an account |
| outcome | text | `success` \| `failure` \| `blocked` |
| reason | text | `ok` \| `invalid_credentials` \| `account_blocked` \| `ip_blocked` \| `account_inactive` |
| ip | text | |
| user_agent | text | |
| device_label | text | |
| location | text NULL | |

**Indexes**: `(username_normalized, occurred_at)`, `(ip, occurred_at)`, `(user_id, occurred_at)`.

**Block rule**: a sign-in is blocked if either of these is true:
- `count(outcome='failure' AND username_normalized=? AND occurred_at > now − 15 min) >= 5`;
- `count(outcome='failure' AND ip=? AND occurred_at > now − 15 min) >= 5`.

`retryAfter` = oldest counted failure + 15 min − now.

---

## audit_entries

Append-only (FR-020 – FR-022).

| Column | Type | Rules |
|---|---|---|
| id | text PK | UUID |
| occurred_at | integer | |
| actor_user_id | text NULL FK → users.id | NULL for system or unknown actors |
| actor_label | text | Username snapshot, `system:cli`, or the typed username for failed sign-ins |
| action | text | Dotted code (see below) |
| target_type | text NULL | e.g. `user`, `session`, `settings` (later `order`, `expense`, …) |
| target_id | text NULL | |
| ip | text NULL | |
| user_agent | text NULL | |
| device_label | text NULL | |
| before_json | text NULL | JSON of the changed fields before the change |
| after_json | text NULL | JSON of the changed fields after the change |

**Indexes**: `(occurred_at)`, `(actor_user_id, occurred_at)`, `(action, occurred_at)`.

**Triggers**: `audit_no_update` (`BEFORE UPDATE`) and `audit_no_delete` (`BEFORE DELETE`) → `RAISE(ABORT, 'audit_append_only')`.

**Actions in 001**:
- `setup.owner_created`
- `auth.sign_in`
- `auth.sign_in_failed`
- `auth.sign_in_blocked`
- `auth.sign_out`
- `session.revoked`
- `session.revoked_all`
- `session.timed_out` (recorded when detected)
- `password.changed`
- `password.server_reset`
- `profile.updated` (language, display name)
- `settings.updated`

Reserved for later: `record.created`, `record.updated`, `record.deleted`, `record.restored`.

**Sensitive values** (password hashes, tokens) are never written to `before_json` or `after_json`.

---

## company_settings

A single row (FR-035 – FR-037).

| Column | Type | Rules |
|---|---|---|
| id | integer PK | `CHECK (id = 1)` |
| company_name | text | 0–120 chars, any script; empty until set |
| base_currency | text | `CHECK (base_currency = 'CNY')` (D1) |
| session_idle_timeout_minutes | integer | `CHECK (BETWEEN 15 AND 10080)`, default 720 (12 h) |
| updated_at | integer | |
| updated_by | text NULL FK → users.id | |

Seeded with defaults by the initial migration. Seller profile and bank accounts are added in 006.

---

## currencies

Reference data (FR-036).

| Column | Type | Rules |
|---|---|---|
| code | text PK | ISO 4217: `CNY`, `USD`, `MAD`, `EUR` |
| symbol | text | `¥`, `$`, `DH`, `€` |
| minor_units | integer | 2 for all four |
| sort_order | integer | CNY 1, USD 2, MAD 3, EUR 4 |

Seeded by migration. Display names come from client translations (`currency.CNY`, …), not from the database.

---

## app_state

Key/value store for platform state.

| Column | Type | Rules |
|---|---|---|
| key | text PK | `setup_code_hash`, `setup_completed_at`, `schema_seeded_at` |
| value | text | |

---

## Relationships

```text
users 1 ── * sessions
users 1 ── * sign_in_attempts      (user_id nullable)
users 1 ── * audit_entries         (actor_user_id nullable)
users 1 ── * company_settings.updated_by (single row)
```

## Validation rules (shared zod schemas in `packages/shared`)

| Field | Rule | Error code |
|---|---|---|
| username | trimmed, 3–32, `^[A-Za-z0-9._-]+$` | `username_invalid` |
| username (setup) | must be unique (normalized) | `username_taken` |
| display_name | trimmed, 1–80 | `display_name_invalid` |
| password | 10–128 chars | `password_too_short` / `password_too_long` |
| password | not in the common-password list (case-insensitive) | `password_too_common` |
| language | `en` \| `fr` \| `ar` | `language_invalid` |
| company_name | trimmed, 0–120 | `company_name_invalid` |
| session_idle_timeout_minutes | integer 15–10080 | `timeout_out_of_range` |
| setup_code | non-empty, matches the stored hash | `setup_code_invalid` |
