import { addressBookQuerySchema, createCustomerRequestSchema, updateCustomerRequestSchema, type OrderListItem, type Customer, type Page } from '@hanjing/shared';
import type { Hono } from 'hono';
import { createCustomer, deleteCustomer, getCustomer, listCustomers, restoreCustomer, updateCustomer } from '../customers/service';
import { ordersOfCustomer } from '../orders/query';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { notFound } from '../lib/errors';
import { parseWith, readJsonBody } from '../lib/validate';
import { requirePermission } from '../policy/authorize';
import { presentCustomer, presentOrderListItem } from '../policy/present';
import { route } from '../policy/route';

/** 002 FR-001 – FR-004 (customers). Every route declares a customers:<action> policy (FR-024). */
export function registerCustomerRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db, clock } = deps;

  route(app, 'GET', '/api/customers', { module: 'customers', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const query = parseWith(addressBookQuerySchema, c.req.query());
    if (query.deleted) requirePermission(viewer, 'customers', 'delete');
    const page = listCustomers(db, query);
    return c.json<Page<Customer>>({ items: page.items.map((r) => presentCustomer(r, { viewer })), nextCursor: page.nextCursor });
  });

  route(app, 'POST', '/api/customers', { module: 'customers', action: 'create' }, async (c) => {
    const viewer = c.get('user')!;
    const input = parseWith(createCustomerRequestSchema, await readJsonBody(c));
    const row = db.transaction((tx) => createCustomer(tx, clock, input, viewer, c.get('reqCtx')));
    return c.json(presentCustomer(row, { viewer }), 201);
  });

  route(app, 'GET', '/api/customers/:id', { module: 'customers', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const deleted = c.req.query('deleted') === 'true';
    if (deleted) requirePermission(viewer, 'customers', 'delete');
    const row = getCustomer(db, c.req.param('id') ?? '', { deleted });
    if (!row) throw notFound();
    return c.json(presentCustomer(row, { viewer }));
  });

  route(app, 'PATCH', '/api/customers/:id', { module: 'customers', action: 'edit' }, async (c) => {
    const viewer = c.get('user')!;
    const input = parseWith(updateCustomerRequestSchema, await readJsonBody(c));
    const row = db.transaction((tx) => updateCustomer(tx, clock, c.req.param('id') ?? '', input, viewer, c.get('reqCtx')));
    return c.json(presentCustomer(row, { viewer }));
  });

  route(app, 'GET', '/api/customers/:id/orders', { module: 'customers', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    requirePermission(viewer, 'orders', 'view');
    const id = c.req.param('id') ?? '';
    if (!getCustomer(db, id)) throw notFound();
    const items = ordersOfCustomer(db, id).map((row) => presentOrderListItem(row, { viewer }));
    return c.json<{ items: OrderListItem[] }>({ items });
  });

  route(app, 'DELETE', '/api/customers/:id', { module: 'customers', action: 'delete' }, (c) => {
    db.transaction((tx) => deleteCustomer(tx, clock, c.req.param('id') ?? '', c.get('user')!, c.get('reqCtx')));
    return c.body(null, 204);
  });

  route(app, 'POST', '/api/customers/:id/restore', { module: 'customers', action: 'delete' }, (c) => {
    const viewer = c.get('user')!;
    const row = db.transaction((tx) => restoreCustomer(tx, clock, c.req.param('id') ?? '', viewer, c.get('reqCtx')));
    return c.json(presentCustomer(row, { viewer }));
  });
}
