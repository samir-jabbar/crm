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
| `DATA_DIR` | `apps/server/data` | Database (`app.db`), receipts and payment proofs (`receipts/`), pre-migration copies (`backups/`) and the optional geo database |
| `APP_ORIGIN` | `http://localhost:5173,http://localhost:3000` | Origins allowed to send changes (comma-separated). In production, set the public HTTPS address. Session cookies are marked `Secure` when every origin is HTTPS |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For`. Only enable this behind your own reverse proxy |
| `SETUP_CODE` | random | Fixed first-launch setup code, at least 8 characters |
| `GEO_DB_PATH` | `$DATA_DIR/geo/dbip-city-lite.mmdb` | Optional IP location database |
| `RATE_FETCH_TIMEOUT_MS` | `5000` | How long a rate provider may take before the app says rates are unavailable |
| `RATES_CURRENCY_API_URLS` | jsDelivr, then `currency-api.pages.dev` | Currency API URL templates, tried in order (`{date}` is `latest` or `YYYY-MM-DD`). Change only to use a mirror |
| `RATES_EXCHANGERATE_API_URL` | `https://open.er-api.com/v6/latest/CNY` | ExchangeRate-API open-access URL. Change only to use a mirror |
| `REGISTRATIONS_PER_HOUR` | `5` | Worker registrations accepted per network address per hour. Raise only for automated tests |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server + web app with hot reload |
| `npm run build` | Build the web app into `apps/web/dist` |
| `npm start` | Start the server (production: set `NODE_ENV=production`) |
| `npm test` | Unit and API integration tests (server + web) |
| `npm run test:e2e` | Playwright end-to-end tests. Builds the app and starts it on port 3100 with a fresh database. Run `npx playwright install chromium` once first |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:migrate -w @hanjing/server` | Apply database migrations (the server also does this at start). When some are pending, it first saves a copy of the database to `$DATA_DIR/backups/` and prints its path |
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

## Expenses and exchange rates (feature 003)

- **Expenses** belong to one order (order page → Expenses tab → "Add expense"). Each keeps its own amount and currency (CNY, USD, MAD or EUR) and the rate to CNY used that day.
  - The rate is shown as "1 USD = 7.100000 CNY", with up to 6 decimals, and never changes unless the expense is edited.
  - The CNY amount is amount × rate, rounded to the cent (half a cent up). Totals add these rounded amounts, so they always match the lines shown.
  - Each expense also records the USD and MAD rates of its date when the app already has them, for later reports. Saving never waits for a rate provider.
- **Receipts**: one photo or PDF per expense, up to 10 MB. Photos are reduced on the phone before upload.
  - They are stored in `$DATA_DIR/receipts/`. Back that folder up with `app.db`.
  - Receipts are served only to signed-in users allowed to see the expense. PDFs download and open in the phone's own viewer.
  - An upload that is never attached to an expense is removed after 24 hours.
- **Profit** is in CNY. An order not priced in CNY needs its **agreed rate** (on the order form). Profit = agreed price × agreed rate − all expenses (paid and to pay).
  - Orders created before this feature show "Set the agreed rate to see profit" until the rate is entered.
- **Exchange rates** (Settings → Exchange rates):
  - **Currency API** (default): free, no key, rates for past dates too.
  - **ExchangeRate-API (open access)**: free, no key, latest rates only. Its terms require the line "Rates By Exchange Rate API", which the app shows next to its rates.
  - **Manual only**: every rate is typed by hand.
  - Rates are fetched by the server only (never by the phone), kept for the day, and the provider is called at most once a day unless you press "Refresh rates". If the provider is down, the app says so and every rate can still be typed.
  - The optional access key stays on the server: it is never shown again in full and never written to the audit log.
- **Reimbursements**: "Advanced by" records who paid with their own money. The dashboard shows what is still owed to each person; mark expenses "reimbursed" once paid back.
- **Categories**: 13 default categories in the user's language. In Settings you can add your own, rename and hide them. Hidden categories stay on existing expenses.

## Payments and order financial summary (feature 004)

- **Two channels**: "Direct payments" and "Bank payments (invoiced)". The commercial invoice is always the full agreed price, and Direct is just another way of paying part of it (ROADMAP D3). Until invoices exist (feature 006), the invoice total is the agreed price.
- **Payment plan**: each order has stages, each with a type, a channel, a share of the agreed price, and a due point (before a status, or on a date).
  - New orders copy the default plan: a 30% deposit in Direct before "In production", then a 70% balance through the Bank before "On vessel". Orders created before this feature got the same plan.
  - The shares must add up to 100%. Stage amounts are worked out from the agreed price, so they follow a price change. The last stage takes any rounding cent.
  - To change one order's plan, use "Edit plan" on its Payments tab. To change the default and the channel names, use Settings → Payments.
- **Recording a payment** (order page → Payments tab): the amount, currency, date, type, reference, and an optional proof (a photo or PDF, up to 10 MB). The payment also records the rates of its day:
  - **Customer rates**: USD and MAD to CNY always, and EUR too when the payment or the order is in EUR. "Fetch rate" fills them from the rate service (feature 003), and they can also be typed.
  - **Bank conversion** (foreign currencies only): the rate the bank actually applied, the bank, whether it was a buying or selling rate, and when. The bank list is in Settings → Payments.
  - **Gap**: the bank's rate against the market rate of the payment date, in CNY (amount × (bank − market)) and as a percentage of the market rate. The market rate comes from the rate cache, so saving never waits for a provider.
- **CNY value** (decided 2026-10-08): a payment counts for the CNY that actually arrived. That is amount × the bank's rate when one is entered, otherwise amount × the payment's own rate.
- **"Counts as"** (decided 2026-10-08): a payment in a currency other than the order's counts toward the order through its own rates. For example, MAD paid on a USD order counts as amount × MAD rate ÷ USD rate. The figure can be overwritten by hand, and clearing it brings back the computed value.
- **Order summary** (Payments tab and Overview): received, remaining and % paid, per channel and in total, plus the average rate actually obtained in each currency and the payment history.
- **Profit** (ROADMAP D2) is in CNY: CNY received + what remains × the agreed rate − all expenses.
  - Margin = profit ÷ (CNY received + what remains, in CNY).
  - **Exchange gain/loss** = CNY received − the same amounts at the agreed rate.
  - An order not priced in CNY that is still owed money needs its agreed rate before profit shows.
- **Warnings** appear on the payment form before saving and on the Payments tab. They never block saving. They show when:
  - more has been received than the agreed price;
  - the Bank payments exceed the invoice total.
- **Closing an order that is still owed money** asks for confirmation, and the audit log records the amount outstanding.
- **Currency lock**: an order's currency cannot change once it has payments, because what remains is counted in that currency.
- **Edit, delete and restore** work as for expenses. Every change is in the audit log. Deleted payments leave every total and stay under "Show deleted payments".
- **Permissions**: Direct and Bank payments are two separate permissions (feature 005). No default role template includes Direct payments.

## Workers and permissions (feature 005)

- **Joining**: a new worker taps **Register** on the sign-in screen and chooses a username and password. The account waits for approval and cannot sign in until then.
  - The Owner sees "Users (n waiting)" in the menu, checks when and from which device the person registered, and approves with a role template or rejects. A rejected username can be registered again.
  - Settings → Sign-in session → "New workers may register" closes registration when nobody is expected. At most 5 registrations per hour come from one network address.
- **Role templates** (Users → Role templates): Logistics assistant, Site/trip assistant, Accountant, Sales assistant and Read-only, editable, plus your own.
  - A template is copied when you apply it. Changing a template never changes workers already set up; "Start again from a template" on a worker's page re-applies one.
- **What a worker may do** (their page in Users), saved together and applied at their next action, on every device:
  - **Modules and actions**: View, Create, Edit, Delete, Export per module. Shipments, Documents, Invoices and the Advisor can be set now and apply when those features arrive. A worker with a module that lives inside orders (Expenses, a payment channel, Shipments…) but not Orders sees only each order's number, title, customer and status.
  - **Which orders**: all orders, the orders assigned to them (assign from the order page or the worker's page), or the orders of selected customers. "Only their own entries" limits expenses and payments to what they recorded, with totals labelled "Your entries". An optional end date stops access at the end of that day, China time.
  - **Hidden values**: selling price, profit and margin; supplier purchase prices; supplier identity; customer contact details; payment amounts and rates; bank details. A hidden value is never sent to the worker's phone, and neither is any figure computed from it: hiding the price also hides what remains to collect, % paid, planned amounts and profit.
  - The editor refuses combinations that cannot work and says why (for example, creating orders with prices hidden).
- **Always the Owner's alone**: the Users area, role templates, assignments, the audit log, the session timeout and opening registration. Workers can be given the other settings (company name, order numbering, categories, payment settings, exchange-rate settings).
- **Account actions**: suspend and reactivate, sign out everywhere, a temporary password (the worker must choose their own at the next sign-in), and deletion (final: their records keep their name and the username is never reused). Every action is in the audit log.
- **Owner's checklist**:
  - Keep prices out of titles, names and notes: free text is shown as typed and cannot be hidden.
  - A worker who sees the agreed price and the Bank payments but not Direct payments may notice that the Bank covers only part of the price. Hide the selling price too if that matters.
  - Exports (feature 009) will follow the same permissions.

## Data, security and backups

- All data is in `$DATA_DIR/app.db` (SQLite) and, for receipts and payment proofs, `$DATA_DIR/receipts/`. Do not commit `data/`.
- **Pre-migration copies**: when an update brings database changes, the server first saves a full copy of the database to `$DATA_DIR/backups/pre-migration-<date-time>.db`, then upgrades. It also refuses to start if the upgrade would leave broken links between records. Keep the copy until the updated app has run fine, then delete it. These copies are not a backup plan.
- The audit log is append-only: database triggers reject any change or deletion. The Owner account cannot be deleted or demoted, also enforced by triggers.
- Passwords are hashed with Argon2id. Session tokens are stored only as SHA-256 hashes.
- Every request is checked on the server against the user's permissions, scope and hidden values (feature 005). A record outside a worker's scope answers exactly like one that does not exist.
- The app loads nothing from Google or CDNs, so it works over a VPN from mainland China (ROADMAP D5).
- **Backups, the restore procedure, HTTPS and deployment to the VPS are delivered in feature 009.** Until then, back up by copying `app.db` and the `receipts/` folder while the server is stopped.

## Repository layout

```
apps/server     API, migrations (drizzle/), server commands (src/cli/), tests
apps/web        PWA (src/), unit tests (tests/), end-to-end tests (e2e/)
packages/shared Schemas, enums and error codes shared by server and web
specs/          Spec Kit feature specs, plans and task lists
```
