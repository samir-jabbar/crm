# Research: Platform Foundation (001)

**Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

Library facts were checked through Context7 against current docs: Hono, Drizzle ORM, Better Auth v1.6.23, vite-plugin-pwa, i18next v26, Tailwind CSS v4 and React Router v7. Feature 001 also fixes the stack for the whole app (ROADMAP D8). Later features reuse it.

---

## R1. Language and runtime

- **Decision**: TypeScript (strict) end to end, on Node.js 24 LTS. One language for server, client and shared validation schemas.
- **Rationale**:
  - The brief suggests TypeScript/React first.
  - Node 24 is already installed on the dev machine.
  - Sharing types and validation between client and server removes a whole class of mismatches, which matters for money in features 003–004.
  - The Playwright PDF rendering planned for 006 is native to Node.
- **Alternatives considered**:
  - Python FastAPI + React: two languages, duplicated schemas, and no shared types.

## R2. Overall architecture

- **Decision**: one server process that serves both the JSON API (`/api/*`) and the built single-page app, from a **single origin**. In development, Vite runs the client with a proxy to the API.
- **Rationale**:
  - A single origin means session cookies just work (SameSite, no CORS).
  - One process is the simplest thing to deploy on one VPS (D5).
  - A client-rendered SPA is what makes an installable PWA with offline shell caching straightforward, and it sets up offline mode later (019).
- **Alternatives considered**:
  - Next.js full-stack: server rendering isn't needed for a private, signed-in app, its PWA support is weaker, and it pulls toward Vercel-style hosting.
  - Separate API and web origins: needs CORS and cross-site cookies.

## R3. HTTP server framework

- **Decision**: **Hono 4** on `@hono/node-server`, with these pieces:
  - built-in `csrf()` (Origin and Sec-Fetch-Site checks);
  - `secureHeaders()`;
  - the cookie helpers;
  - `serveStatic` from `@hono/node-server/serve-static` for the SPA;
  - request validation with **zod** via `@hono/zod-validator`;
  - the typed client through `hono/client`.
- **Rationale**:
  - Small and built on Web Standards.
  - First-class testing: `app.request()` runs requests without opening a port.
  - The RPC client gives end-to-end types from route to React code.
  - Context7 confirms the CSRF and secure-headers middleware and cookie options (httpOnly, secure, sameSite).
- **Alternatives considered**:
  - Fastify: fine, but its typed client story is weaker.
  - Express: legacy middleware model and no built-in types.

## R4. Database

- **Decision**: **SQLite** in WAL mode via **better-sqlite3**, accessed with **Drizzle ORM**.
  - Migrations are made with `drizzle-kit generate` and applied with the better-sqlite3 migrator when the server starts.
  - SQL that Drizzle can't express (triggers, partial unique indexes) goes in custom migrations (`drizzle-kit generate --custom`).
  - Timestamps are stored as integer epoch milliseconds. IDs are random UUIDs stored as text.
- **Rationale**:
  - The constitution (VI) says SQLite first, and 1–3 users fit it comfortably.
  - Backup is a single file, which keeps 009 simple.
  - Drizzle keeps the schema in TypeScript and has a Postgres dialect if the path ever needs taking.
  - Context7 confirms the better-sqlite3 driver setup, migrate(), and custom migrations for unsupported DDL such as triggers.
- **Alternatives considered**:
  - PostgreSQL from day one: another service to run and back up, not needed at this scale. It would be a constitution deviation needing justification.
  - Prisma: heavier runtime, and its SQLite migration story is weaker for triggers.

## R5. Authentication approach

