import { isHidden, isPurchaseExpense } from '@hanjing/shared';
import {
  advancedByQuerySchema,
  expenseInputSchema,
  expenseStatusPatchSchema,
  orderExpensesQuerySchema,
  toReimburseQuerySchema,
  type Expense,
  type OrderExpenses,
  type Reimbursement,
  type ToReimburse,
} from '@hanjing/shared';
import type { Hono } from 'hono';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { advancedByNames, listOrderExpenses, reimbursements, requireOpenOrder, toReimburse } from '../expenses/query';
import {
  createExpense,
  deleteExpense,
  requireExpense,
  restoreExpense,
  setExpenseStatus,
  updateExpense,
} from '../expenses/service';
import { readReceipt } from '../files/store';
import { AppError, notFound } from '../lib/errors';
import { parseWith, readJsonBody } from '../lib/validate';
import { accessOf, requirePermission } from '../policy/authorize';
import { orderVisible, ownEntries, requireEntryInScope, requireOrderInScope, requireReferencesInScope } from '../policy/scope';
import { expenses, type UserRow } from '../db/schema';
import { and, eq, type SQL } from 'drizzle-orm';
import { presentExpense, presentExpenseTotals, presentReimbursement, presentToReimburse } from '../policy/present';
import { route } from '../policy/route';

/** 003 FR-001 – FR-010 (expenses). Every route declares an expenses:<action> policy (FR-023). */
/**
 * 005 FR-032: recording or changing a supplier purchase (equipment purchase, or paid to a supplier) needs supplier
 * prices and identity visible; the form does not offer them to other workers.
 */
function requirePurchaseAllowed(user: UserRow, expense: { categoryId: string; paidToSupplierId?: string | null } | undefined): void {
  if (!expense || !isPurchaseExpense({ categoryId: expense.categoryId, paidToSupplierId: expense.paidToSupplierId ?? null })) return;
  const access = accessOf(user);
  if (isHidden(access, 'supplierPrices') || isHidden(access, 'supplierIdentity')) throw new AppError(403, 'purchase_hidden');
}

/** 005 FR-021, FR-024: the expenses a viewer may see across orders (reimbursements, suggestions). */
function visibleExpenses(user: UserRow): SQL | undefined {
  const access = accessOf(user);
  return and(orderVisible(access, expenses.orderId), ownEntries(access, expenses.createdBy));
}

/** The stored category and supplier of an expense, deleted or not. */
const storedExpense = (db: Deps['db'], expenseId: string) =>
  db.select({ categoryId: expenses.categoryId, paidToSupplierId: expenses.paidToSupplierId }).from(expenses).where(eq(expenses.id, expenseId)).get();

