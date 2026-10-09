import { describe, expect, it } from 'vitest';
import { SENSITIVE_FIELDS } from '../../src/policy/present';
import { registeredRoutes } from '../../src/policy/route';
import { createTestContext } from '../helpers';

/** Every route 003 adds. */
const is003Route = (path: string) =>
  /^\/api\/(expenses|receipts|expense-categories|rates)(\/|$)/.test(path) ||
  path === '/api/orders/:id/expenses' ||
  path === '/api/settings/exchange-rates';

/** Market rates are not sensitive and every rate field needs them (research R10). */
const AUTHENTICATED = new Set(['GET /api/rates', 'GET /api/rates/config']);
/** Owner-only in 003; feature 005 made them grantable through the Settings and Exchange rates modules (FR-009). */
const SETTINGS_POLICIES: Record<string, string> = {
  'POST /api/expense-categories': 'settings:edit',
  'PATCH /api/expense-categories/:id': 'settings:edit',
  'POST /api/rates/refresh': 'rates:edit',
  'GET /api/settings/exchange-rates': 'rates:view',
  'PATCH /api/settings/exchange-rates': 'rates:edit',
};

// 003 quickstart X18 / FR-023, ROADMAP D6.
describe('003 permissions', () => {
  it('declares a policy on every new route: expenses:<action>, owner, or authenticated for rates', async () => {
    const ctx = await createTestContext();
    const routes = registeredRoutes(ctx.app).filter((r) => is003Route(r.path));
    expect(routes.length).toBe(20); // 11 expense, 1 receipt, 3 category and 5 rate routes
    for (const r of routes) {
      const key = `${r.method} ${r.path}`;
      if (SETTINGS_POLICIES[key]) expect(r.policy, key).toBe(SETTINGS_POLICIES[key]);
      else expect(r.policy, key).toMatch(AUTHENTICATED.has(key) ? /^authenticated$/ : /^expenses:(view|create|edit|delete)$/);
    }
  });

  it('refuses every new route to a worker except reading rates (Owner-only until 005)', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const worker = await ctx.createWorker();
    for (const r of registeredRoutes(ctx.app).filter((route) => is003Route(route.path))) {
      const key = `${r.method} ${r.path}`;
      const path = r.path.replace(/:[A-Za-z]+/g, '00000000-0000-7000-8000-000000000000');
      const res =
        r.path === '/api/receipts' ? await worker.upload(path, { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), filename: 'r.jpg', type: 'image/jpeg' })
        : await worker.request(r.method, path, r.method === 'GET' ? undefined : {});
      if (AUTHENTICATED.has(key)) expect({ key, status: res.status }).not.toEqual({ key, status: 403 });
      else expect({ key, status: res.status }).toEqual({ key, status: 403 });
    }
  });

  it('declares the sensitive fields that 005 will hide, derived values included (FR-023, D6)', () => {
    // 004 adds payment entries; the exact full map is asserted in policies004.
    expect(SENSITIVE_FIELDS).toMatchObject({
      order: ['agreedPrice', 'budgetCny', 'itemsTotal', 'priceDifference', 'agreedRate', 'financials'],
      orderItem: ['unitPrice', 'lineTotal', 'supplier'],
      expense: ['amount', 'rate', 'cnyAmount'],
      expenseTotals: ['grand', 'unpaid', 'byCategory', 'byAdvancedBy'],
      reimbursement: ['toReimburse'],
    });
  });
});