- **Decision**: **custom session authentication** on vetted primitives, following the well-known "server-side session token" pattern (Lucia/Copenhagen Book):
  - **Passwords**: **Argon2id** via `@node-rs/argon2` (memory 64 MiB, 3 iterations, parallelism 1). The brief requires Argon2 or bcrypt.
  - **Session tokens**: 32 random bytes from `node:crypto`, base64url-encoded, sent as an HttpOnly cookie.
    - Only the **SHA-256 hash** of the token is stored, so a leaked database cannot be replayed.
    - Cookie `hj_session`: `HttpOnly; SameSite=Lax; Path=/; Secure` in production, `Max-Age` = 30 days so the PWA stays signed in across restarts.
  - **Validation on every request**: the session is valid only if all three hold:
    - it has not been revoked;
    - now < `expires_at` (sign-in + 30 days, absolute);
    - now − `last_active_at` < the idle timeout from settings.
    `last_active_at` is written at most once a minute, to limit writes. An idle-expired session is marked revoked with reason `timeout`.
  - **CSRF**: SameSite=Lax cookie, plus Hono `csrf()` on all non-GET `/api` requests.
- **Rationale**: the user chose simple username + password (D9). That removes most of what an auth framework adds: 2FA, email flows, OAuth. The spec's custom rules would also fight a framework:
  - a one-time setup code;
  - a protected single Owner;
  - usernames with no email;
  - an idle timeout configured at runtime;
  - account + IP blocks with a history table;
  - pending accounts (005);
  - a full audit trail.
  Custom code here is about 300 lines of well-trodden logic, fully covered by tests.
- **Alternatives considered**:
  - **Better Auth v1.6** (checked in Context7). It offers Argon2 via custom hash, session listing and revocation, rate limiting, hooks, and a Hono + Drizzle integration. Rejected because:
    - its user model requires an email address;
    - the username plugin still expects one;
    - the idle timeout is static config;
    - pending approval and Owner protection would need hooks that work around its internals.
    It would have been the choice if 2FA and email reset had been kept.
  - Lucia v3: deprecated as a library and now published as a guide, which is the pattern adopted above.

## R6. Guessing protection (FR-011)

- **Decision**: a `sign_in_attempts` table is the single source for both the sign-in history and blocking.
  - Before checking a password, count failures in the last 15 minutes, both for the normalized username and for the client IP.
  - If either count is 5 or more, refuse with `429 too_many_attempts` and `retryAfterSeconds` = (oldest counted failure + 15 min − now). A blocked attempt is recorded with outcome `blocked`.
  - Blocks expire on their own: nothing is stored as "locked".
  - For unknown usernames, Argon2 verify still runs against a fixed dummy hash, so response time doesn't reveal which usernames exist.
- **Rationale**: this meets the spec exactly, survives restarts, and can never lock out permanently.
- **Alternatives considered**: an in-memory rate limiter, which loses state on restart and keeps no history.

## R7. Password policy (FR-008)

- **Decision**:
  - minimum 10 characters, maximum 128;
  - reject passwords found in a **bundled list of the 100,000 most common passwords** (SecLists, MIT licence), checked case-insensitively;
  - no forced rotation and no composition rules (current NIST guidance).
- **Rationale**: works offline with no external calls, so it's China-safe (D5) and sends no password-derived data to third parties.
- **Alternatives considered**: the Have I Been Pwned range API, an external dependency that would need network access from the server.

## R8. One-time setup code (FR-001)

- **Decision**:
  - At startup, if no Owner exists, the server takes `SETUP_CODE` from the environment, or generates a random 12-character code.
  - It stores only the code's Argon2 hash in `app_state`, and prints the plain code once to the server log, together with the setup URL.
  - `POST /api/setup` compares the code, creates the Owner and the first session in one transaction, then sets `setup_completed_at`. From then on every setup route answers `410 setup_unavailable`.
  - Wrong codes count as failed attempts under R6 (keyed by IP).
- **Rationale**: only whoever can read the server log or environment, meaning the installer, can claim the app.

## R9. Owner protection (FR-004)

- **Decision**: defense in depth.
  1. A partial unique index allows at most one row with `role='owner'`.
  2. SQLite triggers abort any `DELETE` of the Owner row and any `UPDATE` that changes its role or makes its status anything other than `active`.
  3. The service layer refuses those operations with a clear error, before the database is ever reached.
