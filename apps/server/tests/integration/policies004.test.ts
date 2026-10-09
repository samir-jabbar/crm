import { afterEach, describe, expect, it } from 'vitest';
import { channelRules } from '../../src/policy/authorize';
import { SENSITIVE_FIELDS } from '../../src/policy/present';
import { registeredRoutes } from '../../src/policy/route';
import { createTestContext, seedOrder, seedPayment } from '../helpers';

/** Every route 004 adds. */
const is004Route = (path: string) =>
  /^\/api\/(payments|payment-proofs)(\/|$)/.test(path) ||
  path === '/api/orders/:id/payments' ||
  path === '/api/orders/:id/payment-plan' ||
  path === '/api/settings/payments';

/** Owner-only in 004; feature 005 made them Settings routes that also need both channels (FR-009). */
const SETTINGS_POLICIES: Record<string, string> = { 'GET /api/settings/payments': 'settings:view', 'PATCH /api/settings/payments': 'settings:edit' };

const originalCanUse = channelRules.canUse;
afterEach(() => {
  channelRules.canUse = originalCanUse;
});

// 004 quickstart P19 / FR-028, ROADMAP D6.
describe('004 permissions', () => {
  it('declares a payments:<action> policy on every new route (owner for settings)', async () => {
    const ctx = await createTestContext();
    const routes = registeredRoutes(ctx.app).filter((r) => is004Route(r.path));
    expect(routes.length).toBe(12); // 9 payment routes, 1 proof upload, 2 settings routes
    for (const r of routes) {
      const key = `${r.method} ${r.path}`;
      if (SETTINGS_POLICIES[key]) expect(r.policy, key).toBe(SETTINGS_POLICIES[key]);
      else expect(r.policy, key).toMatch(/^payments:(view|create|edit|delete)$/);
    }
  });

  it('refuses every new route to a worker (Owner-only until 005)', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const worker = await ctx.createWorker();
    for (const r of registeredRoutes(ctx.app).filter((route) => is004Route(route.path))) {
      const path = r.path.replace(/:[A-Za-z]+/g, '00000000-0000-7000-8000-000000000000');
      const res =
        r.path === '/api/payment-proofs'
          ? await worker.upload(path, { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), filename: 'p.jpg', type: 'image/jpeg' })
          : await worker.request(r.method, path, r.method === 'GET' ? undefined : {});
      expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({ route: `${r.method} ${r.path}`, status: 403 });
    }
  });

  it('keeps a channel the viewer may not see out of lists and summaries, and refuses writing to it (research R9)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const direct = await seedPayment(owner, order.id, { channel: 'direct', amount: '57000' });
    await seedPayment(owner, order.id, { channel: 'bank', amount: '1000' });

    // What feature 005 will do for workers: hide the Direct channel.
    channelRules.canUse = (user, channel, action) => channel !== 'direct' && originalCanUse(user, channel, action);
    const { items, summary } = (await owner.get(`/api/orders/${order.id}/payments`)).body;
    expect(items.map((p: any) => p.channel)).toEqual(['bank']);
    expect(summary.channels.map((c: any) => c.channel)).toEqual(['bank']);
    expect(summary.plan.map((s: any) => s.channel)).toEqual(['bank']);
    expect(summary.received).toBe('1000.00');
    expect((await owner.get(`/api/payments/${direct.id}`)).status).toBe(403);
    expect((await owner.delete(`/api/payments/${direct.id}`)).status).toBe(403);
    const create = await owner.post(`/api/orders/${order.id}/payments`, {
      channel: 'direct',
      type: 'deposit',
      amount: '1',
      currency: 'USD',
      paymentDate: '2026-10-07',
      rates: { USD: '7.1', MAD: '0.71' },
    });
    expect(create.status).toBe(403);
    expect((await owner.put(`/api/orders/${order.id}/payment-plan`, { stages: [{ type: 'other', channel: 'bank', percent: '100' }] })).status).toBe(403);
  });

  it('declares the sensitive fields that 005 will hide, derived values included (D6)', () => {
    expect(SENSITIVE_FIELDS).toEqual({
      order: ['agreedPrice', 'budgetCny', 'itemsTotal', 'priceDifference', 'agreedRate', 'financials'],
      orderItem: ['unitPrice', 'lineTotal', 'supplier'],
      expense: ['amount', 'rate', 'cnyAmount'],
      expenseTotals: ['grand', 'unpaid', 'byCategory', 'byAdvancedBy'],
      reimbursement: ['toReimburse'],
      payment: ['amount', 'rates', 'bankConversion', 'marketRate', 'cnyAmount', 'countsAs', 'usdAmount', 'madAmount', 'gap'],
      paymentSummary: [
        'agreedPrice',
        'channels',
        'plan',
        'received',
        'remaining',
        'overpaid',
        'percentPaid',
        'receivedTotals',
        'averageRates',
        'agreedRate',
        'remainingCny',
        'fxResultCny',
        'warnings',
      ],
      planStage: ['amount'],
    });
  });
});