export function registerExpenseRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db } = deps;
  const id = (c: { req: { param: (k: string) => string | undefined } }) => c.req.param('id') ?? '';

  route(app, 'GET', '/api/orders/:id/expenses', { module: 'expenses', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const { deleted } = parseWith(orderExpensesQuerySchema, c.req.query());
    if (deleted) requirePermission(viewer, 'expenses', 'delete');
    const access = accessOf(viewer);
    requireOrderInScope(db, access, id(c));
    const own = ownEntries(access, expenses.createdBy);
    const { items, totals } = listOrderExpenses(db, id(c), { deleted, filter: own });
    return c.json<OrderExpenses>({
      items: items.map((view) => presentExpense(view, { viewer })),
      totals: presentExpenseTotals(totals, { viewer }),
      ...(own ? { yourEntries: true } : {}),
    });
  });

  route(app, 'POST', '/api/orders/:id/expenses', { module: 'expenses', action: 'create' }, async (c) => {
    const viewer = c.get('user')!;
    // A missing, deleted or out-of-scope order is a 404 before any field is checked.
    requireOrderInScope(db, accessOf(viewer), id(c));
    requireOpenOrder(db, id(c));
    const input = parseWith(expenseInputSchema, await readJsonBody(c));
    requireReferencesInScope(db, accessOf(viewer), { supplierIds: [input.paidToSupplierId] });
    requirePurchaseAllowed(viewer, input);
    const view = createExpense(deps, id(c), input, viewer, c.get('reqCtx'));
    return c.json<Expense>(presentExpense(view, { viewer }), 201);
  });

  // US5 (FR-019, FR-020). Fixed paths are registered before `/:id`: the first matching route wins.
  route(app, 'GET', '/api/expenses/advanced-by', { module: 'expenses', action: 'view' }, (c) => {
    const { q } = parseWith(advancedByQuerySchema, c.req.query());
    return c.json<{ items: string[] }>({ items: advancedByNames(db, q, visibleExpenses(c.get('user')!)) });
  });

  route(app, 'GET', '/api/expenses/reimbursements', { module: 'expenses', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const items = reimbursements(db, visibleExpenses(viewer)).map((row) => presentReimbursement(row, { viewer }));
    return c.json<{ items: Reimbursement[] }>({ items });
  });

  route(app, 'GET', '/api/expenses/to-reimburse', { module: 'expenses', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const { person } = parseWith(toReimburseQuerySchema, c.req.query());
    return c.json<ToReimburse>(presentToReimburse(toReimburse(db, person, visibleExpenses(viewer)), { viewer }));
  });

  route(app, 'GET', '/api/expenses/:id', { module: 'expenses', action: 'view' }, (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), expenses, id(c));
    const viewer = c.get('user')!;
    return c.json<Expense>(presentExpense(requireExpense(db, id(c)), { viewer }));
  });

  route(app, 'PUT', '/api/expenses/:id', { module: 'expenses', action: 'edit' }, async (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), expenses, id(c));
    requirePurchaseAllowed(c.get('user')!, storedExpense(db, id(c)));
    const viewer = c.get('user')!;
    requireExpense(db, id(c));
    const input = parseWith(expenseInputSchema, await readJsonBody(c));
    requireReferencesInScope(db, accessOf(viewer), { supplierIds: [input.paidToSupplierId] });
    requirePurchaseAllowed(viewer, input);
    return c.json<Expense>(presentExpense(updateExpense(deps, id(c), input, viewer, c.get('reqCtx')), { viewer }));
  });

  route(app, 'PATCH', '/api/expenses/:id/status', { module: 'expenses', action: 'edit' }, async (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), expenses, id(c));
    requirePurchaseAllowed(c.get('user')!, storedExpense(db, id(c)));
    const viewer = c.get('user')!;
    const patch = parseWith(expenseStatusPatchSchema, await readJsonBody(c));
    return c.json<Expense>(presentExpense(setExpenseStatus(deps, id(c), patch, viewer, c.get('reqCtx')), { viewer }));
  });

  route(app, 'DELETE', '/api/expenses/:id', { module: 'expenses', action: 'delete' }, (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), expenses, id(c));
    requirePurchaseAllowed(c.get('user')!, storedExpense(db, id(c)));
    deleteExpense(deps, id(c), c.get('user')!, c.get('reqCtx'));
    return c.body(null, 204);
  });

  route(app, 'POST', '/api/expenses/:id/restore', { module: 'expenses', action: 'delete' }, (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), expenses, id(c));
    requirePurchaseAllowed(c.get('user')!, storedExpense(db, id(c)));
    const viewer = c.get('user')!;
    return c.json<Expense>(presentExpense(restoreExpense(deps, id(c), viewer, c.get('reqCtx')), { viewer }));
  });

  // Research R7: receipts are only reachable through the gate, never as static files, and are served so that
  // a browser can neither guess another type nor run anything inside them.
  route(app, 'GET', '/api/expenses/:id/receipt', { module: 'expenses', action: 'view' }, (c) => {
    requireEntryInScope(db, accessOf(c.get('user')!), expenses, id(c));
    const expense = requireExpense(db, id(c));
    // 005 FR-033: a purchase receipt shows the price, so it follows the supplier-prices group.
    if (isHidden(accessOf(c.get('user')!), 'supplierPrices') && isPurchaseExpense(expense)) throw notFound();
    const file = expense.receiptFileId ? readReceipt(deps, expense.receiptFileId) : undefined;
    if (!file) throw notFound();
    c.set('cspOverride', 'sandbox');
    // Browsers will not run their PDF viewer inside a sandboxed document, so PDFs are downloaded and opened by
    // the phone's own viewer; images are shown inline (research R7, decided in T033).
    const disposition = file.mime === 'application/pdf' ? `attachment; filename="receipt-${expense.id}.pdf"` : 'inline';
    return c.body(new Uint8Array(file.bytes), 200, {
      'Content-Type': file.mime,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  });
}
