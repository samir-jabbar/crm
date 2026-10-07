# Implementation Plan: Customers, Suppliers and Orders

**Branch**: `002-customers-suppliers-orders` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/002-customers-suppliers-orders/spec.md`

## Summary

Add the first business records on top of the 001 platform:
- an address book of customers and suppliers;
- orders with item lines;
- order notes;
- recoverable deletion and restore;
- an order-number prefix setting.

Orders get automatic `HJ-YYYY-NNN` numbers, a hand-typed agreed price shown against the item total, status changes, duplication, and a control-center page with tabs for later features.

Technical approach:
- **Same stack as 001**, with no new dependencies.
- **Money** is stored as integer minor units and carried as decimal strings.
- **Order numbers** come from a yearly counter in an immediate write transaction.
- **Search** works across scripts through a registered SQL normalization function.
- **Deletion** uses the 001 soft-delete helpers.
- **Permissions**: every route uses module/action policies and presenters that declare sensitive fields for 005.

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node.js 24 LTS. Unchanged from 001.
**Primary Dependencies**: Hono 4, Drizzle ORM + better-sqlite3, zod 4. Web: React 19, Vite 8, React Router 8, TanStack Query, Tailwind v4, i18next. No new packages.
**Storage**: SQLite (WAL). Adds 6 tables and 1 column via migrations.
**Testing**: Vitest (unit + API integration with the 001 harness), Playwright (mobile 360×800 + desktop).
**Target Platform**: Same as 001 (VPS server + installable PWA).
**Project Type**: Web application (npm workspaces `apps/server`, `apps/web`, `packages/shared`).
**Performance Goals**:
- search and filter in < 1 s with 5,000 orders (SC-002);
- order creation in < 2 min on a phone (SC-001);
- duplication in < 15 s (SC-004).

**Constraints**:
- exact money (no floats);
- numbers unique and never reused under concurrent creation;
- every route behind a module/action policy;
- every screen RTL-safe at 360px.

**Scale/Scope**: About 5,000 orders, a few hundred customers and suppliers, about 25 API routes, 9 screens.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / Constraint | How this plan complies | Status |
|---|---|---|
| I. Per-order financial accuracy | Integer minor units in storage, decimal strings in the API, integer line totals. Item total and difference are derived, never stored. Currency is kept with every price (R1). | Pass |
| II. Mobile-first PWA | Stacked item cards, native date/select inputs, full-screen forms, 360px e2e checks. | Pass |
| III. Multilingual and Unicode-complete | All new strings in EN/FR/AR; `hj_norm` search for accents, Arabic marks and Chinese (R3); `dir="auto"` on user text; Western digits in amounts. | Pass |
| IV. Never lose data | Soft delete + restore for orders, customers, suppliers and notes; numbers never reused; every change audited (R4, R5). | Pass |
| V. Secure by default | Module/action policies on every route (deny by default from 001); sensitive fields declared for 005 (R7). | Pass |
| VI. Simplicity and evolvability | No new dependencies; full-replace order edit; offset pagination for small lists. | Pass |
| VII. Current documentation first | better-sqlite3 `db.function` and Drizzle upsert/immediate transactions checked in Context7. | Pass |
| CNY base currency | Budget in CNY; prices keep their own currency until conversion arrives in 003–004 (D1, D2). | Pass |
| Invoice = agreed price | Not touched (006). The agreed price is the single typed figure invoices will check against. | N/A |
| One server-side policy layer | Presenters for every new resource, with a declared sensitive-field list. | Pass |

**Post-design re-check**: data-model.md, contracts/api.md and quickstart.md add no dependencies, services or projects. All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/002-customers-suppliers-orders/
├── plan.md
├── research.md          # R1–R10
├── data-model.md
├── quickstart.md        # V1–V19
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (changes on top of 001)

```text
packages/shared/src/
├── enums.ts                     # + ORDER_STATUSES, OPEN_ORDER_STATUSES, INCOTERMS, policy modules
├── errors.ts                    # + new error codes (data-model.md)
├── money.ts                     # parseAmount / formatAmount / minor-unit helpers (R1)
├── search.ts                    # normalizeForSearch (same algorithm as SQL hj_norm, R3)
└── api/{customers,suppliers,orders}.ts   # zod request schemas + response types

apps/server/
├── drizzle/                     # generated 0002 migration + custom 0003 (order_number_prefix, CHECKs)
├── src/db/client.ts             # register hj_norm on every connection
├── src/db/schema/{customers,suppliers,orders,orderItems,orderNotes,orderNumberCounters}.ts
├── src/orders/
│   ├── numbering.ts             # chinaYear(), nextOrderNumber(tx) (R2)
│   ├── service.ts               # create / update (items diff) / status / duplicate / delete / restore
│   └── query.ts                 # list with filters + search, summary, by customer/supplier
├── src/customers/service.ts     # CRUD, duplicate-name check, in-use check
├── src/suppliers/service.ts
├── src/routes/{customers,suppliers,orders,orderNotes}.ts
├── src/policy/present.ts        # + presenters, SENSITIVE_FIELDS (R7)
└── tests/
    ├── unit/{money,numbering,search}.test.ts
    └── integration/{customers,suppliers,orders,orderNotes,ordersSearch,policies002}.test.ts

apps/web/src/
├── routes/orders/{list,new,detail,edit}.tsx
├── routes/customers/{list,form,detail}.tsx
├── routes/suppliers/{list,form,detail}.tsx
├── components/{CustomerPicker,SupplierPicker,ItemsEditor,MoneyInput,AmountText,StatusBadge,ComingSoon}.tsx
├── api/{orders,customers,suppliers}.ts   # query hooks
├── locales/{en,fr,ar}/common.json        # + orders/customers/suppliers/status/incoterm keys
└── e2e/{orders,customers-suppliers}.spec.ts
```

**Structure Decision**: same three workspaces as 001. Business logic lives in per-domain server folders (`orders/`, `customers/`, `suppliers/`), and routes stay thin. This is the pattern later features (expenses, payments) follow.

## Key design notes

- **Create order** (R2) runs in one `transaction(..., { behavior: 'immediate' })`:
  1. validate that the customer and suppliers exist;
  2. increment the year counter;
  3. insert the order and its items;
  4. write the audit entry.
- **Edit order** (R4) also runs in one transaction:
  1. load the current order and items;
  2. diff the items by id (insert, update, delete), with positions from array order;
  3. update the order fields;
  4. write one audit entry with the changed fields and, if changed, the items before/after.
- **Search** (R3) registers `hj_norm` in `openDb()`, so tests and production share it. The JS twin in `@hanjing/shared/search.ts` normalizes the query string, and a unit test checks that both give the same results on a sample corpus.
- **Customer picker**: search as you type over `GET /api/customers?q=`, with a "Create '<text>'" entry that opens a small dialog. A 409 duplicate warning shows inside the dialog with "Create anyway".
- **Settings**: `order_number_prefix` is added to `company_settings` (cached like 001 settings). The preview is computed from the current counter + 1 and does not reserve a number.

## Complexity Tracking

No constitution violations to justify.
