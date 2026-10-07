# Implementation Plan: Platform Foundation

**Branch**: `001-platform-foundation` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-platform-foundation/spec.md`

## Summary

Build the secure, installable, three-language shell of the HANJING Order Manager. It includes:
- first-launch Owner setup protected by a one-time code;
- username + password sign-in (ROADMAP D9);
- server-side sessions with idle and absolute timeouts, a device list and remote sign-out;
- guessing blocks;
- an append-only audit log;
- a deny-by-default permission gate with a single field-filtering point;
- recoverable-deletion helpers;
- company settings with CNY fixed as the base currency.

Technical approach:
- A TypeScript monorepo: a Hono API and a React/Vite PWA, served from one origin by one Node process, on SQLite through Drizzle.
- Custom session auth on Argon2id and hashed random tokens.
- i18next with logical CSS for EN/FR/AR with RTL.

Feature 001 also fixes the stack for the whole app ([research.md](research.md)).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 24 LTS
**Primary Dependencies**:
- Server: Hono 4 + `@hono/node-server`, zod + `@hono/zod-validator`, Drizzle ORM + drizzle-kit, better-sqlite3, `@node-rs/argon2`, bowser, maxmind (reader for DB-IP Lite).
- Web: React 19, Vite, React Router 7 (data mode), TanStack Query, Tailwind CSS v4, shadcn/ui (Radix), i18next v26 + react-i18next, vite-plugin-pwa, `@fontsource-variable/noto-sans-arabic`.

**Storage**: SQLite (WAL mode), file under `DATA_DIR`
**Testing**: Vitest (server unit + API integration through `app.request()`, web unit with Testing Library), Playwright (e2e, mobile 360×800 + desktop)
**Target Platform**: Linux VPS (Docker in 009) for the server; current mobile Safari/Chrome and desktop browsers for the installable PWA
**Project Type**: web application (API + SPA/PWA, npm workspaces)
**Performance Goals**:
- previously visited screens appear in ≤ 2 s at about 1 Mbps with high latency (SC-007);
- sign-in completes in < 10 s end to end (SC-002);
- an Argon2 verify takes about 100–300 ms on a small VPS.

**Constraints**:
- no Google- or CDN-hosted assets (D5);
- no `/api` response caching in the service worker;
- Western digits in every language;
- the session cookie is HttpOnly, SameSite=Lax, and Secure in production.

**Scale/Scope**: 1–3 users, 6 screens, about 15 API routes, 7 tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / Constraint | How this plan complies | Status |
|---|---|---|
| I. Per-order financial accuracy | No money records yet. The currency reference data is seeded, CNY is fixed as the base (`CHECK`), and the money rules are documented in data-model.md for 003+. | Pass |
| II. Mobile-first PWA | vite-plugin-pwa with an installable manifest. Every screen is designed at 360px first. Playwright checks for no sideways scroll. | Pass |
| III. Multilingual and Unicode-complete | i18next EN/FR/AR, `dir` set from `i18next.dir()`, logical Tailwind utilities, `dir="auto"` on user text, a key-parity test, UTF-8 storage, `ar-MA-u-nu-latn` digits. (PDF fonts start in 006.) | Pass |
| IV. Never lose data | Append-only audit log (triggers), recoverable-deletion helpers, a single-file SQLite database ready for the 009 backups. | Pass (backups scheduled in 009 per ROADMAP) |
| V. Secure by default | Every `/api` route needs a declared policy (startup check), deny by default, Argon2id, hashed session tokens, CSRF middleware, secure headers, secrets only in env. HTTPS arrives in 009 with deployment. | Pass |
| VI. Simplicity and evolvability | SQLite, one process, one origin. Custom auth is smaller than adapting a framework to D9. Three workspaces are justified by the shared schemas. | Pass |
| VII. Current documentation first | Hono, Drizzle, Better Auth, vite-plugin-pwa, i18next, Tailwind and React Router checked in Context7 (research.md). | Pass |
| CNY base currency | `company_settings.base_currency CHECK = 'CNY'`. | Pass |
| Invoice = agreed price | Not touched in 001. | N/A |
| VPS + VPN, no Google | Self-hosted fonts, local geo DB, local common-password list, no external calls at runtime. | Pass |
| One server-side policy layer | `policy/` module: route registration, authorize middleware, `present()` field filter. | Pass |

**Deviation from the brief, approved by the user** (not a constitution violation): no two-step sign-in, recovery codes or email reset (ROADMAP D9). It is recorded in spec.md and ROADMAP.md.

**Post-design re-check (after Phase 1)**: data-model.md, contracts/api.md and quickstart.md introduce no new projects, services or external dependencies beyond those listed. All gates still pass.

## Project Structure

### Documentation (this feature)

```text
specs/001-platform-foundation/
├── plan.md              # This file
├── research.md          # Phase 0: stack and design decisions R1–R20
├── data-model.md        # Phase 1: tables, constraints, triggers, validation
├── quickstart.md        # Phase 1: run + validation scenarios Q1–Q20
├── contracts/
│   └── api.md           # Phase 1: HTTP API, CLI and client-route contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
package.json                     # npm workspaces, root scripts (dev, test, test:e2e, lint, typecheck)
apps/
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── drizzle.config.ts
│   ├── drizzle/                 # generated + custom SQL migrations (triggers, partial index, seeds)
│   ├── assets/
│   │   └── common-passwords.txt # top 100k (SecLists, MIT)
│   ├── src/
│   │   ├── index.ts             # boot: config → migrate → setup-code check → serve()
│   │   ├── app.ts               # createApp(deps): middleware, routes, static SPA (prod)
│   │   ├── config.ts            # zod-validated env
│   │   ├── clock.ts             # injectable clock (tests)
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   └── schema/          # users, sessions, signInAttempts, auditEntries, companySettings, currencies, appState
│   │   ├── auth/
│   │   │   ├── password.ts      # argon2 hash/verify, policy, common list
│   │   │   ├── sessions.ts      # create/validate/touch/revoke, cookie helpers
│   │   │   ├── signIn.ts        # sign-in flow with throttle + history
│   │   │   ├── throttle.ts      # block rule (R6)
│   │   │   └── setup.ts         # setup code generation/verification, owner creation
│   │   ├── policy/
│   │   │   ├── route.ts         # route() helper + registry; startup check
│   │   │   ├── authorize.ts     # policy middleware (owner/authenticated/{module,action})
│   │   │   └── present.ts       # field-filtering presenters
│   │   ├── audit/
│   │   │   ├── record.ts        # audit.record(tx, entry)
│   │   │   └── query.ts         # filters + keyset pagination
│   │   ├── softDelete/index.ts  # notDeleted(), softDelete(), restore()
│   │   ├── settings/service.ts
│   │   ├── lib/                 # clientIp.ts, device.ts (bowser), geo.ts (maxmind), ids.ts
│   │   ├── routes/              # health, setup, auth, me, sessions, signInHistory, audit, settings
│   │   └── cli/
│   │       ├── reset-owner-password.ts
│   │       └── download-geo.ts
│   └── tests/
│       ├── unit/                # password policy, throttle, session validity, presenters, softDelete
│       └── integration/         # API flows Q2–Q6, Q12–Q19 via app.request() on in-memory SQLite
├── web/
│   ├── package.json
│   ├── vite.config.ts           # react, tailwind, VitePWA, /api dev proxy
│   ├── index.html
│   ├── public/                  # pwa icons (192, 512, maskable), favicon
│   ├── src/
│   │   ├── main.tsx
│   │   ├── router.tsx           # routes + auth/setup redirects
│   │   ├── api/                 # hono/client instance, query hooks, error-code mapping
│   │   ├── i18n/                # init, dir handling, format.ts (Intl dates/numbers, latn digits)
│   │   ├── locales/{en,fr,ar}/common.json
│   │   ├── components/          # AppShell, LanguageSwitcher, ui/ (shadcn)
│   │   ├── routes/              # setup, sign-in, dashboard, security, settings, audit
│   │   └── styles/index.css     # tailwind, font-face (Noto Sans Arabic, unicode-range)
│   ├── tests/                   # component tests, i18n key parity
│   └── e2e/                     # Playwright: Q1, Q7–Q11, Q20
packages/
└── shared/
    ├── package.json
    └── src/
        ├── api/                 # zod request/response schemas per route
        ├── errors.ts            # error codes
        ├── enums.ts             # roles, statuses, languages, currencies, audit actions, policy modules/actions
        └── validation.ts        # username, password, display name rules