- **Rationale**: no route, current or future, can remove or demote the Owner by mistake.

## R10. Owner password reset (FR-012)

- **Decision**: a server-side CLI, `npm run owner:reset-password -w apps/server`. It:
  - asks for the new password twice on the console, or takes it from `--password-stdin`;
  - applies the same password policy;
  - updates the hash;
  - revokes all of the Owner's sessions (reason `server_reset`);
  - writes an audit entry with actor `system:cli`.
  It runs directly against the database file and has no HTTP route.
- **Rationale**: matches D9 (no email reset). Anyone who can run commands on the server already controls the data.

## R11. Audit log (FR-020 – FR-023)

- **Decision**: an `audit_entries` table, written through `audit.record(tx, …)` **inside the same transaction** as the change it describes.
  - SQLite triggers `BEFORE UPDATE` and `BEFORE DELETE` on the table `RAISE(ABORT)`, so entries are append-only for every route, including bugs.
  - Owner-only list API with filters (actor, action, date range) and keyset pagination.
  - Action names are dotted (`auth.sign_in`, `settings.updated`, …), and the client translates each action code into the user's language.
- **Rationale**: entries can never be missing for a committed change, and they can never be changed.
- **Alternatives considered**: a hash-chained log for tamper evidence. Not needed while only the app and the server admin can reach the database; it can be added later.

## R12. Permission gate (FR-017 – FR-019)

- **Decision**: one module, `policy/`, with three parts:
  1. **Route registration**: every API route is declared through a `route()` helper that requires a policy. The policy is one of `public` (setup and sign-in only), `authenticated`, `owner`, or `{ module, action }` (used from 005).
     - A startup check plus a test walks Hono's route list and fails if any `/api` route was registered without a policy, so new routes are denied unless declared.
  2. **Authorization middleware** works from the session user. In 001: `owner` passes for the Owner, and `{module, action}` passes for the Owner only. Feature 005 replaces that check with the permission matrix.
  3. **Presenter / field filter**: every JSON response body is built by `present(resource, record, ctx)`, which applies field rules per resource. In 001 the Owner sees every field. Feature 005 adds hidden fields and the derived-value rules (D6) in this one place.
- **Rationale**: there is a single choke point for authorization and field hiding, so screens, search, exports and PDFs added later cannot bypass it.

## R13. Recoverable deletion (FR-024)

- **Decision**: a convention plus helpers, ready for 002+.
  - Business tables get `deleted_at` and `deleted_by` columns.
  - `notDeleted(table)` is the default query filter.
  - `softDelete(tx, table, id, ctx)` and `restore(…)` services always write an audit entry.
  - In 001 these are covered by unit tests against a test-only fixture table.

## R14. Client stack

- **Decision**:
  - **React 19 + Vite**, with **React Router 7** in data mode (`createBrowserRouter`) for routing and auth redirects.
  - **TanStack Query** for server state.
  - **Tailwind CSS v4** with logical utilities only (`ms-/me-/ps-/pe-/start-/end-/rounded-s-*`, `rtl:` where needed), confirmed in Context7.
  - **shadcn/ui** (Radix primitives, copied into the repo) for accessible components. Radix's `DirectionProvider` mirrors menus and popovers in Arabic.
- **Rationale**: a mainstream, well-documented stack. Logical CSS makes RTL mostly automatic instead of a second set of styles.
- **Alternatives considered**:
  - TanStack Router: good, but React Router's data mode is enough here.
  - MUI: heavy bundle, which hurts slow links (SC-007).

## R15. Internationalization (FR-025 – FR-029)

