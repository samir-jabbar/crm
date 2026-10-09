---
description: "Task list for 003 Expenses and Exchange-Rate Service"
---

# Tasks: Expenses and Exchange-Rate Service

**Input**: Design documents from `specs/003-expenses-exchange-rates/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: Included. The constitution requires money rules to be automated (brief §7), and test names reference the quickstart scenarios X1–X19.

**Builds on 001–002**: reuse these, don't re-create them:
- `route()` with policies `'owner'`, `'authenticated'` or `{ module, action }`: `apps/server/src/policy/route.ts`, `authorize.ts`;
- presenters and `SENSITIVE_FIELDS`: `apps/server/src/policy/present.ts`;
- `recordAudit` (`apps/server/src/audit/record.ts`);
- soft delete: `softDeleteColumns` / `notDeleted` / `softDelete` / `restore` (`apps/server/src/softDelete/index.ts`);
- `parseWith` / `readJsonBody` (`apps/server/src/lib/validate.ts`), `AppError` / `notFound` (`apps/server/src/lib/errors.ts`), `newId()` (`apps/server/src/lib/ids.ts`);
- money: `parseAmount` / `formatAmount` / `sumMinor` (`packages/shared/src/money.ts`), `hj_norm` in SQL and `likePattern` (`packages/shared/src/search.ts`);
- the test harness: `createTestContext`, `createOwner`, `createWorker`, `auditActions`, `seedCustomer`, `seedSupplier`, `seedOrder` (`apps/server/tests/helpers.ts`);
- web: `api()` (`apps/web/src/api/http.ts`), `queryKeys` (`apps/web/src/api/queries.ts`), `Field`, `MoneyInput`, `AmountText`, `AddressPicker`, `ConfirmDelete`, `StatusBadge`, the `ui/` components;
- e2e: `signIn`, `setLanguage`, `expectNoHorizontalScroll`, `apiCustomer`, `apiOrder`, `ORIGIN` (`apps/web/e2e/helpers.ts`).

**Library docs**: check Context7 before using any library API not yet used in this repo (CLAUDE.md). In this feature that means Hono `bodyLimit`, `c.req.parseBody()` and binary `c.body()`, plus any new Drizzle feature.

**No network in tests**: the server's HTTP client comes from `deps.http`. Integration tests pass a fake. The e2e server talks to a local fake provider (T050), never to the real providers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on unfinished tasks)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup

**Purpose**: confirm the 002 baseline is green on this branch before changing anything.

- [X] T001 Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e` from the repo root. Record the counts (expect 124 server + 7 web unit/integration tests and 44 e2e tests passing) in the PR notes. Fix nothing in 001/002 unless a check fails.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the shared vocabulary, rate arithmetic, schema and migrations, the injectable HTTP client, the rate cache, test helpers and web building blocks. Every story needs them.

**⚠️ CRITICAL**: no user-story work starts before this phase is complete.

### Shared package

- [X] T002 [P] Extend `packages/shared/src/enums.ts`:
  - add `'expenses'` to `POLICY_MODULES`;
  - `EXPENSE_STATUSES = ['paid','to_pay']`, `PAYMENT_METHODS = ['cash','bank','other']`, `RATE_SOURCES = ['manual','auto','auto_edited']`, `RATE_PROVIDERS = ['currency_api','exchangerate_api_open','manual']`, each with its type;
  - `FOREIGN_CURRENCIES = ['USD','MAD','EUR']` (every currency in `CURRENCY_CODES` except `BASE_CURRENCY`);
  - `DEFAULT_CATEGORY_KEYS`: the 13 keys in data-model.md order;
  - `RATE_PATTERN = /^\d{1,7}(\.\d{1,6})?$/`, `RATE_TYPO_THRESHOLD = 0.2`;
  - `RECEIPT_MIME_TYPES = ['image/jpeg','image/png','image/webp','image/heic','application/pdf']`, `MAX_RECEIPT_BYTES = 10_485_760`.
- [X] T003 [P] Add the 7 new codes to `ERROR_CODES` in `packages/shared/src/errors.ts`: `category_invalid`, `rate_invalid`, `rate_required`, `receipt_invalid`, `file_too_large`, `file_type_invalid`, `rates_unavailable`.
- [X] T004 [P] Extend `packages/shared/src/money.ts` (R2). No floats anywhere:
  - `parseRate(s): number`: micro-units (`"7.1"` → `7_100_000`). It throws on a string that doesn't match `RATE_PATTERN` or equals 0.
  - `formatRate(micro): string`: always 6 decimals (`"7.100000"`).
  - `convertToCnyMinor(amountMinor, rateMicro): bigint`: `(amount × rate + 500_000n) / 1_000_000n`, so half a cent rounds up.
  - `percent1(numerator, denominator): string | null`: one decimal, half away from zero, computed with BigInt (`"10.8"`, `"-5.0"`). Returns null when the denominator is 0.
  - `rateDeviates(typedMicro, referenceMicro): boolean`: true when the difference is above `RATE_TYPO_THRESHOLD`.
  - `formatAmount` also accepts a `bigint`.
  Export everything from `packages/shared/src/index.ts`.
- [X] T005 [P] Unit tests in `apps/server/tests/unit/rates-money.test.ts`:
  - `parseRate`: `"7.1"` → 7,100,000 and `"0.000001"` → 1. It rejects `"0"`, `"1.1234567"`, `"12345678"`, `"-1"`, `"7,1"` and `"1e3"`.
  - `formatRate` round-trips.
  - `convertToCnyMinor`:
    - 120,000 minor (1,200.00) × 7,100,000 → 852,000n (8,520.00, X2);
    - 1 × 500,000 → 1n (half up) and 1 × 499,999 → 0n;
    - 125,000 × 7,100,000 → 887,500n (8,875.00);
    - the maximum amount × the maximum rate stays exact as a bigint.
  - `percent1`: 145,500 / 1,349,000 → `"10.8"` (X5), 1,203,500 / 1,200,000 → `"100.3"` (X7), a negative profit → a negative string, a zero denominator → null.
  - `rateDeviates`: 71.0 against 7.10 → true (X11), 7.30 against 7.10 → false.
