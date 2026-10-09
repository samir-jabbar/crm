import { MODULE_ACTIONS, MODULES, type PermissionSet } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';
import { HIDDEN_FIELDS } from '../../src/policy/present';
import { registeredRoutes } from '../../src/policy/route';
import { createTestContext } from '../helpers';

/** Routes 005 adds: Owner-only user management, templates and assignments, and the public registration. */
const OWNER_005 = /^\/api\/(users|role-templates)(\/|$)|^\/api\/orders\/:id\/assignees$/;
const PUBLIC_005 = new Set(['GET /api/auth/registration', 'POST /api/auth/register']);

const everything: PermissionSet = { modules: Object.fromEntries(MODULES.map((m) => [m, [...MODULE_ACTIONS[m]]])), hidden: [] };

// 005 FR-011, FR-013, research R12.
describe('005 permissions', () => {
  it('declares a policy on every route: module:action, owner, authenticated or public', async () => {
    const ctx = await createTestContext();
    const routes = registeredRoutes(ctx.app);
    for (const r of routes) {
      expect(r.policy, `${r.method} ${r.path}`).toMatch(/^(public|authenticated|owner|[a-z.]+:(view|create|edit|delete|export))$/);
    }
    const added = routes.filter((r) => OWNER_005.test(r.path) || PUBLIC_005.has(`${r.method} ${r.path}`));
    expect(added.length).toBe(23); // 2 registration, 15 user routes, 4 template routes, 2 assignee routes
    for (const r of added) {
      const key = `${r.method} ${r.path}`;
      expect(r.policy, key).toBe(PUBLIC_005.has(key) ? 'public' : 'owner');
    }
  });

  it('refuses every Owner route to a worker who has every module (FR-011)', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const worker = await ctx.createWorker({ permissions: everything });
    for (const r of registeredRoutes(ctx.app).filter((route) => route.policy === 'owner')) {
      const path = r.path.replace(/:[A-Za-z]+/g, '00000000-0000-7000-8000-000000000000');
      const res = await worker.request(r.method, path, r.method === 'GET' ? undefined : {});
      expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({ route: `${r.method} ${r.path}`, status: 403 });
    }
  });

  it('declares, per hidden group, the fields it removes (D6)', () => {
    expect(Object.keys(HIDDEN_FIELDS).sort()).toEqual(['bankDetails', 'customerContacts', 'paymentAmounts', 'sellingPrice', 'supplierIdentity', 'supplierPrices']);
    expect(HIDDEN_FIELDS.sellingPrice.order).toEqual(['agreedPrice', 'agreedRate', 'budgetCny', 'itemsTotal', 'priceDifference']);
    expect(HIDDEN_FIELDS.customerContacts.customer).toEqual(['phone', 'email', 'notes']);
    expect(HIDDEN_FIELDS.paymentAmounts.payment).toContain('amount');
  });
});
