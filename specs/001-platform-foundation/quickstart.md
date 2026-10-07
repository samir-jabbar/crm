# Quickstart: Platform Foundation (001)

How to run feature 001 locally and check it against the spec.

## Prerequisites

- Node.js 24 LTS and npm 11 (both already installed on the dev machine)
- Git
- Optional: the DB-IP Lite City database, for approximate locations: `npm run geo:download -w apps/server`

## First run

```bash
npm install
cp apps/server/.env.example apps/server/.env      # defaults work for local dev
npm run db:migrate -w apps/server                  # creates data/app.db
npm run dev                                        # server :3000 + web :5173 (proxy /api → :3000)
```

The server log prints a line like:
```
[setup] No owner yet. Open http://localhost:5173/setup and enter setup code: K7QM-3XRP-9DTA
```
To use a fixed code instead, set `SETUP_CODE` in `.env`.

## Tests

```bash
npm test                      # Vitest: server unit + API integration, web unit, i18n key parity
npm run test:e2e              # Playwright: mobile 360×800 + desktop, EN/FR/AR
npm run typecheck && npm run lint
```

## Owner password reset (server-side)

```bash
npm run owner:reset-password -w apps/server
```

## Validation scenarios

Each scenario maps to a user story or success criterion in [spec.md](spec.md). The Playwright and integration test names reference these IDs.

| ID | Scenario | Expected |
|---|---|---|
| Q1 (US1, SC-001) | Fresh database → open `/`, enter the setup code and Owner details on a 360px viewport | Owner created and signed in on the dashboard, in under 2 minutes |
| Q2 (US1) | After setup, open `/setup` or call `POST /api/setup` | Redirected to `/sign-in`; the API returns `410 setup_unavailable` |
| Q3 (US1, SC-003) | Signed out, request every `/api` route except `health`, `setup/*` and `auth/sign-in` | All return `401`. The policy check lists every route |
| Q4 (US1) | Sign in with a wrong username, then with a wrong password | Identical `401 invalid_credentials` responses |
| Q5 (US1) | Set the idle timeout to 15 min, advance the test clock 16 min | The next request returns `401`, and the session is marked `timeout` |
| Q6 (US1) | Try to delete or demote the Owner directly in the database (integration test) | Aborted by the triggers with `owner_protected` |
| Q7 (US2, SC-005) | Switch EN → FR → AR | All text translated; `<html dir="rtl">` in AR; navigation mirrored; the key-parity test passes |
| Q8 (US2, SC-006) | Save the company name `汉景机械 HANJING — شركة` | Displays identically everywhere, in its correct direction |
| Q9 (US2, SC-008) | Every screen at 360px width, in all three languages | No horizontal scroll (Playwright asserts `scrollWidth <= clientWidth`) |
| Q10 (US2, SC-007) | Visit the screens, then reload with the network throttled to about 1 Mbps / 300 ms, and again offline | The shell appears within 2 s; offline shows the shell plus a "no connection" message, with no stale financial data |
| Q11 (US2) | Lighthouse or Chrome "Install app" | Installable; opens standalone with the app icon |
| Q12 (US3, SC-009) | Sign in from two browser contexts, revoke one, then "Log out all devices" | The revoked context gets `401`; after revoke-all, both get `401` |
| Q13 (US3) | Change the password from context A | Context B gets `401`; A stays signed in; audit `password.changed` |
| Q14 (US3, SC-010) | 5 wrong passwords, then the correct one | `429` with `retryAfterSeconds`; succeeds after the clock moves past 15 min |
| Q15 (US3) | Run `owner:reset-password` | Old sessions revoked; the new password works; audit `password.server_reset` by `system:cli` |
| Q16 (US4, SC-004) | Sign in, fail a sign-in, change the password, change settings | Four or more matching audit entries with actor, time, device and IP, plus before/after for settings |
| Q17 (US4) | Try `UPDATE` or `DELETE` on `audit_entries` (integration test); look for edit or delete in the UI | Aborted with `audit_append_only`; no controls in the UI |
| Q18 (US5) | Change the company name and idle timeout | The header shows the new name; the new timeout is enforced; audit `settings.updated` |
| Q19 (FR-024) | Unit test: soft-delete and restore on the fixture table | Hidden from default queries, restorable, audited |
| Q20 (FR-033) | Build and grep the output for external hosts; run the e2e tests with only localhost allowed | No requests to Google or any CDN |
