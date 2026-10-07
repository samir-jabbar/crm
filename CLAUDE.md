# HANJING Order Manager

A mobile-first web app (PWA) for managing customer orders of heavy equipment bought in China and shipped to Morocco/Africa: costs, payments, shipment tracking, documents and invoices. The product brief is [HANJING_Order_Manager_Spec.md](HANJING_Order_Manager_Spec.md). The project principles are in [.specify/memory/constitution.md](.specify/memory/constitution.md).

## Spec-driven workflow (GitHub Spec Kit)

The brief is split into numbered features in [ROADMAP.md](ROADMAP.md). It also holds the cross-cutting decisions D1–D8, which every spec must follow. Work on the next unchecked feature, using the `/speckit-specify` prompt given in its entry.

Use the skills in `.claude/skills`, in this order:

1. `/speckit-constitution` — amend project principles (currently v1.1.0)
2. `/speckit-specify` — specify the next ROADMAP.md feature
3. `/speckit-clarify` — optional, resolve ambiguity before planning
4. `/speckit-plan` — choose the stack and design; includes the Constitution Check
5. `/speckit-tasks` — generate the task list
6. `/speckit-analyze` — optional, cross-artifact consistency check
7. `/speckit-implement` — build it

Build one ROADMAP.md feature at a time, not the whole app in a single spec. Tick its box in ROADMAP.md once it is merged.

## Library docs: always use Context7

Before writing or changing code that uses any library, framework, SDK or CLI, call the Context7 MCP tools. Call `resolve-library-id` first, then `query-docs`. Do this even for well-known libraries, and during `/speckit-plan` to verify chosen stack versions. Do not rely on memory for APIs or configuration.

## Active Technologies
- TypeScript 6 (strict), Node.js 24 LTS (001-platform-foundation)
- SQLite (WAL mode), file under `DATA_DIR` (001-platform-foundation)
- Hono 4 API + React 19/Vite 8 PWA (React Router 8, TanStack Query, Tailwind v4, Radix + shadcn-style components, i18next), Drizzle ORM, Vitest + Playwright; npm workspaces `apps/server`, `apps/web`, `packages/shared` (001-platform-foundation)
- Money as integer minor units, decimal strings in the API; `hj_norm` SQL function for cross-script search (002-customers-suppliers-orders)

## Recent Changes
- 002-customers-suppliers-orders: customers, suppliers, orders (HJ-YYYY-NNN numbers, typed agreed price), notes, soft delete/restore
- 001-platform-foundation: stack chosen; custom username + password session auth (ROADMAP D9)

## Windows notes

- Shell is PowerShell, with Git Bash also available. Spec Kit scripts are the PowerShell (`ps`) variant.
- Run the `specify` CLI with `PYTHONUTF8=1` (Bash: `export PYTHONUTF8=1`; PowerShell: `$env:PYTHONUTF8 = "1"`), or it crashes printing its banner on the cp1252 console.
