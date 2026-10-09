import {
  figureVisible,
  formatAmount,
  formatRate,
  isHidden,
  createOrderNoteRequestSchema,
  duplicateOrderRequestSchema,
  orderInputSchema,
  ordersQuerySchema,
  orderStatusRequestSchema,
  type OrderListItem,
  type OrderNote,
  type OrdersSummary,
  type Page,
} from '@hanjing/shared';
import type { Hono } from 'hono';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { forbidden, notFound } from '../lib/errors';
import { parseWith, readJsonBody } from '../lib/validate';
import { listOrders, ordersSummary } from '../orders/query';
import { addNote, deleteNote, listNotes } from '../orders/notes';
import {
  createOrder,
  deleteOrder,
  duplicateOrder,
  loadOrderView,
  restoreOrder,
  setOrderStatus,
  updateOrder,
} from '../orders/service';
import { accessOf, requirePermission } from '../policy/authorize';
import { orderVisible, requireOrderInScope, requireReferencesInScope } from '../policy/scope';
import { presentOrder, presentOrderListItem, presentOrderNote } from '../policy/present';
import { route } from '../policy/route';
import type { UserRow } from '../db/schema';
import type { OrderView } from '../policy/present';

/** 005 FR-032: closing needs the remaining amount visible (the 004 closing rule depends on it). */
function requireCloseAllowed(viewer: UserRow, status: string | undefined): void {
  if (status === 'closed' && !figureVisible(accessOf(viewer), 'remaining')) throw forbidden();
}

/** 005 FR-031: existing item lines keep their stored supplier when supplier identity is hidden; new lines have none. */
function withHiddenSuppliers(body: unknown, current: OrderView): unknown {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { items?: unknown }).items)) return body;
  const stored = new Map(current.items.map((item) => [item.id, item.supplierId]));
  const items = ((body as { items: Record<string, unknown>[] }).items ?? []).map((item) => ({
    ...item,
    supplierId: typeof item.id === 'string' ? (stored.get(item.id) ?? null) : null,
  }));
  return { ...body, items };
}

/** 005 FR-031: the hidden price fields and the (read-only) item lines, taken from the current order. */
function withHiddenPrices(body: unknown, current: OrderView): Record<string, unknown> {
  const { order, items } = current;
  return {
    ...(body && typeof body === 'object' ? body : {}),
    agreedPrice: formatAmount(order.agreedPriceMinor),
    currency: order.currency,
    agreedRate: order.agreedRateMicro === null ? null : formatRate(order.agreedRateMicro),
    budgetCny: order.budgetCnyMinor === null ? null : formatAmount(order.budgetCnyMinor),
    items: items.map((item) => ({
      id: item.id,
      productName: item.productName,
      brandModel: item.brandModel,
      year: item.year,
      quantity: item.quantity,
      unitPrice: formatAmount(item.unitPriceMinor),
      hsCode: item.hsCode,
      specs: item.specs,
      supplierId: item.supplierId,
    })),
  };
}

/**
 * 002 FR-008 – FR-018 (orders). Every route declares an orders:<action> policy (FR-024).
 * Static paths (`/summary`) are registered before `/:id` — the first matching route wins.
 */
