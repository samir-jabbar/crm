---
description: "Task list for 001 Platform Foundation"
---

# Tasks: Platform Foundation

**Input**: Design documents from `specs/001-platform-foundation/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: Included.
- The constitution requires business rules and acceptance criteria to be automated.
- The plan defines unit, integration and e2e suites.
- Test files reference the quickstart scenario IDs (Q1–Q20).

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) so each story can be built and verified as an increment.

**Library docs**: per CLAUDE.md, before writing code against any library (Hono, Drizzle, React Router, vite-plugin-pwa, i18next, Tailwind, shadcn/ui, Playwright, …), look up its current docs with Context7 (`resolve-library-id` → `query-docs`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: The user story the task belongs to (US1–US5)
- Package names: `@hanjing/shared` (`packages/shared`), `@hanjing/server` (`apps/server`), `@hanjing/web` (`apps/web`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the monorepo and tooling, so every workspace builds, lints and runs an empty test.

- [X] T001 Create the root `package.json`:
  - npm workspaces `apps/*` and `packages/*`;
  - scripts `dev` (server + web concurrently), `build`, `test`, `test:e2e`, `lint`, `typecheck`;
  - `"engines": {"node": ">=24"}`.
  Also create `.gitignore` (node_modules, dist, `data/`, `.env`, `*.db*`, playwright-report, test-results), `.nvmrc` (`24`) and `.editorconfig`.
- [X] T002 Create `tsconfig.base.json` at the repo root: strict, `module`/`moduleResolution` `NodeNext`/`Bundler` per package, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` off.
- [X] T003 [P] Scaffold `packages/shared`:
  - `package.json` (name `@hanjing/shared`, dependency `zod`, `exports` → `src/index.ts`);
  - `tsconfig.json`;
  - an empty barrel `packages/shared/src/index.ts`.
- [X] T004 [P] Scaffold `apps/server`:
  - `package.json` (name `@hanjing/server`):
    - deps: `hono`, `@hono/node-server`, `@hono/zod-validator`, `zod`, `drizzle-orm`, `better-sqlite3`, `@node-rs/argon2`, `bowser`, `maxmind`, `@hanjing/shared`;
    - devDeps: `drizzle-kit`, `vitest`, `tsx`, `@types/better-sqlite3`, `@types/node`;
    - scripts: `dev` (`tsx watch src/index.ts`), `build`, `start`, `test`, `db:generate`, `db:migrate`, `owner:reset-password`, `geo:download`;
  - `tsconfig.json`;
  - `vitest.config.ts`.
- [X] T005 [P] Scaffold `apps/web` with Vite + React 19 + TypeScript:
  - `package.json` (name `@hanjing/web`):
    - deps: `react`, `react-dom`, `react-router` (v8), `@tanstack/react-query`, `i18next`, `react-i18next`, `@radix-ui/react-dialog`, `@radix-ui/react-direction`, `clsx`, `tailwind-merge`, `@fontsource-variable/noto-sans-arabic`, `@hanjing/shared`;
    - devDeps: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `vite-plugin-pwa`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@playwright/test`;
  - `tsconfig.json`, `index.html` (lang/dir set at runtime, theme-color meta);
  - `apps/web/vite.config.ts` with the react and tailwind plugins and a dev proxy `/api` → `http://localhost:3000`.
- [X] T006 [P] Configure ESLint (flat config, typescript-eslint, react-hooks) in `eslint.config.js` and Prettier in `.prettierrc` at the repo root.
- [X] T007 [P] Configure Playwright in `apps/web/playwright.config.ts`:
  - projects `mobile` (viewport 360×800, touch) and `desktop`;
  - `webServer` starts the server with a temp `DATA_DIR` and `SETUP_CODE=E2E-SETUP-CODE`, plus the web dev server.
- [X] T008 [P] Create shadcn-style UI components in `apps/web` (hand-written on Radix rather than the shadcn CLI, so every class is logical/RTL-safe from the start):
  - `apps/web/components.json`;
  - `apps/web/src/lib/utils.ts` (`cn`);
  - add `button`, `input`, `label`, `card`, `select`, `dialog`, `alert`, `badge` under `apps/web/src/components/ui/`;
  - convert any physical direction classes (`ml-/mr-/pl-/pr-/left-/right-/text-left`) to logical ones (`ms-/me-/ps-/pe-/start-/end-/text-start`);
  - give every interactive control a minimum 44px touch height.

**Checkpoint**: `npm install && npm run lint && npm run typecheck && npm test` succeed on empty workspaces.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: database, schema, request pipeline, permission gate, audit writer, session validation, test harness, and the web app skeleton. Every user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Shared package

- [X] T009 [P] Define enums and constants in `packages/shared/src/enums.ts`:
  - roles (`owner`, `worker`), user statuses, languages (`en`, `fr`, `ar`), currency codes (`CNY`, `USD`, `MAD`, `EUR`) with `BASE_CURRENCY = 'CNY'`;
  - session revoke reasons, sign-in outcomes and reasons;
  - every audit action code from data-model.md, and policy kinds (`public`, `authenticated`, `owner`, module/action).
  Re-export from `packages/shared/src/index.ts`.
- [X] T010 [P] Define every API error code from contracts/api.md and data-model.md as a const union in `packages/shared/src/errors.ts`.
- [X] T011 [P] Implement the zod field schemas in `packages/shared/src/validation.ts`: `username` (trim, 3–32, `^[A-Za-z0-9._-]+$`), `displayName` (trim, 1–80), `password` (10–128), `language`, `companyName` (trim, 0–120), `sessionIdleTimeoutMinutes` (int 15–10080). Each issue message must be the error code from data-model.md.
- [X] T012 [P] Create the request/response zod schemas for every route in contracts/api.md under `packages/shared/src/api/`: `setup.ts`, `auth.ts`, `me.ts`, `sessions.ts`, `signInHistory.ts`, `audit.ts`, `settings.ts`. Export them from the barrel.

### Server core

- [X] T013 Implement `apps/server/src/config.ts`: a zod-validated env with `PORT` (3000), `DATA_DIR` (`./data`), `APP_ORIGIN`, `NODE_ENV`, `TRUST_PROXY` (false), optional `SETUP_CODE` and `GEO_DB_PATH`, failing fast on invalid values. Add `apps/server/.env.example` documenting each one.
- [X] T014 [P] Implement the injectable clock in `apps/server/src/clock.ts` (`Clock` interface with `now(): number`, `systemClock`, `createTestClock(start)` with `advance(ms)`) and UUID ids in `apps/server/src/lib/ids.ts`.
- [X] T015 Define the Drizzle schemas exactly as in data-model.md: `users.ts`, `sessions.ts`, `signInAttempts.ts`, `auditEntries.ts`, `companySettings.ts`, `currencies.ts`, `appState.ts`, with a barrel `index.ts`, all under `apps/server/src/db/schema/`. Include the CHECK constraints and indexes. Add `apps/server/drizzle.config.ts` (dialect `sqlite`).
- [X] T016 Implement `apps/server/src/db/client.ts`:
  - `openDb(path | ':memory:')` sets PRAGMAs `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`;
  - returns the drizzle instance and a `runMigrations(db)` using the better-sqlite3 migrator against `apps/server/drizzle/`.
- [X] T017 Generate the initial migration with `npm run db:generate -w apps/server` into `apps/server/drizzle/`.
- [X] T018 Add a custom migration (`drizzle-kit generate --custom`) in `apps/server/drizzle/`. It must create:
  - partial unique index `users_one_owner`;
  - triggers `users_owner_no_delete` and `users_owner_no_demote` (`RAISE(ABORT,'owner_protected')`);
  - triggers `audit_no_update` and `audit_no_delete` (`RAISE(ABORT,'audit_append_only')`);
  - seed rows for the 4 currencies and `company_settings` id=1 (`base_currency 'CNY'`, idle timeout 720).
- [X] T019 [P] Implement the request-context helpers, all with no network calls:
  - `apps/server/src/lib/clientIp.ts`: `getConnInfo`, using `X-Forwarded-For` only when `TRUST_PROXY`;
  - `apps/server/src/lib/device.ts`: bowser → `device_label` like "iPhone · Safari";
  - `apps/server/src/lib/geo.ts`: a lazy maxmind reader for `GEO_DB_PATH` or `DATA_DIR/geo/dbip-city-lite.mmdb`, returning "City, CC" or `null` if no file.
- [X] T020 Implement `apps/server/src/audit/record.ts`: `recordAudit(tx, {actorUserId, actorLabel, action, targetType, targetId, requestCtx, before, after})`. It inserts into `audit_entries`, strips the keys `passwordHash`, `password`, `token` and `tokenHash` from before/after, and stores only the changed fields.
- [X] T021 Implement `apps/server/src/settings/service.ts`: `getSettings(db)` with an in-memory cache, `updateSettings(tx, patch, actor, ctx)` that writes the audit entry `settings.updated` (changed fields only) and invalidates the cache, and `getIdleTimeoutMs()`.
- [X] T022 Implement `apps/server/src/auth/sessions.ts`:
  - `generateToken()` (32 random bytes, base64url) and `hashToken()` (SHA-256 hex);
  - `createSession(tx, user, requestCtx)` with `expires_at = now + 30d`;
  - `validateSessionToken(db, token, clock)`: revoked → invalid; absolute expiry → invalid; idle > `getIdleTimeoutMs()` → mark `timeout` + audit `session.timed_out` → invalid; otherwise touch `last_active_at` if older than 60 s;
  - `revokeSession(tx, id, reason)` and `revokeAllForUser(tx, userId, reason, {exceptSessionId?})`;
  - cookie helpers `setSessionCookie` and `clearSessionCookie` (`hj_session`, HttpOnly, SameSite=Lax, Path=/, Secure in production, Max-Age 30 days).
- [X] T023 Implement the permission gate in `apps/server/src/policy/route.ts` and `apps/server/src/policy/authorize.ts`:
  - `route(app, method, path, policy, ...handlers)` registers the route and records `{method, path, policy}` in a registry;
  - `authorize(policy)` middleware: `public` passes; `authenticated` needs a session user (`401 unauthenticated`); `owner` needs `role === 'owner'` (`403 forbidden`); `{module, action}` passes only for the Owner in 001;
  - `assertAllApiRoutesHavePolicy(app)` compares Hono's `app.routes` for `/api/*` against the registry and throws if any is missing.
- [X] T024 [P] Implement the presenters in `apps/server/src/policy/present.ts`: `present(resource, record, ctx)` with a per-resource field-rule registry (Owner sees all fields in 001), plus presenters for `me`, `session`, `signInAttempt`, `auditEntry` and `settings` that produce the shapes in contracts/api.md (ISO timestamps, no hashes).
- [X] T025 Implement `apps/server/src/app.ts`: `createApp({db, config, clock})` and `export type AppType`. It wires:
  - `secureHeaders()`;
  - `csrf({origin: config.APP_ORIGIN})` for non-GET `/api/*`;
  - a session middleware that reads `hj_session`, calls `validateSessionToken`, and sets `c.var.user`/`c.var.session`/`c.var.requestCtx`;
  - an `onError` that maps known errors (including SQLite `owner_protected`/`audit_append_only` and zod failures) to `{error:{code,details}}`;
  - `GET /api/health` (public);
  - `assertAllApiRoutesHavePolicy` at the end;
  - in production, `serveStatic` of `apps/web/dist` with an SPA fallback to `index.html` for non-`/api` paths.
- [X] T026 Implement `apps/server/src/index.ts`: load config, open the DB at `DATA_DIR/app.db`, run migrations, `createApp`, and `serve()` on `PORT`.
- [X] T027 Create the test harness in `apps/server/tests/helpers.ts`: `createTestContext()` returns an app on an in-memory DB with migrations applied, a test clock, a cookie-jar `request()` wrapper around `app.request()` that sends a same-origin `Origin` header, and `seedOwner()` / `signInAs()` helpers.

### Web core

- [X] T028 [P] Implement i18n in `apps/web/src/i18n/index.ts`:
  - i18next + react-i18next with bundled resources from `apps/web/src/locales/{en,fr,ar}/common.json`, `fallbackLng 'en'`;
  - initial language from localStorage → browser → `en`;
  - on `languageChanged`, set `document.documentElement.lang` and `.dir = i18next.dir(lng)` and persist to localStorage (wrapped in try/catch).
  Create the three locale files with the base keys: app name, nav, common buttons, and every error code from `@hanjing/shared` errors under `errors.*`.
- [X] T029 [P] Implement `apps/web/src/i18n/format.ts`: `formatDateTime(date, lng)` and `formatNumber(n, lng)` using `Intl` with locales `en-GB`, `fr-FR`, and `ar-MA-u-nu-latn`, always with `numberingSystem: 'latn'` (FR-029).
- [X] T030 [P] Implement `apps/web/src/api/http.ts` (same-origin `fetch` wrapper typed with the `@hanjing/shared` request/response types — chosen over `hono/client` so the web typecheck does not pull in server sources) and `apps/web/src/api/errors.ts`:
  - `ApiError` with a `code`;
  - a helper that parses `{error:{code,details}}`;
  - `useErrorMessage()` that maps codes to `t('errors.<code>')`.
  Also create `apps/web/src/api/queryClient.ts`, with no retries on 4xx.
- [X] T031 [P] Write `apps/web/src/styles/index.css`:
  - `@import "tailwindcss"` and theme tokens;
  - a system font stack for Latin and CJK;
  - Noto Sans Arabic from `@fontsource-variable/noto-sans-arabic`, restricted with `unicode-range` to Arabic blocks;
  - `body` background and base text; no external URLs.
- [X] T032 Implement `apps/web/src/main.tsx` and `apps/web/src/router.tsx`:
  - `QueryClientProvider`, the i18n provider, and Radix `DirectionProvider` bound to the current `i18next.dir()`;
  - `createBrowserRouter` with a root layout, an error boundary, and placeholder routes for `/setup`, `/sign-in`, `/`, `/security`, `/settings`, `/audit`;
  - a root loader that calls `GET /api/setup/status` and `GET /api/me`, redirecting to `/setup` when setup is required and to `/sign-in` on `401`.

**Checkpoint**: `npm test` passes the health-route integration test and the policy startup check. The web app boots to a placeholder screen in EN/FR/AR.

---

## Phase 3: User Story 1 — First launch: create the Owner account and sign in (Priority: P1) 🎯 MVP

**Goal**: a protected first-launch setup that creates the single Owner; username + password sign-in and sign-out; idle and absolute session timeouts; nothing reachable while signed out; the Owner cannot be deleted or demoted.

**Independent Test**: on a fresh DB, complete setup with the setup code, sign out, sign back in, and confirm every `/api` route except public ones returns 401 when signed out (quickstart Q1–Q6).

### Tests for User Story 1

- [X] T033 [P] [US1] Unit tests for the password policy (length bounds, common-list rejection case-insensitively, hash/verify round-trip, dummy hash verify returns false) in `apps/server/tests/unit/password.test.ts`.
- [X] T034 [P] [US1] Integration tests for setup (Q2) in `apps/server/tests/integration/setup.test.ts`:
  - `GET /api/setup/status` is `true` on a fresh DB;
  - `POST` with a wrong code → `403 setup_code_invalid`;
  - validation errors → `400` with field codes;
  - success → `201`, a session cookie, Owner role, and audit entries `setup.owner_created` + `auth.sign_in`;
  - a second `POST` → `410 setup_unavailable`, and status is `false`.
- [X] T035 [P] [US1] Integration tests for sign-in/sign-out and sessions (Q4, Q5) in `apps/server/tests/integration/auth.test.ts`:
  - a wrong username and a wrong password give identical `401 invalid_credentials` bodies;
  - success sets the cookie and writes `sign_in_attempts` + an audit entry;
  - sign-out → `204`, after which `/api/me` → `401`;
  - advancing the test clock past the 720-minute idle timeout → `401` and session `revoked_reason = 'timeout'`;
  - advancing past 30 days with activity every hour → `401`.
- [X] T036 [P] [US1] Integration test for deny-by-default (Q3) in `apps/server/tests/integration/policy.test.ts`. While signed out, every registered `/api` route with a policy other than `public` returns `401`. Registering a route without `route()` makes `createApp` throw.
- [X] T037 [P] [US1] Integration test for Owner protection (Q6) in `apps/server/tests/integration/ownerProtection.test.ts`: a direct `DELETE` of the Owner row, an `UPDATE` setting role to `worker`, and an `UPDATE` setting status to `suspended` all abort with `owner_protected`; inserting a second owner fails on the unique index.
- [X] T038 [P] [US1] Playwright e2e test (Q1) in `apps/web/e2e/setup-and-sign-in.spec.ts`. On the mobile project:
  1. open `/` → redirected to `/setup`;
  2. enter `E2E-SETUP-CODE` and the Owner details → land on the dashboard;
  3. sign out → `/sign-in`;
  4. sign in → dashboard;
  5. visiting `/setup` redirects to `/sign-in`.

### Implementation for User Story 1

- [X] T039 [P] [US1] Add `apps/server/assets/common-passwords.txt` (SecLists top 100k, MIT, with the attribution in `apps/server/assets/README.md`). Implement `apps/server/src/auth/password.ts`:
  - Argon2id (`memoryCost 65536`, `timeCost 3`, `parallelism 1`);
  - `hashPassword`, `verifyPassword`;
  - a precomputed `DUMMY_HASH`;
  - a lazy-loaded lowercase `Set` of common passwords;
  - `checkPasswordPolicy(pw)` returning `password_too_short | password_too_long | password_too_common | null`.
- [X] T040 [US1] Implement `apps/server/src/auth/setup.ts`:
  - `isSetupRequired(db)` (no Owner row);
  - `ensureSetupCode(db, config, log)`: if setup is required, use `SETUP_CODE` or generate a 12-char code `XXXX-XXXX-XXXX` from an unambiguous alphabet, store its Argon2 hash in `app_state.setup_code_hash`, and log `[setup] No owner yet. Open <origin>/setup and enter setup code: <code>`;
  - `completeSetup(db, input, requestCtx)`: in one transaction, verify the code, check the policy, insert the Owner (`username_normalized`), set `setup_completed_at`, delete `setup_code_hash`, create the session, and record the audit entries.
- [X] T041 [US1] Call `ensureSetupCode` during boot, before `serve()`, in `apps/server/src/index.ts`.
- [X] T042 [US1] Implement `apps/server/src/auth/signIn.ts`:
  - `signIn(db, {username, password}, requestCtx)`: normalize; find the user; always run `verifyPassword` (against `DUMMY_HASH` when the user is unknown); require `status === 'active'`;
  - on success, create the session; in every case, insert a `sign_in_attempts` row (outcome/reason, device label, IP, location) and an audit entry (`auth.sign_in` / `auth.sign_in_failed`);
  - return the session token or throw `invalid_credentials`;
  - leave a clearly marked hook point for the throttle check (T063).
- [X] T043 [US1] Implement the setup routes in `apps/server/src/routes/setup.ts`: `GET /api/setup/status` (public) and `POST /api/setup` (public, zod-validated, `410` when no longer required, sets the cookie, returns the `me` presenter). Register them in `app.ts`.
- [X] T044 [US1] Implement the auth routes in `apps/server/src/routes/auth.ts`: `POST /api/auth/sign-in` (public) and `POST /api/auth/sign-out` (authenticated: revokes `sign_out`, clears the cookie, records the audit entry). Register them in `app.ts`.
- [X] T045 [US1] Implement `GET /api/me` (authenticated) in `apps/server/src/routes/me.ts`. It returns the user, `company.name` and `session.idleTimeoutMinutes` via `present('me', …)`. Register it in `app.ts`.
- [X] T046 [P] [US1] Build the setup screen in `apps/web/src/routes/setup.tsx`:
  - fields: setup code, username, display name, password with show/hide, and a language picker that switches the UI live;
  - client-side validation with the shared zod schemas;
  - server error codes shown inline through `useErrorMessage`;
  - input kept on failure;
  - on success, invalidate `me` and navigate to `/`.
- [X] T047 [P] [US1] Build the sign-in screen in `apps/web/src/routes/sign-in.tsx`: username and password (`autocomplete` `username`/`current-password`), a large submit button, a generic error for `invalid_credentials`, a "try again in N minutes" message for `too_many_attempts`, and a language switcher placeholder slot.
- [X] T048 [US1] Build `apps/web/src/components/AppShell.tsx`:
  - a mobile-first header with the company name (or the app name when empty) and a menu linking Dashboard, Security, and for Owners Settings and Audit log;
  - a sign-out action calling `POST /api/auth/sign-out` and then going to `/sign-in`.
  Use it as the authenticated layout in `apps/web/src/router.tsx`.
- [X] T049 [US1] Build the dashboard in `apps/web/src/routes/dashboard.tsx`: a welcome with the display name, the company name, and large link cards to Security, and for Owners Settings and Audit log (FR-034).
- [X] T050 [US1] Add every US1 string (setup, sign-in, shell, dashboard, related errors) to `apps/web/src/locales/en/common.json`, `apps/web/src/locales/fr/common.json` and `apps/web/src/locales/ar/common.json`, with real French and Arabic translations, not placeholders.

**Checkpoint**: Q1–Q6 pass. The MVP is usable: the Owner can set up, sign in and sign out, protected by deny-by-default.

---

## Phase 4: User Story 2 — Use the app in English, French or Arabic from a phone (Priority: P2)

**Goal**: full EN/FR/AR UI with RTL Arabic; a language saved per user that follows them across devices; correct Unicode and mixed-direction text; an installable PWA that loads fast on slow links; no sideways scrolling at 360px.

**Independent Test**: on the mobile viewport, install the PWA, switch EN → FR → AR (layout mirrored in AR), and confirm translations, Unicode round-trip and no sideways scroll (quickstart Q7–Q11).

**Depends on**: US1 (needs a signed-in Owner).

### Tests for User Story 2

- [X] T051 [P] [US2] Unit test for i18n key parity (SC-005) in `apps/web/tests/i18n-parity.test.ts`: the `en`, `fr` and `ar` `common.json` files have identical key sets, no empty values, and an `errors.<code>` key for every code in `@hanjing/shared` errors.
- [X] T052 [P] [US2] Unit test for formatting in `apps/web/tests/format.test.ts`: `formatNumber(1234567.5, 'ar')` and `formatDateTime(…, 'ar')` contain only Western digits; the FR and EN outputs use their locale conventions.
- [X] T053 [P] [US2] Integration test for `PATCH /api/me` in `apps/server/tests/integration/me.test.ts`:
  - changing `language` to `ar` persists and is returned by `GET /api/me` from a second session;
  - a display name `汉景 هانجينغ Élodie` round-trips unchanged;
  - invalid language → `400 language_invalid`;
  - audit `profile.updated` with before/after.
- [X] T054 [P] [US2] Playwright e2e test (Q7–Q9) in `apps/web/e2e/i18n-rtl.spec.ts`. For each screen (sign-in, dashboard, security, settings, audit) in each language:
  - assert `document.documentElement.dir` (`rtl` for `ar`);
  - assert no sideways scroll (`scrollWidth <= clientWidth`) on the 360px project;
  - assert the language persists after sign-out and sign-in in a new browser context;
  - assert a mixed-script display name renders unchanged.
- [X] T055 [P] [US2] Playwright e2e test (Q10, Q11) in `apps/web/e2e/pwa-offline.spec.ts`. Against a production build (`vite preview` + server):
  - the manifest has name, icons and `display: standalone`, and the service worker activates;
  - after one visit, reloading with `context.setOffline(true)` shows the shell and the translated no-connection banner;
  - no `/api` response is served from the service-worker cache.

### Implementation for User Story 2

- [X] T056 [US2] Implement `PATCH /api/me` (authenticated: `displayName?`, `language?`, zod-validated, audited `profile.updated` with changed fields) in `apps/server/src/routes/me.ts`.
- [X] T057 [P] [US2] Build `apps/web/src/components/LanguageSwitcher.tsx`:
  - three large options (English, Français, العربية), each label in its own language;
  - calls `i18next.changeLanguage`;
  - when signed in, also calls `PATCH /api/me` and updates the `me` query cache.
  Place it on the sign-in and setup screens and in the AppShell menu.
- [X] T058 [US2] After the `me` query loads in `apps/web/src/router.tsx`, call `i18next.changeLanguage(me.user.language)` if it differs, so the user's language follows them across devices (FR-026).
- [X] T059 [US2] Configure `VitePWA` in `apps/web/vite.config.ts`:
  - `registerType: 'autoUpdate'`, `generateSW`;
  - `workbox.globPatterns` covering js/css/html/svg/png/woff2;
  - `navigateFallbackDenylist: [/^\/api\//]` and no `runtimeCaching` for `/api`;
  - a manifest with `name` "HANJING Order Manager", `short_name` "HANJING", `display: 'standalone'`, `theme_color`/`background_color`, and icons 192, 512 and 512 maskable.
  Add the icons to `apps/web/public/`.
- [X] T060 [P] [US2] Build `apps/web/src/components/ConnectionBanner.tsx` and mount it once at the app root (`main.tsx`), so it covers AppShell, the public layouts and full-page load errors:
  - it listens to `online`/`offline` and to query/mutation network errors;
  - it shows a translated non-blocking banner.
  Make sure every form's mutation keeps its field values on error (no reset on failure).
- [X] T061 [US2] RTL and mixed-script pass over all components in `apps/web/src/components/` and `apps/web/src/routes/`:
  - only logical spacing and alignment utilities;
  - flip direction icons with `rtl:-scale-x-100`;
  - `dir="auto"` on elements that render user-entered text (display name, company name, usernames, device labels);
  - check the 44px tap targets.
- [X] T062 [US2] Add every US2 string (language switcher, connection banner, PWA texts) to the three files in `apps/web/src/locales/*/common.json`.

**Checkpoint**: Q7–Q11 pass. The app is installable and usable in all three languages on a phone.

---

## Phase 5: User Story 3 — Keep the account safe: password, devices and sign-in history (Priority: P3)

**Goal**: change password (ends other sessions), list and revoke sessions, log out all devices, sign-in history, guessing blocks per account and IP, and the server-side Owner password reset.

**Independent Test**: sign in from two contexts, revoke one, change the password, make 5 wrong attempts and see the temporary block, and run the CLI reset (quickstart Q12–Q15).

**Depends on**: US1.

### Tests for User Story 3

- [X] T063 [P] [US3] Unit tests for the throttle rule in `apps/server/tests/unit/throttle.test.ts`:
  - 4 failures → allowed;
  - 5 failures in 15 min (by username) → blocked with the correct `retryAfterSeconds`;
  - 5 failures by IP across different usernames → blocked;
  - failures older than 15 min are ignored;
  - the block expires when the test clock advances.
- [X] T064 [P] [US3] Integration tests for sessions (Q12) in `apps/server/tests/integration/sessions.test.ts`:
  - `GET /api/me/sessions` lists 2 sessions with `current` set correctly;
  - `DELETE /api/me/sessions/:id` → the other context gets `401`;
  - deleting another user's or an unknown session → `404`;
  - `POST /api/me/sessions/revoke-all` → both contexts get `401`;
  - audit entries `session.revoked` and `session.revoked_all`.
- [X] T065 [P] [US3] Integration tests for password change and blocking (Q13, Q14) in `apps/server/tests/integration/password-and-throttle.test.ts`:
  - wrong current password → `403 current_password_invalid`;
  - too-common new password → `400`;
  - success → `204`, the other session gets `401`, the current one stays valid, audit `password.changed`;
  - 5 wrong sign-ins → the 6th with the correct password → `429 too_many_attempts` with `retryAfterSeconds`, a history row with outcome `blocked`, and audit `auth.sign_in_blocked`;
  - after advancing the clock 15 min → sign-in succeeds.
- [X] T066 [P] [US3] Integration test for the CLI reset (Q15) in `apps/server/tests/integration/resetOwnerPassword.test.ts`: call the CLI's exported `resetOwnerPassword(db, newPassword, clock)`, then assert all Owner sessions are revoked with `server_reset`, the new password signs in, the old one fails, a policy-violating password is rejected, and the audit entry is `password.server_reset` with actor `system:cli`.
- [X] T067 [P] [US3] Integration test for the sign-in history in `apps/server/tests/integration/signInHistory.test.ts`: the list is newest first, has keyset pagination, contains only the caller's attempts, and includes the outcome, reason, device label and IP.
- [X] T068 [P] [US3] Playwright e2e test in `apps/web/e2e/security.spec.ts`:
  - two browser contexts signed in; the security page lists both with "This device" marked;
  - "Sign out" on the other one signs it out;
  - change password → the other context is signed out;
  - "Log out all devices" with confirmation → back to sign-in.

### Implementation for User Story 3

- [X] T069 [US3] Implement `apps/server/src/auth/throttle.ts`: `checkThrottle(db, {usernameNormalized, ip}, clock)` returns `{blocked, reason: 'account_blocked'|'ip_blocked', retryAfterSeconds}` using the counts from data-model.md.
- [X] T070 [US3] Wire the throttle into `apps/server/src/auth/signIn.ts` (when blocked: record an attempt with outcome `blocked`, audit `auth.sign_in_blocked`, throw `too_many_attempts` with `retryAfterSeconds`, and skip the password check). Also apply the IP throttle to `POST /api/setup` wrong codes in `apps/server/src/auth/setup.ts`.
- [X] T071 [US3] Implement `POST /api/me/password` (authenticated) in `apps/server/src/routes/me.ts`:
  - verify the current password; a failure records a failed attempt toward the account block and returns `403 current_password_invalid`;
  - apply the policy and `password_same_as_current`;
  - update the hash and `password_changed_at`;
  - `revokeAllForUser(…, 'password_change', {exceptSessionId: current})`;
  - audit `password.changed`.
- [X] T072 [US3] Implement the session routes in `apps/server/src/routes/sessions.ts`: `GET /api/me/sessions`, `DELETE /api/me/sessions/:id` and `POST /api/me/sessions/revoke-all` (all authenticated, with audits and cookie clearing on revoke-all). Register them in `app.ts`.
- [X] T073 [US3] Implement `GET /api/me/sign-in-history?cursor=&limit=` (authenticated, keyset pagination on `(occurred_at, id)`, `signInAttempt` presenter) in `apps/server/src/routes/signInHistory.ts`. Register it in `app.ts`.
- [X] T074 [US3] Implement the CLI `apps/server/src/cli/reset-owner-password.ts`:
  - export `resetOwnerPassword(db, password, clock)`;
  - the `main()` reads the password twice from a hidden TTY prompt or once from `--password-stdin`, opens `DATA_DIR/app.db`, runs the reset, and prints the result;
  - exit codes are non-zero when there is no Owner or the policy rejects the password.
  Wire it to the `owner:reset-password` script in `apps/server/package.json`.
- [X] T075 [P] [US3] Implement the CLI `apps/server/src/cli/download-geo.ts`: download the current DB-IP Lite City `.mmdb` (`.gz`) into `DATA_DIR/geo/`, then verify it opens. Wire it to the `geo:download` script.
- [X] T076 [US3] Build the security screen in `apps/web/src/routes/security.tsx`:
  - a change-password form (current, new, confirm) that shows the policy errors;
  - an active-sessions list (device label, location or "Unknown", sign-in time, last activity, "This device" badge, per-row "Sign out");
  - a "Log out all devices" button with a confirm dialog;
  - a sign-in history list with outcome badges and "Load more";
  - all dates through `formatDateTime`.
- [X] T077 [US3] Add every US3 string (security page, outcome and reason labels, revoke reasons, confirm dialog) to the three files in `apps/web/src/locales/*/common.json`. Add the DB-IP attribution line ("IP geolocation by DB-IP") on the security page.

**Checkpoint**: Q12–Q15 pass.

---

## Phase 6: User Story 4 — Review the audit log (Priority: P4)

**Goal**: an Owner-only audit log, newest first, filterable by person, action type and date range, with before/after values and no way to edit or delete.

**Independent Test**: produce sign-in, failed sign-in, password change and settings events, then filter and view them; confirm `UPDATE`/`DELETE` on the table abort and a non-Owner gets `403` (quickstart Q16–Q17).

**Depends on**: US1. Its events come from US1, US3 and US5, and the tests seed what they need.

### Tests for User Story 4

- [X] T078 [P] [US4] Integration tests in `apps/server/tests/integration/audit.test.ts`:
  - events from sign-in, a failed sign-in and a password change produce entries with actor, time, IP, device label, and before/after where relevant (Q16);
  - filters by `actorId`, exact `action`, prefix `auth.`, and an inclusive `from`/`to`;
  - newest-first keyset pagination;
  - `GET /api/audit/actions` returns the known codes;
  - a worker row inserted directly and signed in → `403 forbidden` on both audit routes (FR-019);
  - a direct `UPDATE`/`DELETE` on `audit_entries` aborts with `audit_append_only` (Q17).
- [X] T079 [P] [US4] Playwright e2e test in `apps/web/e2e/audit.spec.ts`: the Owner opens the audit log, sees translated action names, filters by "Sign-in" and today's date, and the list updates; there are no edit or delete controls.

### Implementation for User Story 4

- [X] T080 [US4] Implement `apps/server/src/audit/query.ts`: `listAudit(db, {actorId?, action?, from?, to?, cursor?, limit})`. An action ending in `.` is a prefix match; the keyset cursor is on `(occurred_at DESC, id DESC)` and encoded opaquely; limit defaults to 50, max 200.
- [X] T081 [US4] Implement `GET /api/audit`, `GET /api/audit/actions` and `GET /api/audit/actors` (for the person filter; added to contracts/api.md) (policy `owner`) in `apps/server/src/routes/audit.ts`, using the `auditEntry` presenter. Register them in `app.ts`.
- [X] T082 [US4] Build the audit screen in `apps/web/src/routes/audit.tsx`:
  - filters: person (from the actors present), an action-type select built from `/api/audit/actions` with translated labels, and a date range;
  - a newest-first list of cards for phone screens, each showing the time, actor, translated action, device and IP, and an expandable before → after diff for edits;
  - "Load more";
  - no edit or delete controls;
  - Owner-only route guard.
- [X] T083 [US4] Add a translated label in all three locale files for every audit action code (`audit.action.<code>`) and every filter or label used on the audit page, in `apps/web/src/locales/*/common.json`.

**Checkpoint**: Q16–Q17 pass.

---

## Phase 7: User Story 5 — Set up basic company settings (Priority: P5)

**Goal**: an Owner-only settings page for the company name and session idle timeout, with CNY shown as the fixed base and the four supported currencies.

**Independent Test**: change the company name and idle timeout; the header updates, the new timeout is enforced, and the audit shows before/after (quickstart Q18).

**Depends on**: US1.

### Tests for User Story 5

- [X] T084 [P] [US5] Integration tests in `apps/server/tests/integration/settings.test.ts`:
  - `GET /api/settings` returns `baseCurrency 'CNY'`, the 4 currencies in order, and timeout 720;
  - `PATCH` with a company name of `汉景机械 HANJING — شركة` round-trips and appears in `GET /api/me` `company.name` (Q8);
  - timeout 14 or 10081 → `400 timeout_out_of_range`;
  - a `baseCurrency` field is rejected or ignored and stays `CNY`;
  - after setting the timeout to 15 and advancing the clock 16 min → `401`;
  - audit `settings.updated` contains only the changed fields;
  - a worker → `403`.
- [X] T085 [P] [US5] Playwright e2e test in `apps/web/e2e/settings.spec.ts`: the Owner sets the company name, the header shows it after save, the currency section shows CNY as base (read-only) plus USD, MAD and EUR, and changing the timeout shows a saved confirmation.

### Implementation for User Story 5

- [X] T086 [US5] Implement `GET /api/settings` and `PATCH /api/settings` (policy `owner`, zod schema with no `baseCurrency`) in `apps/server/src/routes/settings.ts`. Use `settings/service.ts` and the `settings` presenter, and register them in `app.ts`.
- [X] T087 [US5] Build the settings screen in `apps/web/src/routes/settings.tsx`:
  - a company name field (`dir="auto"`);
  - a currency section: base CNY with a lock badge, and the supported currency list with symbols and translated names;
  - session timeout as a number plus a unit select (minutes / hours / days), converted to minutes and checked against 15–10080;
  - save with success and error feedback, input kept on error;
  - invalidate the `me` query so the header updates.
- [X] T088 [US5] Add every US5 string (settings labels, currency names `currency.CNY/USD/MAD/EUR`, units, success messages) to the three files in `apps/web/src/locales/*/common.json`.

**Checkpoint**: Q18 passes. All five stories work.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T089 [P] Implement the recoverable-deletion helpers in `apps/server/src/softDelete/index.ts`: `softDeleteColumns()` for schemas, `notDeleted(table)`, and `softDelete(tx, table, id, actor, ctx)` / `restore(...)`, each recording the audit entry `record.deleted` / `record.restored`. Add unit tests with a test-only fixture table in `apps/server/tests/unit/softDelete.test.ts` (Q19, FR-024).
- [X] T090 [P] Add a Content-Security-Policy to the `secureHeaders` config in `apps/server/src/app.ts`: `default-src 'self'`, `img-src 'self' data:`, `style-src 'self' 'unsafe-inline'`, `font-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`. Add a test in `apps/server/tests/integration/headers.test.ts` asserting the CSP, nosniff, Referrer-Policy and the session cookie attributes (HttpOnly, SameSite=Lax, Secure when `NODE_ENV=production`).
- [X] T091 [P] Add a check that nothing loads from external hosts (Q20, FR-033) in `apps/web/e2e/no-external-requests.spec.ts`: route-block every request not to localhost, fail the test if any is attempted while visiting all screens, and scan `apps/web/dist` for `http(s)://` hosts other than the app's own.
- [X] T092 [P] Write the root `README.md`: what the app is; prerequisites; install; env vars (link to `apps/server/.env.example`); first-launch setup code; `npm run dev`/`test`/`test:e2e`; the Owner password reset command; the geo database download and attribution; data location. Note that backups and deployment are covered in feature 009.
- [X] T093 Set a performance budget: check the gzipped initial JS bundle is ≤ 250 KB with `vite build` output. Add a Playwright test on the mobile project with CPU and network throttling (about 1 Mbps, 300 ms latency) asserting that previously visited screens render in ≤ 2 s (SC-007), in `apps/web/e2e/performance.spec.ts`.
- [X] T094 Run the full quickstart validation (Q1–Q20 in `specs/001-platform-foundation/quickstart.md`), plus `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e`. Fix every failure and record the results in the PR description.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks all user stories.**
- **US1 (Phase 3)**: depends on Foundational. This is the MVP.
- **US2, US3, US4, US5 (Phases 4–7)**: each depends on US1 (it needs the Owner and sign-in). They are independent of each other and can run in parallel or in priority order.
- **Polish (Phase 8)**: T089 and T090 can start right after Foundational. T091–T094 need every story done.

### Story dependency graph

```text
Setup ──► Foundational ──► US1 (MVP) ──┬──► US2 (languages / PWA)
                                       ├──► US3 (security page, throttle, CLI reset)
                                       ├──► US4 (audit log viewer)
                                       └──► US5 (settings)
                                                     └──► Polish (T091–T094)
```

### Within each story

- Tests are written first and must fail before the implementation.
- Server service/logic → routes → registration in `app.ts` → web screen → translations.
- Shared files touched by several stories need sequential edits, never parallel:
  - `apps/server/src/app.ts` (route registration);
  - `apps/server/src/routes/me.ts` (T045 → T056 → T071);
  - `apps/server/src/auth/signIn.ts` (T042 → T070);
  - the locale files (T050, T062, T077, T083, T088).

### Parallel opportunities

- Setup: T003–T008 together after T001–T002.
- Foundational:
  - the shared-package tasks T009–T012 together;
  - T014, T019 and T024 alongside the DB work (T015–T018);
  - the web core tasks T028–T031 together, independent of the server core.
- Each story's test tasks marked [P] run together.
- After US1: US2, US3, US4 and US5 can be worked on by different agents in parallel. Coordinate edits to `app.ts`, `me.ts` and the locale files.

---

## Parallel Example: User Story 1

```text
# Tests first (all [P], different files):
Task: "T033 Password policy unit tests in apps/server/tests/unit/password.test.ts"
Task: "T034 Setup integration tests in apps/server/tests/integration/setup.test.ts"
Task: "T035 Sign-in/session integration tests in apps/server/tests/integration/auth.test.ts"
Task: "T036 Deny-by-default test in apps/server/tests/integration/policy.test.ts"
Task: "T037 Owner protection test in apps/server/tests/integration/ownerProtection.test.ts"
Task: "T038 Setup + sign-in e2e in apps/web/e2e/setup-and-sign-in.spec.ts"

# Then, in parallel with the server work (T039–T045):
Task: "T046 Setup screen in apps/web/src/routes/setup.tsx"
Task: "T047 Sign-in screen in apps/web/src/routes/sign-in.tsx"
```

## Parallel Example: after US1

```text
Agent A: US2 (T051–T062)   Agent B: US3 (T063–T077)
Agent C: US4 (T078–T083)   Agent D: US5 (T084–T088)
# Coordinate: app.ts route registration, routes/me.ts, locale JSON files
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 (US1). **Stop and validate** Q1–Q6: the Owner can set up, sign in and sign out, and nothing is reachable while signed out.
3. Optionally demo on a phone over the local network.

### Incremental delivery

1. Add US2: the app becomes usable in Arabic and French and installable. This is the most visible value for the Owner.
2. Add US3: account safety (devices, password change, guessing blocks, server reset).
3. Add US5: company name and timeout. Then add US4, the audit log viewer.
4. Polish, then the full quickstart validation. Merge, and tick 001 in `ROADMAP.md`.

### Notes

- [P] = different files and no dependency on unfinished tasks.
- Commit after each task or logical group.
- Never cache `/api` responses in the service worker, and never log passwords, tokens or setup codes, except the one-time setup-code line at boot.
- Every new `/api` route must go through `route()` with a policy, or the app refuses to start.
