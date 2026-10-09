# Implementation Plan: Workers and Permissions

**Branch**: `005-workers-permissions` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/005-workers-permissions/spec.md`

## Summary

Workers register themselves and wait for approval (D9). When approving, the Owner picks a role template, and its permissions are copied to the worker and can be adjusted. A worker's access has four parts: a module × action matrix, a data scope (all, assigned or selected customers' orders, own entries only, an end date), hidden value groups, and the D6 inheritance of derived figures.

Technical approach: fill in the hooks 001–004 left for this feature, without new libraries.
- **Who**: `can()` and `authorize` read a per-request `Access` object built from the user row, which the session check already reloads on every request. Permission changes therefore apply on the next request.
- **Which records**: `policy/scope.ts` gives SQL predicates (`IN (SELECT …)` on assignments and selected customers, `created_by` for own entries). Every 001–004 query that reaches orders, expenses, payments, customers or suppliers takes the `Access` and applies them. An out-of-scope record answers `404`.
- **Which values**: `HIDDEN_FIELDS` (group → resource → keys) and a `FIGURES` table (figure → the visibility it needs) drive `applyFieldRules` in `policy/present.ts`. Hidden keys are omitted from every response.
- **Proof**: sentinel sweeps call every registered route as each restricted worker and check that no hidden value or out-of-scope id appears.

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node.js 24 LTS. Unchanged.
**Primary Dependencies**: unchanged (Hono 4, Drizzle 0.45 + better-sqlite3, zod 4, argon2, React 19, React Router 8, TanStack Query, Tailwind 4, i18next). No new packages. Drizzle's `inArray(column, subquery)` was checked through Context7 (R3).
**Storage**: SQLite.
- Migration 0008 (generated) adds:
  - columns on `users` and `company_settings`;
  - the tables `role_templates`, `order_assignments`, `user_customers` and `registrations`;
  - indexes on `expenses(created_by)` and `payments(created_by)`.
- Migration 0009 (custom) seeds the five templates.

No table is rebuilt. Both run under the 004 safe-migration procedure.
**Testing**:
- Vitest unit: permission-set normalization and conflicts, the `FIGURES` table, China-date access end, the scope predicates.
- Vitest integration: one file per story, plus the sentinel route sweeps for AC6, the three example workers and each hidden group.
- Playwright (mobile and desktop): registration and approval, the AC6 worker, the permission editor, example-worker paths, RTL for the new screens.

**Target Platform / Project Type**: unchanged (web application, npm workspaces `apps/server`, `apps/web`, `packages/shared`).
**Performance Goals**: a worker's order list and order page within 2 s on a phone with 1,000 orders (SC-007). Scope uses indexed subqueries, and `Access` is built once per request.
**Constraints**:
- deny by default;
- hidden values never leave the server, including in search, files, warnings and errors;
- saving never changes a hidden value;
- an out-of-scope record looks like a missing one;
- the Owner is never restricted.

**Scale/Scope**: up to about 10 workers and 5–10 templates. About 21 new routes. Policy, scope and field changes touch every 001–004 route. New screens: Register, Users, a worker's page with the permission editor, Templates, the order assignees panel, and the forced password change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / Constraint | How this plan complies | Status |
|---|---|---|
| I. Per-order financial accuracy | No money math changes. Figures are either exact as before or omitted. "Your entries" totals use the same BigInt sums over the viewer's own rows (R4). | Pass |
| II. Mobile-first PWA | The permission editor shows one module per row with toggle chips, hidden groups as switches with one-line explanations, and a sticky Save. Approval takes one screen (template → Approve). 360 px e2e. | Pass |
| III. Multilingual and Unicode | Default template names, module, action and group labels, and every new message in EN/FR/AR. Display names in any script. | Pass |
| IV. Never lose data | Deleting a worker is soft and keeps their name on records. Template deletion is soft. Pre-migration copy. Every account and permission change is audited. | Pass |
| V. Secure by default | Server-side enforcement through the single gate. Scope applied in SQL. Hidden keys omitted. Out-of-scope answers `404`. Registration throttled and closable. Temporary passwords force a change. Sessions end on suspend, delete, reset and access end. | Pass |
| VI. Simplicity | No new dependencies. Permissions are one validated JSON value per user and template. Scope uses two small link tables. Templates are copied, not linked. | Pass |
| VII. Current documentation first | No new library APIs. Drizzle's subquery filter was checked through Context7. | Pass |
| D6 one policy layer | `can`, `requireChannel`, `visibleChannels`, `applyFieldRules` and the new scope predicates are the only places rules live. Derived figures follow `FIGURES`. Search, pickers and files go through the same `Access`. | Pass |
| D9 simple sign-in | Self-registration with approval. No invitations, email or second factor. Owner-set temporary passwords. | Pass |
| D3 / D2 | Unchanged rules. Their figures are hidden whole when their inputs are hidden. | Pass |

**Post-design re-check**: research.md, data-model.md, contracts/api.md and quickstart.md add no projects or dependencies. All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/005-workers-permissions/
├── plan.md
├── research.md          # R1–R14
├── data-model.md
├── quickstart.md        # W1–W24
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (changes on top of 004)

```text
packages/shared/src/
├── enums.ts                      # MODULES, MODULE_ACTIONS, ORDER_BOUND_MODULES, HIDDEN_GROUPS, ORDER_SCOPES, TEMPLATE_KEYS,
│                                 # new audit actions and sign-in reasons
├── permissions.ts                # permissionSetSchema (normalize + conflicts), Access type, FIGURES + figureVisible
├── errors.ts                     # account_pending, account_suspended, access_ended, registration_closed,
│                                 # password_change_required, permission_conflict, purchase_hidden, already_decided
└── api/{auth,me,users,roleTemplates}.ts  # register, access in /me, user and template schemas; optional sensitive fields