export function registerOrderRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db, clock } = deps;
  const id = (c: { req: { param: (k: string) => string | undefined } }) => c.req.param('id') ?? '';

  route(app, 'GET', '/api/orders', { module: 'orders', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const query = parseWith(ordersQuerySchema, c.req.query());
    if (query.deleted) requirePermission(viewer, 'orders', 'delete');
    const page = listOrders(db, query, orderVisible(accessOf(viewer)));
    return c.json<Page<OrderListItem>>({
      items: page.items.map((row) => presentOrderListItem(row, { viewer })),
      nextCursor: page.nextCursor,
    });
  });

  route(app, 'GET', '/api/orders/summary', { module: 'orders', action: 'view' }, (c) => {
    requirePermission(c.get('user'), 'orders', 'view'); // not part of the basic order view
    return c.json<OrdersSummary>(ordersSummary(db, orderVisible(accessOf(c.get('user')!))));
  });

  route(app, 'POST', '/api/orders', { module: 'orders', action: 'create' }, async (c) => {
    const viewer = c.get('user')!;
    const input = parseWith(orderInputSchema, await readJsonBody(c));
    requireReferencesInScope(db, accessOf(viewer), { customerId: input.customerId, supplierIds: input.items.map((i) => i.supplierId) });
    const view = createOrder(deps, input, viewer, c.get('reqCtx'));
    return c.json(presentOrder(view, { viewer }), 201);
  });

  route(app, 'GET', '/api/orders/:id', { module: 'orders', action: 'view' }, (c) => {
    requireOrderInScope(db, accessOf(c.get('user')!), id(c));
    const viewer = c.get('user')!;
    const deleted = c.req.query('deleted') === 'true';
    if (deleted) requirePermission(viewer, 'orders', 'delete');
    const view = loadOrderView(db, id(c), { deleted });
    if (!view) throw notFound();
    return c.json(presentOrder(view, { viewer }));
  });

  route(app, 'PUT', '/api/orders/:id', { module: 'orders', action: 'edit' }, async (c) => {
    requireOrderInScope(db, accessOf(c.get('user')!), id(c));
    const viewer = c.get('user')!;
    const access = accessOf(viewer);
    const body = await readJsonBody(c);
    // 005 FR-031: with prices hidden, the price fields and the item lines are kept as they are; with supplier
    // identity hidden, existing lines keep their supplier.
    const pricesHidden = isHidden(access, 'sellingPrice');
    const current = pricesHidden || isHidden(access, 'supplierIdentity') ? loadOrderView(db, id(c)) : undefined;
    const merged = current ? (pricesHidden ? withHiddenPrices(body, current) : withHiddenSuppliers(body, current)) : body;
    const input = parseWith(orderInputSchema, merged);
    requireReferencesInScope(db, access, { customerId: input.customerId, supplierIds: input.items.map((i) => i.supplierId) });
    requireCloseAllowed(viewer, input.status);
    const view = updateOrder(deps, id(c), input, viewer, c.get('reqCtx'));
    return c.json(presentOrder(view, { viewer }));
  });

  route(app, 'PATCH', '/api/orders/:id/status', { module: 'orders', action: 'edit' }, async (c) => {
    requireOrderInScope(db, accessOf(c.get('user')!), id(c));
    const viewer = c.get('user')!;
    const { status, confirmOutstanding } = parseWith(orderStatusRequestSchema, await readJsonBody(c));
    requireCloseAllowed(viewer, status);
    const view = setOrderStatus(deps, id(c), status, viewer, c.get('reqCtx'), { confirmOutstanding });
    return c.json(presentOrder(view, { viewer }));
  });

  route(app, 'POST', '/api/orders/:id/duplicate', { module: 'orders', action: 'create' }, async (c) => {
    requireOrderInScope(db, accessOf(c.get('user')!), id(c));
    const viewer = c.get('user')!;
    const { titleSuffix } = parseWith(duplicateOrderRequestSchema, await readJsonBody(c));
    const view = duplicateOrder(deps, id(c), titleSuffix ?? '', viewer, c.get('reqCtx'));
    return c.json(presentOrder(view, { viewer }), 201);
  });

  route(app, 'GET', '/api/orders/:id/notes', { module: 'orders', action: 'view' }, (c) => {
    requireOrderInScope(db, accessOf(c.get('user')!), id(c));
    const viewer = c.get('user')!;
    requirePermission(viewer, 'orders', 'view'); // notes are part of the Overview, not the basic view
    const items = listNotes(db, id(c)).map((note) => presentOrderNote(note, { viewer }));
    return c.json<{ items: OrderNote[] }>({ items });
  });

  route(app, 'POST', '/api/orders/:id/notes', { module: 'orders', action: 'edit' }, async (c) => {
    requireOrderInScope(db, accessOf(c.get('user')!), id(c));
    const viewer = c.get('user')!;
    const { body } = parseWith(createOrderNoteRequestSchema, await readJsonBody(c));
    const note = db.transaction((tx) => addNote(tx, clock, id(c), body, viewer, c.get('reqCtx')));
    return c.json(presentOrderNote(note, { viewer }), 201);
  });

  route(app, 'DELETE', '/api/orders/:id/notes/:noteId', { module: 'orders', action: 'edit' }, (c) => {
    requireOrderInScope(db, accessOf(c.get('user')!), id(c));
    const viewer = c.get('user')!;
    db.transaction((tx) => deleteNote(tx, clock, id(c), c.req.param('noteId') ?? '', viewer, c.get('reqCtx')));
    return c.body(null, 204);
  });

  route(app, 'DELETE', '/api/orders/:id', { module: 'orders', action: 'delete' }, (c) => {
    requireOrderInScope(db, accessOf(c.get('user')!), id(c));
    deleteOrder(deps, id(c), c.get('user')!, c.get('reqCtx'));
    return c.body(null, 204);
  });

  route(app, 'POST', '/api/orders/:id/restore', { module: 'orders', action: 'delete' }, (c) => {
    requireOrderInScope(db, accessOf(c.get('user')!), id(c));
    const viewer = c.get('user')!;
    const view = restoreOrder(deps, id(c), viewer, c.get('reqCtx'));
    return c.json(presentOrder(view, { viewer }));
  });
}