- [X] T006 Create the zod schemas and response types, following contracts/api.md and the data-model.md validation table. Every issue message must be an error code.
  - In `packages/shared/src/api/common.ts`: `rateSchema` (string matching `RATE_PATTERN`, above 0, error `rate_invalid`).
  - In `packages/shared/src/api/expenses.ts`:
    - `expenseInputSchema`, a strict object, used for POST and PUT. Its `superRefine`:
      - a rate is required unless the currency is CNY (`rate_required` on `rate`);
      - `paidToSupplierId` and `paidToName` cannot both be set (`invalid_value` on `paidToName`).
    - `expenseStatusPatchSchema` (`status?` and/or `reimbursed?`, at least one);
    - `orderExpensesQuerySchema` (`deleted`), `advancedByQuerySchema` (`q`), `toReimburseQuerySchema` (`person`);
    - `createCategorySchema` (name 1–60), `patchCategorySchema` (`name?`, `hidden?`);
    - the types `Expense`, `ExpensePaidTo`, `ExpenseTotals`, `OrderExpenses`, `ExpenseCategory`, `ReceiptUpload`, `Reimbursement`, `ToReimburse`.
  - In `packages/shared/src/api/rates.ts`:
    - `rateQuerySchema` (`currency` in `FOREIGN_CURRENCIES`, else `currency_invalid`; optional `date`);
    - `rateSettingsPatchSchema` (`provider?`, `apiKey?: string | null`, `autoFill?`);
    - the types `RateQuote`, `RateConfig`, `RateSettings`, `RefreshResult`.
  Export them from `index.ts`. The order schema changes (`agreedRate`, `financials`) belong to US2 (T037).

### Server schema and infrastructure

- [X] T007 Define the Drizzle schemas in `apps/server/src/db/schema/`, exactly per data-model.md, with CHECK constraints (raw SQL column names, as in 001/002) and indexes:
  - `expenses.ts` (with `...softDeleteColumns()` and the audit columns);
  - `expenseCategories.ts` (`key` unique and nullable);
  - `files.ts`;
  - `exchangeRates.ts` (composite PK);
  - `rateSettings.ts` (CHECK `id = 1`).
  Add `agreedRateMicro` (integer, nullable) to `apps/server/src/db/schema/orders.ts`. Export everything from `schema/index.ts`.
- [X] T008 Generate the migrations:
  1. Run `npm run db:generate -w @hanjing/server -- --name expenses_exchange_rates` and review the SQL in `apps/server/drizzle/`. If drizzle-kit recreates `orders` to add the column, check that the 002 rows, the indexes and the 001/002 triggers are preserved.
  2. Run `npm run db:generate -w @hanjing/server -- --custom --name expense_seeds` and write the reference data, as 0001 does:
     - the 13 categories with ids `cat-<key>`, `name` null, `position` 0–12, `hidden` 0, timestamps 0;
     - the `rate_settings` row `id = 1`: `provider 'currency_api'`, `auto_fill 1`.
  `createTestContext` runs every migration, so the existing suite must still pass on top.
- [X] T009 Add the injectable HTTP client and the rate config:
  - `http: typeof fetch` in `Deps` (`apps/server/src/deps.ts`);
  - `apps/server/src/index.ts` passes `globalThis.fetch`;
  - in `apps/server/src/config.ts`, three env-backed settings:
    - `RATE_FETCH_TIMEOUT_MS` (default 5000);
    - `RATES_CURRENCY_API_URLS`: comma-separated URL templates with `{date}`. The default is `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/v1/currencies/cny.json,https://{date}.currency-api.pages.dev/v1/currencies/cny.json`;
    - `RATES_EXCHANGERATE_API_URL` (default `https://open.er-api.com/v6/latest/CNY`).
  The URL overrides exist for the e2e fake provider and self-hosted mirrors. Document them in T077.
- [X] T010 Create the rate cache in `apps/server/src/rates/cache.ts`. US1 snapshots and US3 lookups both use it.
  - `readRate(db, provider, date, currency)`;
  - `latestCached(db, provider, currency)`: the newest `rate_date`, with its `fetched_at`;
  - `writeRates(tx, provider, rateDate, rates, fetchedAt)`: upsert one row per currency;
  - `snapshotFor(db, provider, date)`: returns `{ usdMicro, madMicro }` from the cached rates of `date`, or of the nearest earlier cached date. Missing values are null. It **never** calls a provider (R4).
- [X] T011 Extend `SENSITIVE_FIELDS` and the `Resource` type in `apps/server/src/policy/present.ts` (FR-023, D6: derived values inherit the hiding of their inputs):
  - `expense: ['amount','rate','cnyAmount']`;
  - `expenseTotals: ['grand','unpaid','byCategory','byAdvancedBy']`;
  - `reimbursement: ['toReimburse']`;
  - `order`: add `'agreedRate','financials'` to the existing list.
  Presenters are added per story.