apps/server/
├── drizzle/                      # 0008 generated (columns + 4 tables + indexes) + 0009 template seeds
├── src/db/schema/{users,companySettings,roleTemplates,orderAssignments,userCustomers,registrations}.ts
├── src/policy/
│   ├── access.ts                 # accessFor(user), FULL_ACCESS, accessEnded(user, now)
│   ├── authorize.ts              # can() from Access; basic order access; owner-only list; password-change gate
│   ├── scope.ts                  # orderVisible, ownEntries, customerVisible, supplierVisible
│   └── present.ts                # HIDDEN_FIELDS by group, FIGURES-driven omission, basic order view, yourEntries
├── src/auth/{register,signIn,sessions}.ts   # registration + throttle; per-status sign-in outcomes; access end
├── src/users/{service,query,templates,assignments}.ts
├── src/{orders,customers,suppliers,expenses,payments}/*  # Access parameter on every query; hidden-field merge on save
├── src/routes/{register,users,roleTemplates,assignees}.ts (+ policy changes in settings, rates, paymentSettings, categories)
└── tests/
    ├── unit/{permission-set,figures,access-end,scope}.test.ts
    └── integration/{register,users.manage,templates,modules,scope,hidden,examples,sweeps005,migration005,policies005}.test.ts

apps/web/src/
├── lib/access.ts                 # useAccess(), can(), hidden(), figure()
├── components/guards.tsx         # RequireModule; password-change redirect
├── components/AppShell.tsx       # navigation from access; pending badge for the Owner
├── routes/register.tsx, routes/change-password.tsx
├── routes/users/{list,detail,PermissionEditor,ScopeEditor,approve}.tsx, routes/users/templates.tsx
├── routes/orders/{detail,AssigneesPanel}.tsx   # tabs from access; basic view
├── 001–004 screens                # render only the fields and figures present; forms omit hidden fields
└── e2e/{workers,permissions-ac6,example-workers}.spec.ts (+ i18n-rtl, no-external-requests)
```

**Structure Decision**: the same workspaces. A new `users/` server domain holds registration, accounts, templates and assignments. The policy layer gains `access.ts` and `scope.ts`, and every existing domain query takes the viewer's `Access`.

## Key design notes

- **Request flow**:
  1. The session check loads the user and refuses accounts that are not active or whose access has ended.
  2. `accessFor(user)` builds the `Access` object.
  3. `authorize(policy)`:
     - `owner` policies need the Owner;
     - module policies need `can()`;
     - order reads accept any order-bound module;
     - while the user must change their password, everything is refused except `/me`, password change and sign-out.
  4. The handler runs scoped queries.
  5. `present*` omits hidden keys and the figures `FIGURES` forbids.
- **Basic order view**: when `access.basicOrdersOnly`, `presentOrder` keeps `id, number, title, customer {id, name}, status, deletedAt`. The order page shows the header and the allowed tabs.
- **Updates with hidden fields**: the route parses the relaxed schema, and the service merges hidden values from the current record before the 002–004 validation (R11). Item lines are refused or kept when prices are hidden.
- **Web**: `/api/me` returns `access`. `lib/access.ts` answers `can(module, action)`, `hidden(group)` and `figure(name)`, using the same shared `FIGURES` table as the server. Screens render a figure only when it is present in the data. The access check is for layout only; the server is the guard.
- **Templates in the editor**: choosing a template fills the editor. Saving sends the full `AccessInput`, and the shared `permissionSetSchema` explains conflicts inline before the server is asked.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| Every 001–004 query takes the viewer's `Access` | Scope must be applied in SQL so that paging, totals and search never include out-of-scope rows (FR-024) | Filtering after loading breaks paging and leaks through totals and counts |
| A `FIGURES` table for derived values | D6 inheritance must be provable for about 20 derived figures across 6 groups and the channel and own-entries rules | Per-endpoint checks are scattered and cannot be tested as one rule |
| Sentinel route sweeps | SC-001 and SC-003 require proof that no response leaks a hidden value, across about 90 routes | Hand-written per-route assertions would miss new routes; the sweep covers every registered route automatically |
