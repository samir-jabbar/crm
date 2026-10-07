# API Contract: Platform Foundation (001)

**Base path**: `/api`. The client and the API are served from one origin.

## Conventions

- **Format**: JSON bodies, UTF-8. Request and response schemas live as zod schemas in `packages/shared/src/api/`, and the server and client import the same schemas.
- **Auth**: the `hj_session` cookie (HttpOnly, SameSite=Lax, Secure in production). There are no bearer tokens.
- **CSRF**: every non-GET request must carry a same-origin `Origin` / `Sec-Fetch-Site` header. Otherwise the response is `403 csrf_rejected`.
- **Errors**: `{"error": {"code": "<snake_case>", "details": {...}?}}`. The client translates `code` and never shows server text.
  - `401 unauthenticated`: no valid session. This covers sessions that are missing, revoked, idle-expired or past their absolute expiry.
  - `403 forbidden`: signed in but not allowed by the policy.
  - `400 validation_failed`, with `details.fields: {field: code}`, using the codes from data-model.md.
  - `429 too_many_attempts`, with `details.retryAfterSeconds`.
- **Policy**: every route declares one: `public`, `authenticated`, `owner`, or `{module, action}` from 005 onward. A route without one fails the startup check.
- **Responses** are always built by the presenter (`present()`), which is where field filtering happens.
- **Timestamps** are ISO-8601 UTC strings. **Pagination** is keyset: `?cursor=<opaque>&limit=` (default 50, max 200), with the response shape `{items, nextCursor|null}`.

---

## Health

### `GET /api/health` — public
`200 {"status":"ok"}`

## Setup (first launch)

### `GET /api/setup/status` — public
`200 {"setupRequired": true|false}`

### `POST /api/setup` — public
Request:
```json
{ "setupCode": "string", "username": "string", "displayName": "string", "password": "string", "language": "en|fr|ar" }
```
- `201` returns `{ "user": Me }` and sets the session cookie. The Owner is created and signed in.
- `400 validation_failed`: `username_invalid`, `display_name_invalid`, `password_too_short`, `password_too_common`, `language_invalid`.
- `403 setup_code_invalid`. The failure counts toward the IP block.
- `410 setup_unavailable`: an Owner already exists.
- `429 too_many_attempts`.
- Audit: `setup.owner_created`, then `auth.sign_in`.

## Authentication

### `POST /api/auth/sign-in` — public
Request: `{ "username": "string", "password": "string" }`
- `200 { "user": Me }`, and sets the cookie.
- `401 invalid_credentials`. The message is the same for an unknown username, a wrong password, and an inactive account (`pending` or `suspended` from 005).
- `429 too_many_attempts { retryAfterSeconds }`.
- Every call writes one `sign_in_attempts` row and one audit entry: `auth.sign_in`, `auth.sign_in_failed` or `auth.sign_in_blocked`.

### `POST /api/auth/sign-out` — authenticated
`204`. Revokes the current session (`sign_out`) and clears the cookie. Audit: `auth.sign_out`.

## Current user

### `GET /api/me` — authenticated
```json
{
  "user": { "id": "uuid", "username": "hicham", "displayName": "Hicham", "role": "owner", "language": "ar" },
  "company": { "name": "HANJING MACHINERY" },
  "session": { "id": "uuid", "idleTimeoutMinutes": 720 }
}
```

### `PATCH /api/me` — authenticated
Request: `{ "displayName"?: "string", "language"?: "en|fr|ar" }`
`200 { "user": Me }`. Audit: `profile.updated`, with before and after values.

### `POST /api/me/password` — authenticated
Request: `{ "currentPassword": "string", "newPassword": "string" }`
- `204`. All **other** sessions are revoked (`password_change`). Audit: `password.changed`.
- `400 validation_failed`: `password_too_short`, `password_too_common`, `password_same_as_current`.
- `403 current_password_invalid`. This counts toward the account block.

## Sessions (devices)

### `GET /api/me/sessions` — authenticated
```json
{ "items": [ {
  "id": "uuid", "deviceLabel": "iPhone · Safari", "ip": "203.0.113.5", "location": "Shanghai, CN",
  "createdAt": "2026-10-07T08:00:00Z", "lastActiveAt": "2026-10-07T09:12:00Z", "current": true
} ] }
```
Lists only active sessions.

