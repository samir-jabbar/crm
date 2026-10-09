import { describe, expect, it } from 'vitest';
import { createTestContext, seedOrder } from '../helpers';

const planOf = async (owner: any, orderId: string) => (await owner.get(`/api/orders/${orderId}/payments`)).body.summary;
const stage = (type: string, channel: string, percent: string, extra: Record<string, unknown> = {}) => ({ type, channel, percent, ...extra });

// 004 quickstart P13 / US4, FR-012 – FR-015.
describe('payment plan of an order', () => {
  it('splits a stage across channels and recomputes planned amounts per channel (P13)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner); // 190,000 USD
    const res = await owner.put(`/api/orders/${order.id}/payment-plan`, {
      stages: [
        stage('deposit', 'direct', '20', { dueBeforeStatus: 'in_production' }),
        stage('deposit', 'bank', '10', { dueBeforeStatus: 'in_production', dueDate: '2026-11-01' }),
        stage('balance', 'bank', '70', { dueBeforeStatus: 'on_vessel' }),
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.plan.map(({ id: _id, ...s }: any) => s)).toEqual([
      { position: 0, type: 'deposit', channel: 'direct', percent: '20', amount: '38000.00', dueBeforeStatus: 'in_production', dueDate: null },
      { position: 1, type: 'deposit', channel: 'bank', percent: '10', amount: '19000.00', dueBeforeStatus: 'in_production', dueDate: '2026-11-01' },
      { position: 2, type: 'balance', channel: 'bank', percent: '70', amount: '133000.00', dueBeforeStatus: 'on_vessel', dueDate: null },
    ]);
    const summary = await planOf(owner, order.id);
    expect(summary.channels.map((c: any) => [c.channel, c.planned])).toEqual([
      ['direct', '38000.00'],
      ['bank', '152000.00'],
    ]);
  });

  it('refuses a plan that does not total exactly 100% (FR-014)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const put = (stages: unknown) => owner.put(`/api/orders/${order.id}/payment-plan`, { stages });
    expect((await put([stage('deposit', 'direct', '30'), stage('balance', 'bank', '60')])).body.error.details.fields).toEqual({ stages: 'plan_total_invalid' });
    expect((await put([])).body.error.details.fields).toEqual({ stages: 'plan_total_invalid' });
    expect((await put(Array.from({ length: 11 }, () => stage('other', 'bank', '9.09')))).body.error.details.fields).toEqual({ stages: 'plan_total_invalid' });
    expect((await put([stage('deposit', 'direct', '1.234'), stage('balance', 'bank', '98.766')])).body.error.details.fields).toMatchObject({
      'stages.0.percent': 'plan_total_invalid',
    });
    expect((await put([stage('deposit', 'cash', '100')])).body.error.details.fields).toEqual({ 'stages.0.channel': 'channel_invalid' });
    // The plan is unchanged.
    expect((await planOf(owner, order.id)).plan.map((s: any) => s.percent)).toEqual(['30', '70']);
    expect((await owner.put('/api/orders/00000000-0000-7000-8000-000000000000/payment-plan', { stages: [stage('other', 'bank', '100')] })).status).toBe(404);
  });

  it('follows the agreed price and rounds so the stages add up exactly (FR-012)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner, { agreedPrice: '100', items: [] });
    await owner.put(`/api/orders/${order.id}/payment-plan`, {
      stages: [stage('deposit', 'direct', '33.33'), stage('deposit', 'bank', '33.33'), stage('balance', 'bank', '33.34')],
    });
    expect((await planOf(owner, order.id)).plan.map((s: any) => s.amount)).toEqual(['33.33', '33.33', '33.34']);

    const fresh = (await owner.get(`/api/orders/${order.id}`)).body;
    await owner.put(`/api/orders/${order.id}`, {
      title: fresh.title,
      customerId: fresh.customer.id,
      agreedPrice: '200',
      currency: 'USD',
      agreedRate: '7.1',
      items: [],
    });
    expect((await planOf(owner, order.id)).plan.map((s: any) => s.amount)).toEqual(['66.66', '66.66', '66.68']);
  });

  it('audits a plan change with the whole plan before and after', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    await owner.put(`/api/orders/${order.id}/payment-plan`, { stages: [stage('balance', 'bank', '100')] });
    // The same plan again changes nothing and writes nothing.
    await owner.put(`/api/orders/${order.id}/payment-plan`, { stages: [stage('balance', 'bank', '100')] });
    const entries = ctx.sqlite
      .prepare("select before_json, after_json from audit_entries where action = 'record.updated' and target_type = 'order' and target_id = ?")
      .all(order.id) as { before_json: string; after_json: string }[];
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0]!.before_json)).toEqual({
      paymentPlan: [
        { type: 'deposit', channel: 'direct', percent: '30', dueBeforeStatus: 'in_production', dueDate: null },
        { type: 'balance', channel: 'bank', percent: '70', dueBeforeStatus: 'on_vessel', dueDate: null },
      ],
    });
    expect(JSON.parse(entries[0]!.after_json)).toEqual({
      paymentPlan: [{ type: 'balance', channel: 'bank', percent: '100', dueBeforeStatus: null, dueDate: null }],
    });
  });
});
