import { addressBookQuerySchema, createSupplierRequestSchema, updateSupplierRequestSchema, type OrderListItem, type Page, type Supplier } from '@hanjing/shared';
import type { Hono } from 'hono';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { notFound } from '../lib/errors';
import { parseWith, readJsonBody } from '../lib/validate';
import { requirePermission } from '../policy/authorize';
import { presentOrderListItem, presentSupplier } from '../policy/present';
import { route } from '../policy/route';
import { createSupplier, deleteSupplier, getSupplier, listSuppliers, restoreSupplier, updateSupplier } from '../suppliers/service';
import { ordersOfSupplier } from '../orders/query';

/** 002 FR-005 – FR-007 (suppliers). Every route declares a suppliers:<action> policy (FR-024). */
export function registerSupplierRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db, clock } = deps;

  route(app, 'GET', '/api/suppliers', { module: 'suppliers', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const query = parseWith(addressBookQuerySchema, c.req.query());
    if (query.deleted) requirePermission(viewer, 'suppliers', 'delete');
    const page = listSuppliers(db, query);
    return c.json<Page<Supplier>>({ items: page.items.map((r) => presentSupplier(r, { viewer })), nextCursor: page.nextCursor });
  });

  route(app, 'POST', '/api/suppliers', { module: 'suppliers', action: 'create' }, async (c) => {
    const viewer = c.get('user')!;
    const input = parseWith(createSupplierRequestSchema, await readJsonBody(c));
    const row = db.transaction((tx) => createSupplier(tx, clock, input, viewer, c.get('reqCtx')));
    return c.json(presentSupplier(row, { viewer }), 201);
  });

  route(app, 'GET', '/api/suppliers/:id', { module: 'suppliers', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const deleted = c.req.query('deleted') === 'true';
    if (deleted) requirePermission(viewer, 'suppliers', 'delete');
    const row = getSupplier(db, c.req.param('id') ?? '', { deleted });
    if (!row) throw notFound();
    return c.json(presentSupplier(row, { viewer }));
  });

  route(app, 'PATCH', '/api/suppliers/:id', { module: 'suppliers', action: 'edit' }, async (c) => {
    const viewer = c.get('user')!;
    const input = parseWith(updateSupplierRequestSchema, await readJsonBody(c));
    const row = db.transaction((tx) => updateSupplier(tx, clock, c.req.param('id') ?? '', input, viewer, c.get('reqCtx')));
    return c.json(presentSupplier(row, { viewer }));
  });

  route(app, 'GET', '/api/suppliers/:id/orders', { module: 'suppliers', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    requirePermission(viewer, 'orders', 'view');
    const id = c.req.param('id') ?? '';
    if (!getSupplier(db, id)) throw notFound();
    const items = ordersOfSupplier(db, id).map((row) => presentOrderListItem(row, { viewer }));
    return c.json<{ items: OrderListItem[] }>({ items });
  });

  route(app, 'DELETE', '/api/suppliers/:id', { module: 'suppliers', action: 'delete' }, (c) => {
    db.transaction((tx) => deleteSupplier(tx, clock, c.req.param('id') ?? '', c.get('user')!, c.get('reqCtx')));
    return c.body(null, 204);
  });

  route(app, 'POST', '/api/suppliers/:id/restore', { module: 'suppliers', action: 'delete' }, (c) => {
    const viewer = c.get('user')!;
    const row = db.transaction((tx) => restoreSupplier(tx, clock, c.req.param('id') ?? '', viewer, c.get('reqCtx')));
    return c.json(presentSupplier(row, { viewer }));
  });
}
