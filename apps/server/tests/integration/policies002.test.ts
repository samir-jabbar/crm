import { describe, expect, it } from 'vitest';
import { SENSITIVE_FIELDS } from '../../src/policy/present';
import { registeredRoutes } from '../../src/policy/route';
import { createTestContext } from '../helpers';

const MODULE_ROUTE = /^\/api\/(orders|customers|suppliers)(\/|$)/;

// 002 quickstart V17 / FR-024, ROADMAP D6.
describe('002 permissions', () => {
  it('declares a module/action policy on every new route', async () => {
    const ctx = await createTestContext();
    const routes = registeredRoutes(ctx.app).filter((r) => MODULE_ROUTE.test(r.path));
    expect(routes.length).toBeGreaterThanOrEqual(24);
    for (const r of routes) {
      expect(r.policy, `${r.method} ${r.path}`).toMatch(/^(orders|customers|suppliers):(view|create|edit|delete)$/);
    }
  });

  it('refuses every new route to a worker (Owner-only until 005)', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const worker = await ctx.createWorker();
    const routes = registeredRoutes(ctx.app).filter((r) => MODULE_ROUTE.test(r.path));
    for (const r of routes) {
      const path = r.path.replace(/:[A-Za-z]+/g, '00000000-0000-7000-8000-000000000000');
      const res = await worker.request(r.method, path, r.method === 'GET' ? undefined : {});
      expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({ route: `${r.method} ${r.path}`, status: 403 });
    }
  });

  it('declares the sensitive fields that 005 will hide (research R7)', () => {
    expect(SENSITIVE_FIELDS).toEqual({
      order: ['agreedPrice', 'budgetCny', 'itemsTotal', 'priceDifference'],
      orderItem: ['unitPrice', 'lineTotal', 'supplier'],
    });
  });
});