### `DELETE /api/me/sessions/:id` — authenticated
`204`. Revokes that session (`remote`). Audit: `session.revoked`.
`404 not_found` if the session doesn't exist, isn't active, or belongs to another user.

### `POST /api/me/sessions/revoke-all` — authenticated
`204`. Revokes **every** session, including the current one (`revoke_all`), and clears the cookie. Audit: `session.revoked_all`.

## Sign-in history

### `GET /api/me/sign-in-history?cursor=&limit=` — authenticated
```json
{ "items": [ {
  "occurredAt": "…", "outcome": "success|failure|blocked", "reason": "ok|invalid_credentials|account_blocked|ip_blocked|account_inactive",
  "deviceLabel": "…", "ip": "…", "location": "…|null"
} ], "nextCursor": "…|null" }
```
Covers attempts matched to the current user, newest first.

## Audit log

### `GET /api/audit?actorId=&action=&from=&to=&cursor=&limit=` — owner
- `action` accepts an exact code or a prefix ending in `.` (e.g. `auth.`).
- `from` and `to` are ISO dates; `to` is inclusive.
```json
{ "items": [ {
  "id": "uuid", "occurredAt": "…", "actor": { "id": "uuid|null", "label": "hicham" },
  "action": "settings.updated", "target": { "type": "settings", "id": "1" },
  "ip": "…", "deviceLabel": "…", "before": { "companyName": "" }, "after": { "companyName": "HANJING MACHINERY" }
} ], "nextCursor": "…|null" }
```

### `GET /api/audit/actions` — owner
`200 { "items": ["auth.sign_in", ...] }`. The action codes known to the server, used to fill the filter list.

### `GET /api/audit/actors` — owner
`200 { "items": [ { "id": "uuid", "label": "hicham" } ] }`. The people who appear in the log, used to fill the person filter. Added during implementation, because 001 has no users list yet.

No other methods exist on `/api/audit`: there is no create, update or delete route.

## Settings

### `GET /api/settings` — owner
```json
{
  "companyName": "HANJING MACHINERY",
  "baseCurrency": "CNY",
  "currencies": [ { "code": "CNY", "symbol": "¥", "minorUnits": 2 }, { "code": "USD", "symbol": "$", "minorUnits": 2 },
                  { "code": "MAD", "symbol": "DH", "minorUnits": 2 }, { "code": "EUR", "symbol": "€", "minorUnits": 2 } ],
  "sessionIdleTimeoutMinutes": 720
}
```

### `PATCH /api/settings` — owner
Request: `{ "companyName"?: "string", "sessionIdleTimeoutMinutes"?: 15..10080 }`
- `200` returns Settings. Audit: `settings.updated`, with only the changed fields in before and after.
- `400 validation_failed`: `company_name_invalid`, `timeout_out_of_range`.
- `baseCurrency` is not accepted: it is fixed to CNY.

---

## Server-side command (not HTTP)

### `npm run owner:reset-password -w apps/server [-- --password-stdin]`
- Prompts for the new password twice, or reads it from stdin, and applies the password policy.
- Sets the new hash, revokes all Owner sessions (`server_reset`), and writes the audit entry `password.server_reset` with actor `system:cli`.
- Exits non-zero if no Owner exists or the policy rejects the password.

---

## Client routes (UI contract)

| Path | Access | Screen |
|---|---|---|
| `/setup` | only while setup is required | First-launch setup (setup code, username, display name, password, language) |
| `/sign-in` | signed out | Username + password, language switcher |
| `/` | authenticated | Dashboard: welcome, company name, links |
| `/security` | authenticated | Change password, active sessions, log out all devices, sign-in history |
| `/settings` | owner | Company name, base currency (read-only), currencies, session timeout |
| `/audit` | owner | Audit log with filters |

Rules:
- Any authenticated route redirects to `/sign-in` on `401`.
- If setup is required, `/sign-in` and `/` redirect to `/setup`.
- `/setup` redirects to `/sign-in` once setup is done.