- **Decision**: **i18next v26 + react-i18next**.
  - Resources are JSON per language: `en`, `fr`, `ar`.
  - On `languageChanged`, set `<html lang>` and `<html dir>` from `i18next.dir(lng)`, as confirmed in Context7.
  - The user's language is stored on the account and applied after sign-in. Before sign-in it comes from local storage, then the browser language, then English.
  - Dates use `Intl.DateTimeFormat`. Numbers use `Intl.NumberFormat` with `numberingSystem: 'latn'`, and the Arabic locale is `ar-MA-u-nu-latn`, which gives Western digits (FR-029).
  - The server returns **error codes, not sentences**; the client translates them.
  - A unit test asserts that all three languages have the same keys (SC-005).
  - User-entered text is shown with `dir="auto"`, so mixed-direction content renders correctly (FR-028).
- **Alternatives considered**: Lingui and Paraglide. Both are fine; i18next has the largest ecosystem and built-in direction detection.

## R16. PWA and slow connections (FR-030 – FR-033, SC-007)

- **Decision**: **vite-plugin-pwa** (`generateSW`, `registerType: 'autoUpdate'`).
  - The app shell (JS, CSS, HTML, icons, fonts) is precached.
  - `navigateFallbackDenylist: [/^\/api\//]`.
  - **No runtime caching of `/api` responses**: financial data never sits in the browser cache.
  - Manifest with name, icons (192/512 plus maskable) and `display: standalone`.
  - Forms keep their input when a request fails (FR-032), using TanStack Query mutations that don't reset on error.
- **Fonts (D5)**:
  - Latin and Chinese use the system font stack; every target phone has CJK system fonts, which avoids several MB of downloads.
  - Arabic uses a **self-hosted Noto Sans Arabic** variable WOFF2 (via `@fontsource-variable`), loaded with `unicode-range` so only Arabic text downloads it.
  - Nothing is loaded from Google or any CDN.

## R17. Device, network origin and approximate location (FR-014, FR-016)

- **Decision**:
  - **Device and browser**: parsed from User-Agent with **bowser** (MIT).
  - **Client IP**: `getConnInfo` from `@hono/node-server/conninfo`. `X-Forwarded-For` is used only when `TRUST_PROXY=true`, behind the reverse proxy added in 009.
  - **Location**: the optional **DB-IP Lite City** database (CC BY 4.0, a free monthly `.mmdb`) read with the `maxmind` npm reader. A script downloads it. If it's missing, the location shows "Unknown". The attribution goes on the About/Security page.
  - Everything is looked up locally, with no external calls.
- **Alternatives considered**:
  - MaxMind GeoLite2: needs an account and licence key.
  - Online IP-lookup APIs: an external dependency, and they would leak IPs.
  - ua-parser-js v2: AGPL licence.

## R18. Testing

- **Decision**:
  - **Vitest** for server unit tests and API integration tests. The integration tests run `app.request()` against a fresh in-memory SQLite database with migrations applied, and an injectable clock for timeout and block tests.
  - **Vitest + Testing Library** for client components.
  - **Playwright** for end-to-end tests on a 360×800 mobile viewport and on desktop. They cover setup, sign-in, the Arabic RTL layout, no sideways scrolling (SC-008), and the offline shell. Playwright is reused for PDFs in 006.
- **Rationale**: one test runner for everything, fast, with no ports needed for API tests.

## R19. Repository layout and tooling

- **Decision**:
  - **npm workspaces** (npm 11 is already installed): `apps/server`, `apps/web`, `packages/shared`.
  - `packages/shared` holds the zod schemas for API payloads, error codes, enums (roles, languages, currencies, policy modules) and constants.
  - ESLint + Prettier. The TypeScript project references are kept simple.
- **Alternatives considered**: pnpm or Turborepo, an extra tool with no real gain at this size.

## R20. Configuration

- **Decision**: environment variables, validated with zod at startup. The server fails fast if any is invalid.
  - `PORT` (default 3000)
  - `DATA_DIR` (database, geo database, later uploads; default `./data`)
  - `APP_ORIGIN` (the expected Origin for CSRF in production)
  - `NODE_ENV`
  - `TRUST_PROXY`
  - `SETUP_CODE` (optional)
  - `GEO_DB_PATH` (optional)
  - `.env.example` documents them all. No secrets are committed.
