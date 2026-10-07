# HANJING Order Manager

A mobile-first web app (installable PWA) for HANJING MACHINERY. It tracks every customer order for heavy equipment bought in China and shipped to Morocco and Africa: costs, payments, shipments, documents and invoices.

- Product brief: [HANJING_Order_Manager_Spec.md](HANJING_Order_Manager_Spec.md)
- Feature roadmap and decisions: [ROADMAP.md](ROADMAP.md)
- Current feature: **001 Platform foundation** ([specs/001-platform-foundation](specs/001-platform-foundation/)). It covers the Owner account, sign-in, devices and sessions, the audit log, English/French/Arabic with RTL, company settings, and the installable shell.

## Stack

| Part | Technology |
|---|---|
| Server | Node.js 24, TypeScript, Hono, Drizzle ORM, SQLite (WAL) |
| Web app | React 19, Vite, React Router, TanStack Query, Tailwind CSS v4, i18next, vite-plugin-pwa |
| Shared | `packages/shared`: zod schemas, error codes, enums used by both sides |
| Tests | Vitest (unit + API integration), Playwright (end-to-end, mobile 360×800 + desktop) |

The app runs as a single process. In production the server also serves the built web app, so everything comes from one origin.

## Prerequisites

- Node.js 24 and npm 11
- Git

> **Windows + WSL:** run the project from **one** environment.
> - **Windows terminal** (PowerShell, or the VS Code terminal) with Windows Node. This is how `node_modules` is installed in this folder.
> - **WSL** with Node installed *inside* Linux, the project cloned into the Linux filesystem (e.g. `~/crm`, not `/mnt/c/...`), and its own `npm install`.
>
> Avoid calling the Windows `npm` from a WSL shell, which happens when WSL has no Node of its own. Stopping it with Ctrl+C can leave Windows `node.exe` processes running, which keep ports 3000/5173 busy. Also, SQLite's WAL mode is unreliable on `/mnt/c`.

## Install and run (development)

```bash
npm install
cp apps/server/.env.example apps/server/.env    # optional: defaults work for local development
npm run db:migrate -w @hanjing/server           # creates apps/server/data/app.db
npm run dev                                     # API on :3000, web app on :5173 (proxies /api)
```

Open http://localhost:5173.

### First launch: the setup code

While no Owner account exists, the server prints a one-time setup code in its log:

```
[setup] No owner yet. Open http://localhost:5173/setup and enter setup code: K7QM-3XRP-9DTA
```

- Enter this code on the setup screen to create the Owner. Without the code, nobody can claim a fresh install.
- A new code is generated at each start until setup is done.
- To use a fixed code instead, set `SETUP_CODE` in `apps/server/.env`.

## Environment variables

All variables are listed with defaults in [apps/server/.env.example](apps/server/.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` serves the built web app from the API process |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `apps/server/data` | Database (`app.db`) and the optional geo database |
| `APP_ORIGIN` | `http://localhost:5173,http://localhost:3000` | Origins allowed to send changes (comma-separated). In production, set the public HTTPS address. Session cookies are marked `Secure` when every origin is HTTPS |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For`. Only enable this behind your own reverse proxy |
| `SETUP_CODE` | random | Fixed first-launch setup code, at least 8 characters |
| `GEO_DB_PATH` | `$DATA_DIR/geo/dbip-city-lite.mmdb` | Optional IP location database |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server + web app with hot reload |
| `npm run build` | Build the web app into `apps/web/dist` |
| `npm start` | Start the server (production: set `NODE_ENV=production`) |
| `npm test` | Unit and API integration tests (server + web) |
| `npm run test:e2e` | Playwright end-to-end tests. Builds the app and starts it on port 3100 with a fresh database. Run `npx playwright install chromium` once first |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:migrate -w @hanjing/server` | Apply database migrations (the server also does this at start) |
| `npm run db:generate -w @hanjing/server` | Generate a migration after changing `apps/server/src/db/schema` |

## Owner password reset (server only)

Sign-in is username + password (ROADMAP D9). There is no email reset. If the Owner forgets the password, whoever runs the server resets it:

```bash
npm run owner:reset-password -w @hanjing/server
# or, non-interactively:
echo 'New-Long-Passphrase-1' | npm run owner:reset-password -w @hanjing/server -- --password-stdin
```

The command:
- applies the password rules (at least 10 characters, not a common password);
- signs out every device of the Owner;
- writes a `password.server_reset` entry to the audit log with actor `system:cli`.

Repeated wrong passwords block sign-in for 15 minutes. That block lifts on its own and is not cleared by the reset.

## Approximate location of devices (optional)

The security page shows an approximate location for each device and sign-in. This uses the free DB-IP Lite City database, looked up locally with no outside calls:

```bash
npm run geo:download -w @hanjing/server     # re-run monthly to refresh
```

Without it, locations show as "Unknown". Attribution: *IP geolocation by DB-IP* (CC BY 4.0), shown on the security page.

## Customers, suppliers and orders (feature 002)

- **Order numbers** look like `HJ-2026-001`.
  - The counter restarts every January (China time).
  - A number is never reused, even after a deletion.
  - Settings → Order numbers changes the prefix for new orders only, and shows the next number.
- **Agreed price** is typed by hand. The item lines show their total next to it, and the difference is for information only.
- **Amounts** are stored exactly, in cents. The API sends them as text such as `"190000.00"`, never as floating-point numbers.
- **Search** works in any script. It ignores capitals, French accents and Arabic vowel marks, and matches Chinese by fragment.
- **Deleting** an order, customer, supplier or note hides it but keeps it.
  - Turn on "Show deleted" in the list to restore it.
  - A customer or supplier cannot be deleted while orders still use it.
- **Audit log**: every create, edit, delete and restore is recorded there.

## Data, security and backups

- All data is in `$DATA_DIR/app.db` (SQLite). Do not commit `data/`.
- The audit log is append-only: database triggers reject any change or deletion. The Owner account cannot be deleted or demoted, also enforced by triggers.
- Passwords are hashed with Argon2id. Session tokens are stored only as SHA-256 hashes.
- The app loads nothing from Google or CDNs, so it works over a VPN from mainland China (ROADMAP D5).
- **Backups, the restore procedure, HTTPS and deployment to the VPS are delivered in feature 009.** Until then, back up by copying `app.db` while the server is stopped.

## Repository layout

```
apps/server     API, migrations (drizzle/), server commands (src/cli/), tests
apps/web        PWA (src/), unit tests (tests/), end-to-end tests (e2e/)
packages/shared Schemas, enums and error codes shared by server and web
specs/          Spec Kit feature specs, plans and task lists
```
