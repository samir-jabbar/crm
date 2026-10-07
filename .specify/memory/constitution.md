# HANJING Order Manager Constitution

## Core Principles

### I. Per-Order Financial Accuracy
Every order shows price, itemized costs, profit, amount received and amount remaining at any moment. These totals are always derived from the underlying expenses and payments, never typed in by hand. Money is stored as exact decimals or integer minor units, never floats. Multi-currency (MAD, USD, CNY, EUR) is first-class: each expense and payment keeps its original currency and an editable exchange rate, and the base-currency amount is computed from them.

### II. Mobile-First PWA
The owner works mostly from a phone, so every screen is designed for a phone first and then scaled up to desktop. The app is an installable Progressive Web App. Features that need a desktop to be usable are a defect.

### III. Multilingual and Unicode-Complete
The UI ships in English, French and Arabic, with correct RTL layout for Arabic. User data (names, product descriptions) may be Arabic, French, English or Chinese, so storage, search and PDF output are full Unicode. Generated PDFs embed fonts covering Latin, Arabic and Chinese (e.g. Noto Sans, Noto Sans Arabic, Noto Sans SC). No user-facing string is hard-coded outside the translation layer.

### IV. Never Lose Data
Daily automatic database backups and a manual "Export all data" (Excel/CSV plus files) are required capabilities. Uploaded documents, receipts and payment proofs are stored durably and linked to their order. Destructive actions need confirmation and, where practical, are reversible.

### V. Secure by Default
Authentication is required for every route and API. Roles and permissions follow the brief's users-and-security module. Secrets stay out of source control. Uploaded files are validated and never executed or served unauthenticated.

### VI. Simplicity and Evolvability
Start with the simplest design that meets the phase being built (single company, one main user, SQLite first), while keeping a clear path to PostgreSQL and 1-2 more users. Add complexity only when a current requirement demands it, and justify it in the plan.

### VII. Current Documentation First (Context7)
Before writing or changing code that uses a library, framework, SDK or CLI, look up its current documentation through the Context7 MCP tools (`resolve-library-id`, then `query-docs`) instead of relying on memory. Library versions and APIs chosen in a plan must be verified this way.

## Additional Constraints

- The product brief is `HANJING_Order_Manager_Spec.md`. The specification and plan must trace back to it.
- The technology stack is not fixed by this constitution. It is chosen in `/speckit-plan`, guided by the brief's suggestions and the principles above.
- AI features (document reading, cross-checking against invoices) use the Claude API with structured JSON output, and must always show the user what was extracted so they can correct it.
- The app must be reachable from both China and Morocco.
- **CNY is the base currency.** Every money record stores its original amount, currency, and a frozen rate to CNY. USD and MAD equivalents use frozen snapshots on the same record. Reports never use today's rates.
- **An invoice always shows the full agreed price.** The Direct payment channel is a non-bank way of paying part of the same price. The app warns when an invoice total differs from the agreed price, and never helps under-declare values.
- **Hosting is a single VPS, reached from China over a VPN.** No Google-hosted assets or APIs, fonts self-hosted, HTTPS only.
- **Permissions are one server-side policy layer.** Every read path goes through it: API, lists, search, exports, PDFs, notifications and the advisor. Derived values inherit the hiding of their inputs.

## Development Workflow

- Work follows Spec Kit order: constitution, specify, clarify (as needed), plan, tasks, implement. One feature from `ROADMAP.md` per specification, in order, not the whole app at once.
- Business rules in the brief's section 6 and the acceptance criteria in section 9 are turned into automated tests where practical.
- Each plan includes a Constitution Check against the principles above.

## Governance

This constitution supersedes other practices. Amendments are made through `/speckit-constitution`, with the version bumped and the change recorded. Plans and reviews must verify compliance, and any deviation must be justified in the plan's complexity section. Runtime guidance for Claude lives in `CLAUDE.md`.

**Version**: 1.1.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07
