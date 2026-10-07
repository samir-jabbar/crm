import {
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
import { notFound } from '../lib/errors';
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
import { requirePermission } from '../policy/authorize';
import { presentOrder, presentOrderListItem, presentOrderNote } from '../policy/present';
import { route } from '../policy/route';

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
    const page = listOrders(db, query);
    return c.json<Page<OrderListItem>>({
      items: page.items.map((row) => presentOrderListItem(row, { viewer })),
      nextCursor: page.nextCursor,
    });
  });

  route(app, 'GET', '/api/orders/summary', { module: 'orders', action: 'view' }, (c) =>
    c.json<OrdersSummary>(ordersSummary(db)),
  );

  route(app, 'POST', '/api/orders', { module: 'orders', action: 'create' }, async (c) => {
    const viewer = c.get('user')!;
    const input = parseWith(orderInputSchema, await readJsonBody(c));
    const view = createOrder(deps, input, viewer, c.get('reqCtx'));
    return c.json(presentOrder(view, { viewer }), 201);
  });

  route(app, 'GET', '/api/orders/:id', { module: 'orders', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const deleted = c.req.query('deleted') === 'true';
    if (deleted) requirePermission(viewer, 'orders', 'delete');
    const view = loadOrderView(db, id(c), { deleted });
    if (!view) throw notFound();
    return c.json(presentOrder(view, { viewer }));
  });

  route(app, 'PUT', '/api/orders/:id', { module: 'orders', action: 'edit' }, async (c) => {
    const viewer = c.get('user')!;
    const input = parseWith(orderInputSchema, await readJsonBody(c));
    const view = updateOrder(deps, id(c), input, viewer, c.get('reqCtx'));
    return c.json(presentOrder(view, { viewer }));
  });

  route(app, 'PATCH', '/api/orders/:id/status', { module: 'orders', action: 'edit' }, async (c) => {
    const viewer = c.get('user')!;
    const { status } = parseWith(orderStatusRequestSchema, await readJsonBody(c));
    const view = setOrderStatus(deps, id(c), status, viewer, c.get('reqCtx'));
    return c.json(presentOrder(view, { viewer }));
  });

  route(app, 'POST', '/api/orders/:id/duplicate', { module: 'orders', action: 'create' }, async (c) => {
    const viewer = c.get('user')!;
    const { titleSuffix } = parseWith(duplicateOrderRequestSchema, await readJsonBody(c));
    const view = duplicateOrder(deps, id(c), titleSuffix ?? '', viewer, c.get('reqCtx'));
    return c.json(presentOrder(view, { viewer }), 201);
  });

  route(app, 'GET', '/api/orders/:id/notes', { module: 'orders', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const items = listNotes(db, id(c)).map((note) => presentOrderNote(note, { viewer }));
    return c.json<{ items: OrderNote[] }>({ items });
  });

  route(app, 'POST', '/api/orders/:id/notes', { module: 'orders', action: 'edit' }, async (c) => {
    const viewer = c.get('user')!;
    const { body } = parseWith(createOrderNoteRequestSchema, await readJsonBody(c));
    const note = db.transaction((tx) => addNote(tx, clock, id(c), body, viewer, c.get('reqCtx')));
    return c.json(presentOrderNote(note, { viewer }), 201);
  });

  route(app, 'DELETE', '/api/orders/:id/notes/:noteId', { module: 'orders', action: 'edit' }, (c) => {
    const viewer = c.get('user')!;
    db.transaction((tx) => deleteNote(tx, clock, id(c), c.req.param('noteId') ?? '', viewer, c.get('reqCtx')));
    return c.body(null, 204);
  });

  route(app, 'DELETE', '/api/orders/:id', { module: 'orders', action: 'delete' }, (c) => {
    deleteOrder(deps, id(c), c.get('user')!, c.get('reqCtx'));
    return c.body(null, 204);
  });

  route(app, 'POST', '/api/orders/:id/restore', { module: 'orders', action: 'delete' }, (c) => {
    const viewer = c.get('user')!;
    const view = restoreOrder(deps, id(c), viewer, c.get('reqCtx'));
    return c.json(presentOrder(view, { viewer }));
  });
}