```

**Structure Decision**: a web application split into `apps/server` (API, CLI, migrations), `apps/web` (PWA) and `packages/shared` (schemas and enums used by both). In production the server serves the built `apps/web/dist`, so the app is a single process on a single origin.

## Key design notes

- **Request pipeline** (`/api/*`), in order:
  1. `secureHeaders()`;
  2. `csrf({ origin: APP_ORIGIN })` on non-GET requests;
  3. session middleware: validate the cookie, enforce the idle and absolute timeouts, touch `last_active_at` at most once per minute;
  4. `authorize(policy)`;
  5. zod validation;
  6. handler (in a DB transaction when it writes, with `audit.record` inside the same transaction);
  7. `present()`.
- **Sign-in flow**:
  1. normalize the username;
  2. apply the throttle check (R6), returning `429` if blocked;
  3. look up the user;
  4. run Argon2 verify (against a dummy hash if the user is unknown);
  5. check `status = active`;
  6. on success, create the session and set the cookie;
  7. write the attempt row and the audit entry in all cases.
- **Setup**: the boot sequence checks for an Owner. If none exists, it ensures a setup-code hash is present in `app_state` and logs the plain code. `POST /api/setup` runs in one transaction: verify the code, insert the Owner, mark setup complete, create the session, write the audit entries.
- **Timeouts**: the idle timeout is read from `company_settings`, cached in memory and invalidated when settings are updated. The absolute expiry is fixed at 30 days from sign-in.
- **Client auth state**: `GET /api/me` is the source of truth. Router loaders redirect on `401` or `setupRequired`. The language from `me.user.language` is applied after sign-in, and changing it calls `PATCH /api/me`.
- **Service worker**: precaches the shell only. `/api/*` is never cached. An offline navigation shows the cached shell with a translated "no connection" banner.

## Complexity Tracking

No constitution violations to justify.