- [X] T012 [P] Extend `apps/server/tests/helpers.ts`:
  - `createTestContext(env, { http })` passes `http` into `createApp`. The default fake throws `network disabled in tests`.
  - Each context gets its own temporary `DATA_DIR` (`mkdtempSync(join(tmpdir(), 'hj-test-'))`), so receipt files never collide.
  - `TestClient` gains `put(path, body)` and `upload(path, { bytes, filename, type })`. `upload` sends `FormData` with field `file` and the same Origin and cookie handling.
  - `fakeRates(options)` returns `{ http, calls }`. The fake fetch serves:
    - Currency API JSON (`{ date, cny: { usd, mad, eur } }`) for any URL from the default templates (`@latest` / `@YYYY-MM-DD`, or the pages.dev host);
    - open.er-api JSON (`{ result: 'success', time_last_update_unix, rates: { USD, MAD, EUR } }`).
    `options` sets the rates per date, `mode: 'ok' | 'down' | 'hang' | 'primaryDown'` (`hang` resolves only when the request's `signal` aborts) and `status` (e.g. 429). `calls` lists the requested URLs.
  - `seedExpense(client, orderId, overrides)`: default `"Trucking Linyi to Qingdao port"`, category `cat-inland_transport_china`, 3500 CNY, today. It posts through the API and returns the body.
  - `TINY_JPEG`, `TINY_PNG` and `TINY_PDF`: minimal valid files as `Uint8Array` constants.

### Web building blocks

- [X] T013 [P] Create the query hooks in `apps/web/src/api/expenses.ts` and `apps/web/src/api/rates.ts`:
  - expenses: order expenses (with `deleted`), get, create, update, status patch, delete, restore, categories (with `includeHidden`), create and patch category, advanced-by suggestions, reimbursements, to-reimburse;
  - rates: rate quote (`currency`, `date`), rate config, rate settings get and patch, refresh.
  - Add an `uploadFile(path, file, onProgress)` helper in `apps/web/src/api/http.ts`, using `XMLHttpRequest` for upload progress. It maps error bodies like `api()`.
  - Extend `queryKeys` in `apps/web/src/api/queries.ts`.
  - **Every expense mutation** invalidates the order's expenses, the order detail (financials, SC-006), reimbursements and to-reimburse.
- [X] T014 [P] Create the web helpers:
  - `apps/web/src/lib/categories.ts`: `categoryLabel(category, t)` returns `name ?? t('expenseCategory.' + key)`;
  - `apps/web/src/components/RateField.tsx`, a plain typed field for now: the label "1 USD = [ ] CNY", `inputMode="decimal"`, `dir="ltr"`, accepts `,` or `.`, validates with `RATE_PATTERN`, and takes a `currency` and an optional `hint` slot. US3 (T051) adds fetching.
- [X] T015 Add the base translations and route skeletons:
  - in all three `apps/web/src/locales/{en,fr,ar}/common.json`:
    - `expenseCategory.<key>` (13, using the spec names), `expenseStatus.*`, `paymentMethod.*`, `rateSource.*`;
    - `errors.<code>` for the 7 new codes;
  - in `apps/web/src/router.tsx`, routes with placeholder pages for `/orders/:id/expenses/new`, `/expenses/:id`, `/expenses/:id/edit` and `/reimbursements`.
  Use real French and Arabic. The i18n parity test must keep passing.

**Checkpoint**: the migrations apply over a 002 database with 13 categories and the settings row, the rate-money unit tests pass, the whole 002 suite is still green, and the new routes open placeholder pages.

---

## Phase 3: User Story 1 — Record expenses on an order from the phone (Priority: P1) 🎯 MVP

**Goal**: add an expense with name, category, amount and currency, a typed rate, date, paid to, payment method, advanced by, status, receipt photo and notes. It appears in the order's Expenses tab with exact CNY totals.

**Independent Test**: on a phone, add 10 expenses in mixed currencies to one order. Each is listed by name, and the category totals and grand total equal the sum of the line CNY amounts (X1–X4).

### Tests for User Story 1

- [X] T016 [P] [US1] Unit tests for type sniffing in `apps/server/tests/unit/sniff.test.ts`:
  - accepted: JPEG (`FF D8 FF`), PNG signature, WebP (`RIFF….WEBP`), HEIC/HEIF (`ftyp` with brand `heic`, `heix`, `mif1`, `msf1` or `hevc`), PDF (`%PDF-`);
  - rejected (null): GIF, SVG/XML text, HTML, ZIP, `MZ` executables, an empty buffer;
  - the type comes from the bytes only: a JPEG named `x.pdf` is `image/jpeg`.
- [X] T017 [P] [US1] Integration tests in `apps/server/tests/integration/expenses.create.test.ts`:
  - **CNY**: 3,500 CNY → `rate "1.000000"`, `rateSource "manual"`, `cnyAmount "3500.00"`. A rate sent with CNY is forced to 1.
  - **X2**: 1,200 USD at `"7.1"` → `cnyAmount "8520.00"`, `rate "7.100000"`.
  - **X1**: 10 expenses in CNY, USD, MAD and EUR, some `to_pay`:
    - `totals.grand`, `unpaid` and each `byCategory` total equal the BigInt sums of the returned `cnyAmount` values;
    - the list is ordered by date descending, then newest first.
  - **X4**: field codes for a missing name, category, amount and date, `rate_required` for USD without a rate, `rate_invalid` for `"7.1234567"`, `amount_invalid` for `"0"`, `category_invalid` for an unknown or hidden category, `supplier_invalid` for a deleted supplier, and an error when both paid-to fields are set.
  - An amount × rate above `MAX_AMOUNT_MINOR` gives `amount_invalid`.
  - **Snapshots (R4)**: rows inserted into `exchange_rates` for 2026-10-05 → an expense dated 2026-10-07 stores those USD and MAD micro-rates. An empty cache → nulls. `fakeRates().calls` stays empty: a save never calls a provider.
  - A deleted or unknown order gives `404`.
  - `GET /api/expenses/:id` shows `createdBy` and `updatedBy` usernames.
  - The audit has `record.created` with target `expense`.
  - **X17**: deleting a supplier used only as "paid to" on a non-deleted expense gives `409 in_use { count: 1 }`. After the expense is deleted, the supplier can be deleted.
- [X] T018 [P] [US1] Integration tests in `apps/server/tests/integration/receipts.test.ts` (X3, FR-006):
  - **Upload**: `TINY_JPEG` → `201 { id, mime: 'image/jpeg', size }`, and the file exists at `<dataDir>/receipts/<id>`.
  - **Attach**: an expense with `receiptId` → `hasReceipt: true`. `GET /api/expenses/:id/receipt` returns the same bytes with:
    - `Content-Type: image/jpeg`;
    - `Content-Disposition: inline`;
    - `Cache-Control: private, no-store`;
    - `X-Content-Type-Options: nosniff`;
    - a `Content-Security-Policy` of exactly `sandbox` (the global header must not overwrite it).
  - **Refused uploads**: over 10 MB → `413 file_too_large`; a text file named `.jpg` → `400 file_type_invalid`; a missing `file` field → `400`.
  - **Wrong receipt**: a `receiptId` already attached to another expense, or created by another user (insert the `files` row directly with a worker's id), gives `receipt_invalid`.
  - **No receipt**: `GET …/receipt` gives `404`. Signed out gives `401`.
  - **Orphans**: upload, advance `clock` by 25 h, upload again → the first file and its row are removed. An attached file, even on a soft-deleted expense, is kept.
- [X] T019 [P] [US1] Playwright e2e test in `apps/web/e2e/expenses.spec.ts` (X1–X4, SC-001), on the mobile project. Seed a **CNY** order with `apiOrder`, so the test doesn't depend on US2. Then:
  1. Open the order, go to the Expenses tab and tap "Add expense".
  2. Enter "Trucking Linyi to Qingdao port", category "Inland transport in China" and 3500. Save in under 30 s. The row, the category total `¥3,500.00` and the grand total show.
  3. Add 1,200 USD with the rate typed as `7.1`. "8,520.00 CNY" shows live before saving.
  4. Attach a receipt with `setInputFiles` (a tiny JPEG buffer). Open the expense: the image loads (`naturalWidth > 0`).
  5. Open a new expense and save it empty. The field errors show. Type a name, attach a photo and save with the category still missing: the name and the photo are kept.

### Implementation for User Story 1

- [X] T020 [P] [US1] Implement `apps/server/src/files/sniff.ts`: `sniffMime(bytes: Uint8Array): ReceiptMime | null`, reading magic bytes only (R7).
- [X] T021 [US1] Implement `apps/server/src/files/store.ts`:
  - `saveReceipt(deps, bytes, actor)` sniffs the type, writes `<dataDir>/receipts/<id>` (creating the directory), computes the sha256, inserts the `files` row and returns it;
  - `readReceipt(deps, fileId)` returns the bytes and the mime;
  - `removeOrphans(deps)` deletes files older than 24 h that no expense row references (soft-deleted expenses count as references), both the row and the file on disk, and logs the count.
- [X] T022 [US1] Implement `listCategories(db, { includeHidden })` (ordered by `position`) and `getCategory(db, id)` in `apps/server/src/expenses/categories.ts`.
- [X] T023 [US1] Implement `createExpense(deps, orderId, input, actor, ctx)` and `getExpenseView(db, id, { deleted })` in `apps/server/src/expenses/service.ts`. `createExpense` runs in one transaction:
  1. The order exists and is not deleted (else `404`).
  2. The category exists and is not hidden (`category_invalid`).
  3. The paid-to supplier exists and is not deleted (`supplier_invalid`).
  4. The `receiptId` is a `files` row created by the actor and not attached elsewhere (`receipt_invalid`).
  5. Compute the CNY amount: a forced rate of 1,000,000 for CNY, `convertToCnyMinor` otherwise, and `amount_invalid` if it is above `MAX_AMOUNT_MINOR`.
  6. Read the snapshots with `snapshotFor` for the current provider (`currency_api` when the provider is `manual`).
  7. Insert. Store `reimbursed = false` when `advancedBy` is empty.
  8. Audit `record.created` (target `expense`) with name, category, amount, currency, rate and CNY amount.
  `getExpenseView` joins the category, the supplier and the creator/updater usernames.
- [X] T024 [US1] Implement `listOrderExpenses(db, orderId, { deleted })` in `apps/server/src/expenses/query.ts`:
  - items ordered by `expense_date DESC, id DESC`;
  - `totals`: `grand`, `unpaid` (`to_pay`) and `byCategory` (in category position order), using SQL `sum(cny_minor)` over non-deleted expenses;
  - `byAdvancedBy` returns `[]` until US5.
- [X] T025 [US1] Add the presenters to `apps/server/src/policy/present.ts`: `presentExpense` (decimal strings via `formatAmount` / `formatRate`; `paidTo` as `{ supplier }`, `{ name }` or null), `presentExpenseTotals`, `presentCategory` and `presentReceiptUpload`. Each goes through `applyFieldRules` with its resource.
- [X] T026 [US1] Add the routes and register them in `apps/server/src/routes/index.ts`:
  - `apps/server/src/routes/expenses.ts`:
    - `GET /api/orders/:id/expenses` (expenses:view; `deleted=true` also needs expenses:delete);
    - `POST /api/orders/:id/expenses` (expenses:create);
    - `GET /api/expenses/:id` (expenses:view);
    - `GET /api/expenses/:id/receipt` (expenses:view), with the R7 headers set so that the global `secureHeaders` CSP doesn't replace `sandbox`.
  - `apps/server/src/routes/receipts.ts`: `POST /api/receipts` (expenses:create).
    - Use Hono `bodyLimit` with `maxSize` = 10 MB + 64 KB of multipart overhead, and `onError` → `413 file_too_large`.
    - Read `c.req.parseBody()` and re-check `file.size ≤ MAX_RECEIPT_BYTES`.
    - Call `saveReceipt`, then `removeOrphans`.
  - `apps/server/src/routes/expenseCategories.ts`: `GET /api/expense-categories` (expenses:view).
  Run `removeOrphans` once at server start in `apps/server/src/index.ts`.
- [X] T027 [US1] Extend `deleteSupplier` in `apps/server/src/suppliers/service.ts` (FR-025). The in-use count is `orderCount` plus the non-deleted expenses with `paid_to_supplier_id` = the supplier. Use a raw `"suppliers"."id"` reference in the subquery, as 002 does. `orderCount` in the presenter stays orders only.
- [X] T028 [P] [US1] Create `apps/web/src/lib/imageResize.ts`: `reduceImage(file): Promise<File>`.
  - `createImageBitmap` → canvas, at most 1600 px on the long side → `toBlob('image/jpeg', 0.82)`.
  - PDFs, and images that fail to decode (e.g. HEIC outside Safari), are returned unchanged.
  - A file still over 10 MB is rejected client-side with `file_too_large`.
- [X] T029 [P] [US1] Create `apps/web/src/components/ReceiptInput.tsx`:
  - `<input type="file" accept="image/*,application/pdf" capture="environment">` behind two 44px buttons, "Take photo" and "Choose file";
  - it reduces the image, then uploads at once with `uploadFile('/api/receipts')`, showing progress, a retry button on failure and a thumbnail (or a PDF chip);
  - "Remove" clears it;
  - it reports `receiptId` to the form. The id lives in the form state, so a failed save keeps the photo.
- [X] T030 [P] [US1] Create `apps/web/src/components/PaidToPicker.tsx`: a choice between "Supplier" (reuse `AddressPicker` for suppliers, including inline create) and "Name" (free text, max 120). The value is `{ paidToSupplierId } | { paidToName } | null`.
- [X] T031 [US1] Create the expense form `apps/web/src/routes/expenses/form.tsx` (create mode; US4 adds edit), full screen on phones with a sticky Save button. Fields:
  - name, category (non-hidden, via `categoryLabel`), amount (`MoneyInput`) and currency (default CNY);
  - `RateField` when the currency is not CNY;
  - a **live CNY amount** computed with `convertToCnyMinor`;
  - date (default today), `PaidToPicker`, payment method (default cash), advanced by (plain text input; US5 adds suggestions);
  - status (paid / to pay) and a due date shown when "to pay";
  - `ReceiptInput`, notes.
  Validate with `expenseInputSchema`, map server errors to fields and never clear inputs. On success, go back to `/orders/:id?tab=expenses`.
- [X] T032 [US1] Create `apps/web/src/routes/orders/ExpensesTab.tsx` and use it for the `expenses` tab in `apps/web/src/routes/orders/detail.tsx` (replacing `ComingSoon`):
  - an "Add expense" button;
  - rows with name, category, date, the original amount (`AmountText`), the CNY amount, a paid/to-pay badge and a receipt icon. Each row links to `/expenses/:id`;
  - totals by category, unpaid, and grand, all in CNY;
  - an empty state.
- [X] T033 [US1] Create the expense detail page `apps/web/src/routes/expenses/detail.tsx`:
  - all the fields, the rate with its source label, and "Created by X on …" / "Last changed by Y on …";
  - the receipt: an `<img>` for images, an "Open PDF" link for PDFs (`/api/expenses/:id/receipt`);
  - a link back to the order.
  Check in Chromium that a PDF receipt opens. If the `sandbox` CSP blocks the built-in viewer, serve PDFs as `attachment` and note the change in research.md R7.
- [X] T034 [US1] Add every US1 string (form labels and hints, the live CNY line, receipt states, tab columns and totals, detail labels) to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: X1–X4 and X17 pass. The Owner can record expenses with receipts on a phone, and the totals are exact.

---

## Phase 4: User Story 2 — See the order's costs and profit in CNY (Priority: P2)

**Goal**: an agreed rate on non-CNY orders, and the order summary with agreed price in CNY, expenses, profit, margin, unpaid and budget used, live after every expense change.

**Independent Test**: a 190,000 USD order at 7.10 with 1,203,500 CNY of expenses shows a profit of 145,500.00 CNY and a margin of 10.8%. Changing the agreed rate changes the profit (X5–X7).

### Tests for User Story 2

- [X] T035 [P] [US2] Integration tests in `apps/server/tests/integration/financials.test.ts`:
  - **X5**: 190,000 USD at `"7.1"` → `agreedRate "7.100000"`, `agreedPriceCny "1349000.00"`. With 1,203,500 CNY of expenses → `profit "145500.00"`, `marginPercent "10.8"`.
  - **X7**: budget 1,200,000 → `budgetUsedPercent "100.3"`. A 40,000 `to_pay` expense → `unpaid "40000.00"`, and it still counts in `expensesTotal` and profit.
  - **CNY order**: `agreedRate` null, `agreedPriceCny` = the agreed price. An `agreedRate` sent with it is ignored.
  - **X6**: a legacy order (set `agreed_rate_micro = NULL` via `sqlite`) → `profit` and `marginPercent` null, `profitUnavailableReason "agreed_rate_missing"`, and `expensesTotal` still filled. A `PUT` without `agreedRate` gives `rate_required`.
  - **Validation**: `POST` of a USD order without `agreedRate` → `400 rate_required` on `agreedRate`; `"0"` → `rate_invalid`.
  - **Edge cases**: a zero agreed price → `marginPercent` null; a loss → a negative profit and margin; no budget → `budgetUsedPercent` null.
  - Deleted expenses are excluded.
  - Changing `agreedRate` with `PUT` changes the profit and audits `agreedRate` before/after.
  - Duplicate copies `agreedRate`.
- [X] T036 [P] [US2] Playwright e2e test in `apps/web/e2e/expenses.spec.ts` (append), on the mobile project:
  1. Create a USD order through the order form. Saving without the agreed rate highlights the rate field. Type 7.1 and save.
  2. The summary shows the agreed price in CNY and the profit.
  3. Add a CNY expense from the Expenses tab, return to the order: the profit dropped by that amount, with no page reload (SC-006).

### Implementation for User Story 2

- [X] T037 [US2] Extend `packages/shared/src/api/orders.ts` (R5):
  - add `agreedRate: rateSchema.optional()` to `orderInputSchema`, with `rate_required` on `agreedRate` when `currency !== 'CNY'`;
  - add `agreedRate: string | null` and `financials: OrderFinancials` to the `Order` type (contracts/api.md).
- [X] T038 [US2] Update `apps/server/src/orders/service.ts`:
  - create and update store `agreed_rate_micro` (`parseRate`; null for CNY);
  - the audit snapshots include `agreedRate` as a 6-decimal string;
  - `duplicateOrder` copies it.
- [X] T039 [US2] Create `apps/server/src/orders/financials.ts`: `orderFinancials(db, order)` (R6), all in BigInt.
  - One SQL query gives `sum(cny_minor)` and the `to_pay` sum over the order's non-deleted expenses.
  - It derives `agreedPriceCny`, `profit`, `marginPercent` and `budgetUsedPercent` with `percent1`, and `profitUnavailableReason`.
  Call it from `loadOrderView`, and add `agreedRate` and `financials` in `presentOrder` (`apps/server/src/policy/present.ts`).
- [X] T040 [US2] Update the 002 tests and e2e to the new order contract:
  - `seedOrder` in `apps/server/tests/helpers.ts` defaults to `agreedRate: '7.1'`;
  - add `agreedRate` to every non-CNY order posted directly in `apps/server/tests/integration/{orders.create,orders.update,orders.search,orders.duplicate-notes,deleteRestore}.test.ts` (and any other test found by searching for `currency: 'USD'|'EUR'|'MAD'`);
  - fix the exact-body assertions that now include `agreedRate` and `financials`;
  - add `agreedRate` to the non-CNY `apiOrder` calls in `apps/web/e2e/{orders,orders-list,customers-suppliers,i18n-rtl}.spec.ts`;
  - in the V1 form flow in `apps/web/e2e/orders.spec.ts`, type the agreed rate.
  The whole 002 suite must pass again.
- [X] T041 [P] [US2] Create `apps/web/src/components/FinancialSummary.tsx` and use it in the summary area of `apps/web/src/routes/orders/detail.tsx`:
  - agreed price in CNY (with "at 7.100000"), expenses, profit (red when negative), margin, unpaid, and budget used (highlighted above 100%);
  - when `profitUnavailableReason` is set, "Set the agreed rate to see profit", linking to `/orders/:id/edit`.
  Keep the 002 item total and difference.
- [X] T042 [US2] Add the agreed-rate field to `apps/web/src/routes/orders/OrderForm.tsx`: a `RateField` labelled "Agreed rate", shown when the currency is not CNY, with a live "= X CNY" for the agreed price. It is prefilled on edit and mapped to `agreedRate` errors.
- [X] T043 [US2] Add every US2 string (summary labels, the unavailable-profit message, over-budget, agreed rate) to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: X5–X7 pass and the 002 suite is green again.

---

## Phase 5: User Story 3 — Get exchange rates in one tap, or type them (Priority: P3)

**Goal**: "Fetch rate" on the expense and order forms, auto-fill, a daily cache, a manual fallback, and the exchange-rate section in Settings.

**Independent Test**: fetch a USD rate (labelled with its date), take the provider down (a clear message, and the save still works with a typed rate), and confirm one provider call per day (X8–X12, X16).

### Tests for User Story 3

- [X] T044 [P] [US3] Unit tests for the adapters in `apps/server/tests/unit/providers.test.ts`, with a fake `http`:
  - **Currency API URLs**: latest → `…currency-api@latest/v1/currencies/cny.json`; dated → `@2026-09-01`. When the first host fails, it falls back to `https://2026-09-01.currency-api.pages.dev/…`.
  - **Parsing**: `{ date, cny: { usd: 0.140845 } }` inverts to `rateMicro = round(1e6 / 0.140845)`, with the `rateDate` from `date`.
  - **open.er-api**: parses `rates.USD/MAD/EUR` with the `rateDate` (UTC) from `time_last_update_unix`, and has no dated lookup.
  - **Failures** (rejected as `rates_unavailable`): `result: 'error'`, HTTP 429/500, a missing or non-positive currency, non-JSON.
  - **Timeout**: the abort signal from `AbortSignal.timeout` is passed to `http`.
- [X] T045 [P] [US3] Integration tests in `apps/server/tests/integration/rates.test.ts`, with `fakeRates`:
  - **X8**: `GET /api/rates?currency=USD` twice on the same day → one call, then `POST /api/rates/refresh` → a second call. The next day (`clock`), a new call.
  - **X9**: `date=2026-09-01` → that date's rate with `exact: true`. Asking again makes no call. With `exchangerate_api_open`, the result is the latest rate with `exact: false` and its own `rateDate`.
  - **X10**: `mode: 'down'` → `503 rates_unavailable`. `mode: 'hang'` with `RATE_FETCH_TIMEOUT_MS=100` → `503` in under 1 s. The settings show `lastError` and `lastErrorAt`. An expense with a typed rate still saves.
  - **Manual provider**: `503 rates_unavailable` with no call.
  - `currency=CNY` → `400 currency_invalid`.
  - **Who can call**: a worker gets `200` on `GET /api/rates` and `GET /api/rates/config`; signed out → `401`.
  - **X12**: an expense saved at 7.10. A refresh then caches 7.25. The expense still shows `"7.100000"` and the same `cnyAmount`.
  - **Settings and X16**: `GET /api/settings/exchange-rates` has the contract shape (`attribution` only for `exchangerate_api_open`). A `PATCH` of provider and key gives `apiKeySet: true` and `apiKeyLast4`, and is audited as `settings.updated` with the provider before/after. The raw `audit_entries` table contains no occurrence of the key string.
- [X] T046 [P] [US3] Playwright e2e test in `apps/web/e2e/rates-settings.spec.ts`, against the fake provider (T050):
  - **Fetch**: on a new USD expense, auto-fill fills the rate, labelled "Automatic · <date> · Currency API". Editing it shows "Automatic, then edited".
  - **X11**: typing 71.0 shows the typo warning, and saving is still allowed.
  - **X10**: switch the fake to down (control endpoint). "Fetch rate" shows the unavailable message within 5 s, and the expense saves with a typed rate.
  - **Settings**: change the provider to ExchangeRate-API (the attribution appears), press "Refresh rates" (the last-fetch time updates), turn auto-fill off (a new USD expense keeps the rate empty).

### Implementation for User Story 3

- [X] T047 [US3] Implement `apps/server/src/rates/providers.ts`. The `RateProvider` interface has `id`, `fetchLatest(http, config, signal)`, an optional `fetchDate(http, config, date, signal)`, and `attribution`. Two adapters:
  - `currencyApi`: tries the URL templates in order, parses `cny.{usd,mad,eur}` and inverts once (R2);
  - `exchangeRateApiOpen`: parses `rates.{USD,MAD,EUR}`, with attribution `{ text: 'Rates By Exchange Rate API', url: 'https://www.exchangerate-api.com' }`.
  Both return `{ rateDate, rates: { USD, MAD, EUR } }` in micro-units, or throw `rates_unavailable`.
- [X] T048 [US3] Implement `apps/server/src/rates/service.ts` (R3):
  - **`getRate(deps, currency, date?)`**: for the latest, reuse the cache when `fetched_at` is today (UTC). For a date, reuse its cached row, else `fetchDate`, else the latest with `exact: false`. Any fetch writes all three currencies with `writeRates`.
  - **`refreshLatest(deps)`**.
  - **Status**: record `last_fetch_at`, or `last_error` / `last_error_at`, in `rate_settings`.
  - **`getRateSettings` / `updateRateSettings(deps, patch, actor, ctx)`**: the audit `settings.updated` shows provider and auto-fill before/after, and `apiKey` only as `{ changed: true }`.
  - **`getRateConfig`**: provider, auto-fill and attribution.
  - `manual` → `rates_unavailable` without a call. Every call uses `AbortSignal.timeout(config.rateFetchTimeoutMs)`.
- [X] T049 [US3] Add `apps/server/src/routes/rates.ts` and register it:
  - `GET /api/rates` (authenticated);
  - `GET /api/rates/config` (authenticated);
  - `POST /api/rates/refresh` (owner);
  - `GET` / `PATCH /api/settings/exchange-rates` (owner).
  Add `presentRateSettings` (key masked to `apiKeyLast4`, never the full key) and `presentRateQuote` to `apps/server/src/policy/present.ts`.
- [X] T050 [US3] Create the e2e fake provider `apps/web/e2e/fake-rates.mjs`, a `node:http` server on port 3199:
  - it serves `/currency-api/{date}/cny.json` and `/er-api/latest/CNY` with fixed rates (USD 7.10, MAD 0.71, EUR 7.80);
  - `POST /__mode` with `{ mode: 'ok' | 'down' }` switches it.
  Start it from `apps/web/e2e/start-server.mjs` before the API server. Pass `RATES_CURRENCY_API_URLS=http://localhost:3199/currency-api/{date}/cny.json` and `RATES_EXCHANGERATE_API_URL=http://localhost:3199/er-api/latest/CNY`, and stop it on exit.
- [X] T051 [US3] Complete `apps/web/src/components/RateField.tsx`:
  - a "Fetch rate" button calling `GET /api/rates` with the form's date;
  - a source label: "Automatic · date · provider", "Automatic, then edited", or "Manual". A non-exact result says "latest rate, <date>";
  - the attribution line from `GET /api/rates/config` when present;
  - the unavailable message on `503`, with the field still typeable;
  - the typo warning with `rateDeviates` against the latest fetched rate.
  It reports `rateSource` (`auto` → `auto_edited` on typing). Auto-fill: in the expense form (`apps/web/src/routes/expenses/form.tsx`), choosing a non-CNY currency fills an **empty** rate when `autoFill` is on, and never overwrites a typed one (FR-017). Use the same "Fetch rate" in `OrderForm.tsx` for the agreed rate.
- [X] T052 [US3] Add an "Exchange rates" section to `apps/web/src/routes/settings.tsx`:
  - a provider select with descriptions;
  - an access key field (write-only, showing "•••• last4" when set, plus "Remove key");
  - an auto-fill switch;
  - "Refresh rates" with the fetched rates shown;
  - the last successful fetch time and the last error;
  - the attribution when relevant.
- [X] T053 [US3] Add every US3 string (provider names and descriptions, source labels, the unavailable and typo messages, the settings section) to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: X8–X12 and X16 pass, and no test touches the real network.

---

## Phase 6: User Story 4 — Keep costs accurate: paid or to pay, edits and deletions (Priority: P4)

**Goal**: edit every field, switch paid/to pay, and delete and restore expenses, all audited.

**Independent Test**: edit an amount, mark a to-pay expense paid, delete and restore. Totals and profit follow each step, and the audit lists them (X13).

### Tests for User Story 4

- [X] T054 [P] [US4] Integration tests in `apps/server/tests/integration/expenses.update.test.ts` (X13):
  - **Edit**: `PUT` 1,200 → 1,250 USD at 7.1 → `cnyAmount "8875.00"`, and the order's `financials` follow. `record.updated` lists only the changed fields (amount, cnyAmount) with before/after.
  - **Snapshots**: a date change refreshes them from the cache; an unchanged date keeps them even if the cache changed.
  - **Status**: `PATCH /status { status: 'paid' }` drops it from `unpaid` and is audited.
  - **Delete**: `DELETE` gives `204`. The expense leaves the list, the totals and `financials`. `GET` gives `404`, and `?deleted=true` lists it. `POST /restore` brings it back unchanged. `record.deleted` and `record.restored` are written.
  - **Receipt**: `receiptId: null` on `PUT` unlinks the receipt. 25 h later the file is removed as an orphan.
  - **Categories**: keeping a now-hidden category on edit is allowed; switching to a hidden one gives `category_invalid`.
  - **Deleted order**: editing an expense of a deleted order gives `404`. Its expenses leave the totals, and restoring the order brings them back.
- [X] T055 [P] [US4] Playwright e2e test in `apps/web/e2e/expenses.spec.ts` (append):
  1. Edit an expense's amount: the totals update.
  2. Mark a to-pay expense paid from its page: the unpaid total drops.
  3. Delete one with confirmation: it is gone.
  4. Turn on "Show deleted expenses" and restore it: it is back.

### Implementation for User Story 4

- [X] T056 [US4] Implement `updateExpense` (a full replace with the same checks as create; recompute the CNY amount; refresh snapshots only when the date changes; audit the changed fields), `setExpenseStatus`, `deleteExpense` (via `softDelete`) and `restoreExpense` (`404` if the order is deleted) in `apps/server/src/expenses/service.ts`.
- [X] T057 [US4] Add these routes to `apps/server/src/routes/expenses.ts`:
  - `PUT /api/expenses/:id` (expenses:edit);
  - `PATCH /api/expenses/:id/status` (expenses:edit, `status` for now);
  - `DELETE /api/expenses/:id` (expenses:delete);
  - `POST /api/expenses/:id/restore` (expenses:delete).
- [X] T058 [US4] Add the edit mode to `apps/web/src/routes/expenses/form.tsx` (`/expenses/:id/edit`, prefilled, sends `PUT`; the current hidden category stays selectable). Add actions on `apps/web/src/routes/expenses/detail.tsx`:
  - "Mark paid" / "Mark to pay";
  - "Edit";
  - "Delete" with `ConfirmDelete`, which returns to the order's Expenses tab.
- [X] T059 [US4] Add a "Show deleted expenses" toggle to `apps/web/src/routes/orders/ExpensesTab.tsx`. Deleted rows show "Restore".
- [X] T060 [US4] Add every US4 string to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: X13 passes.

---

## Phase 7: User Story 5 — See what to reimburse to whom (Priority: P5)

**Goal**: "advanced by" suggestions, a reimbursed flag, per-person totals on the order, the dashboard "To reimburse" block, and a per-person list.

**Independent Test**: three expenses advanced by two people across two orders. The dashboard totals are right, and marking one reimbursed lowers the amount owed (X14).

### Tests for User Story 5

- [X] T061 [P] [US5] Integration tests in `apps/server/tests/integration/reimbursements.test.ts` (X14):
  - **Totals**: "Ahmed" 2,000 (order A), "ahmed " 1,500 (order B), "Driver Li" 800 → `GET /api/expenses/reimbursements` gives Ahmed `"3500.00"` (2 expenses, labelled with the most recent spelling) then Driver Li `"800.00"`, largest first.
  - **Reimbursed**: `PATCH /status { reimbursed: true }` on the 2,000 → Ahmed `"1500.00"`.
  - **Exclusions**: a deleted expense and the expenses of a deleted order are excluded; restoring the order brings them back. A person owed 0 is not listed.
  - **Per person**: `GET /api/expenses/to-reimburse?person=AHMED` lists Ahmed's open expenses with their order number and title.
  - **Suggestions**: `GET /api/expenses/advanced-by?q=ah` → `["Ahmed"]` (distinct, at most 10). An Arabic name matches with or without harakat.
  - **Order totals**: `byAdvancedBy` in the order's expense totals shows `total` and `toReimburse` per person.
  - `reimbursed: true` without `advancedBy` is stored as false.
- [X] T062 [P] [US5] Playwright e2e test in `apps/web/e2e/expenses.spec.ts` (append):
  1. Seed the X14 expenses via the API. The dashboard "To reimburse" block shows Ahmed and Driver Li.
  2. Tap Ahmed: his expenses are listed. Mark one reimbursed: his amount drops.
  3. On a new expense, typing "Ah" in "Advanced by" suggests "Ahmed".

### Implementation for User Story 5

- [X] T063 [US5] Extend `apps/server/src/expenses/query.ts` (R9), grouping by `hj_norm(advanced_by)` and labelling each group with the spelling of its newest expense:
  - `reimbursements(db)`: non-reimbursed, non-deleted expenses of non-deleted orders;
  - `toReimburse(db, person)`: the same rows for one normalized name, with the order number and title;
  - `advancedByNames(db, q)`: distinct names via `likePattern`;
  - `byAdvancedBy` in `listOrderExpenses`.
  In `apps/server/src/expenses/service.ts`, `setExpenseStatus` accepts `reimbursed`, ignored when `advancedBy` is empty.
- [X] T064 [US5] Add these routes to `apps/server/src/routes/expenses.ts`, registered **before** `/api/expenses/:id`:
  - `GET /api/expenses/advanced-by` (expenses:view);
  - `GET /api/expenses/reimbursements` (expenses:view);
  - `GET /api/expenses/to-reimburse?person=` (expenses:view).
  Add `presentReimbursement` to `apps/server/src/policy/present.ts`.
- [X] T065 [P] [US5] Create `apps/web/src/components/AdvancedByInput.tsx`: a text input with debounced suggestions from `GET /api/expenses/advanced-by` in a listbox (keyboard and touch friendly, `dir="auto"`). Use it in `apps/web/src/routes/expenses/form.tsx`, with a "Reimbursed" switch shown when a name is set.
- [X] T066 [US5] Show the per-person totals (total and still to reimburse) in `apps/web/src/routes/orders/ExpensesTab.tsx`. Add a "Mark reimbursed" / "Mark not reimbursed" action and a "Reimbursed" badge on `apps/web/src/routes/expenses/detail.tsx`.
- [X] T067 [US5] Add the "To reimburse" block to `apps/web/src/routes/dashboard.tsx`, one line per person with the amount. Each line links to `/reimbursements?person=<name>`. Then build `apps/web/src/routes/reimbursements.tsx`: the person's open expenses (order number, name, date, CNY amount, each linking to `/expenses/:id`), each with "Mark reimbursed", and the total.
- [X] T068 [US5] Add every US5 string to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: X14 passes.

---

## Phase 8: User Story 6 — Use and adapt expense categories (Priority: P6)

**Goal**: translated default categories, and add, rename and hide/show in Settings, with no deletion.

**Independent Test**: add "Spare parts", use it, rename it (the expense shows the new name), hide it (no longer offered, kept on the expense) (X15).

### Tests for User Story 6

- [X] T069 [P] [US6] Integration tests in `apps/server/tests/integration/categories.test.ts` (X15):
  - `GET` lists the 13 defaults in order, with `name: null`.
  - **Add**: `POST { name: 'Spare parts' }` → position 13, `record.created` (target `expense_category`). An Arabic name is stored exactly.
  - **Rename**: `PATCH { name }` on a default stores the name, and the expense shows it.
  - **Hide**: `PATCH { hidden: true }` → it is missing without `includeHidden` and present with it. The existing expense and its category total keep it. A new expense with it gives `category_invalid`.
  - **Validation**: `''` and a 61-character name give `name_invalid`.
  - There is no `DELETE` route.
  - Changes are audited before/after.
- [X] T070 [P] [US6] Playwright e2e test in `apps/web/e2e/categories.spec.ts`:
  1. In Settings, add "Spare parts". It is offered on the expense form; use it.
  2. Rename it: the expense shows the new name.
  3. Hide it: it is not offered on a new expense, and is still shown on the existing one.
  4. Switch to French: the default categories are in French.

### Implementation for User Story 6

- [X] T071 [US6] Implement `createCategory` (appended at `max(position) + 1`) and `updateCategory` (rename and/or hide), with audit, in `apps/server/src/expenses/categories.ts`.
- [X] T072 [US6] Add `POST /api/expense-categories` (owner) and `PATCH /api/expense-categories/:id` (owner) to `apps/server/src/routes/expenseCategories.ts`.
- [X] T073 [US6] Add an "Expense categories" section to `apps/web/src/routes/settings.tsx`: the list in order with `categoryLabel`, an add field, inline rename (an empty name resets nothing; renaming a default shows the typed name in every language), and a hide/show switch with hidden rows dimmed.
- [X] T074 [US6] Add every US6 string to `apps/web/src/locales/{en,fr,ar}/common.json`.

**Checkpoint**: X15 passes. All six stories work.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T075 [P] Integration test for permissions in `apps/server/tests/integration/policies003.test.ts` (X18, FR-023):
  - every route added in 003 is registered with a policy (via `registeredRoutes()`): `expenses:*` for expense, receipt and category reads; `owner` for category changes and rate settings/refresh; `authenticated` only for `GET /api/rates` and `GET /api/rates/config`;
  - a worker gets `403` on all the others;
  - `SENSITIVE_FIELDS` equals the T011 lists exactly.
- [X] T076 [P] Extend the cross-cutting e2e tests:
  - in `apps/web/e2e/i18n-rtl.spec.ts` (X19), seed a USD expense with an Arabic "advanced by" name and a receipt via the API. Add to the checked screens: `/orders/<id>?tab=expenses`, `/orders/<id>/expenses/new`, `/expenses/<id>`, `/expenses/<id>/edit`, `/reimbursements?person=…` and the dashboard;
  - add the expense form and the order's Expenses tab to `apps/web/e2e/no-external-requests.spec.ts`.
- [X] T077 [P] Add an "Expenses and exchange rates" section to `README.md`:
  - expenses and receipts (stored in `DATA_DIR/receipts`, covered by backups);
  - the agreed rate and how profit is computed;
  - the providers and their terms (attribution for ExchangeRate-API);
  - the env vars `RATE_FETCH_TIMEOUT_MS`, `RATES_CURRENCY_API_URLS` and `RATES_EXCHANGERATE_API_URL`;
  - reimbursements.
  Do not tick 003 in `ROADMAP.md` until it is merged.
- [X] T078 Run the full validation:
  - lint, typecheck, `npm test`, and `npm run test:e2e` on all projects;
  - the quickstart scenarios X1–X19;
  - Arabic screenshots at 360px of the expense form, the Expenses tab, the order summary and the two Settings sections (a throwaway spec, deleted afterwards), checking the RTL layout visually.
  Fix every failure.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → **Foundational (T002–T015)** → user stories.
- **US1** (P1, MVP) needs Foundational.
- **US2** needs Foundational. Its profit figures are only meaningful with US1 expenses, and its e2e test adds expenses through the US1 form.
- **US3** needs US1 (the expense form) for auto-fill. The server part (T044–T050) is independent of US1 and US2. Its order-form fetch needs US2's field (T042).
- **US4** needs US1.
- **US5** needs US1, and US4's status route (T057).
- **US6** needs US1 (categories in use).
- **Polish** comes after all stories.

```text
Setup → Foundational → US1 ─┬─→ US2 ─→ US3 (order-form fetch)
                            ├─→ US3 (server + expense form)
                            ├─→ US4 ─→ US5
                            └─→ US6 ────────────→ Polish
```

### Shared files (edit sequentially, never in parallel)

- `apps/server/src/expenses/service.ts` (T023 → T056 → T063)
- `apps/server/src/expenses/query.ts` (T024 → T063)
- `apps/server/src/routes/expenses.ts` (T026 → T057 → T064)
- `apps/server/src/policy/present.ts` (T011 → T025 → T039 → T049 → T064)
- `apps/web/src/routes/expenses/form.tsx` (T031 → T051 → T058 → T065)
- `apps/web/src/routes/orders/ExpensesTab.tsx` (T032 → T059 → T066)
- `apps/web/src/routes/expenses/detail.tsx` (T033 → T058 → T066)
- `apps/web/src/routes/settings.tsx` (T052 → T073)
- `apps/web/src/locales/*/common.json` (T015, T034, T043, T053, T060, T068, T074)
- `apps/server/tests/helpers.ts` (T012 → T040)

### Parallel opportunities

- **Foundational**: T002–T005 together, then T012, T013 and T014 alongside the schema work (T007–T011).
- **US1**: the tests T016–T019 together, then T020, T028, T029 and T030 alongside the server services.
- **After US1**: the US3 server work (T044–T050), US4 and US6 can run alongside US2.

## Parallel Example: User Story 1

```text
Task: "T016 sniff unit tests in apps/server/tests/unit/sniff.test.ts"
Task: "T017 expense create tests in apps/server/tests/integration/expenses.create.test.ts"
Task: "T018 receipt tests in apps/server/tests/integration/receipts.test.ts"
Task: "T019 expense e2e in apps/web/e2e/expenses.spec.ts"
# then, alongside the server work T021–T027:
Task: "T020 sniffMime", "T028 imageResize", "T029 ReceiptInput", "T030 PaidToPicker"
```

---

## Implementation Strategy

### MVP first (US1)

1. T001 → T002–T015.
2. US1 (T016–T034). **Stop and validate** X1–X4: the real cost of each order is recorded from the phone, with receipts and exact totals.

### Incremental delivery

1. **US2**: profit per order, the number the Owner checks most. It also brings the 002 tests to the new order contract.
2. **US3**: rates in one tap. It saves typing, but nothing depends on it.
3. **US4**: edits and deletions. **US5**: reimbursements. **US6**: categories.
4. **Polish** and full validation. Commit only when the user asks, then merge and tick 003 in `ROADMAP.md`.

### Notes

- Money and rates never go through floats. The only float is the provider inversion, which only produces a suggestion (R2).
- Saving an expense never calls a provider. Snapshots come from the cache only.
- Every new route goes through `route()` with a policy, or the server refuses to start.
- Every change to a business record writes its audit entry in the same transaction. The access key is never audited.
