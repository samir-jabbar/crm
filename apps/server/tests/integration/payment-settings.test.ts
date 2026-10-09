import { describe, expect, it } from 'vitest';
import { createTestContext, seedOrder, seedPayment } from '../helpers';

const SEEDED = {
  channelNames: { direct: null, bank: null },
  defaultPlan: [
    { type: 'deposit', channel: 'direct', percent: '30', dueBeforeStatus: 'in_production' },
    { type: 'balance', channel: 'bank', percent: '70', dueBeforeStatus: 'on_vessel' },
  ],
  banks: ['Bank of China', 'ICBC', 'ABC', 'CCB'],
};

// 004 quickstart P12, P14 / US4, FR-013, FR-027.
describe('payment settings', () => {
  it('starts with the translated channel names, the 30/70 plan and four banks', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    expect((await owner.get('/api/settings/payments')).body).toEqual(SEEDED);
    expect((await owner.get('/api/payments/config')).body).toEqual({
      channels: { direct: { name: null }, bank: { name: null } },
      banks: SEEDED.banks,
    });
  });

  it('gives new orders the changed default plan, and leaves existing orders alone (P12)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const before = await seedOrder(owner);
    const res = await owner.patch('/api/settings/payments', {
      defaultPlan: [
        { type: 'deposit', channel: 'direct', percent: '40', dueBeforeStatus: 'in_production' },
        { type: 'balance', channel: 'bank', percent: '60', dueBeforeStatus: null },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.defaultPlan.map((s: any) => s.percent)).toEqual(['40', '60']);

    const after = await seedOrder(owner);
    const percents = async (id: string) => (await owner.get(`/api/orders/${id}/payments`)).body.summary.plan.map((s: any) => s.percent);
    expect(await percents(after.id)).toEqual(['40', '60']);
    expect(await percents(before.id)).toEqual(['30', '70']);

    const bad = await owner.patch('/api/settings/payments', { defaultPlan: [{ type: 'deposit', channel: 'direct', percent: '50' }] });
    expect(bad.body.error.details.fields).toEqual({ defaultPlan: 'plan_total_invalid' });
  });

  it('renames a channel everywhere, and an empty name brings back the default (P14)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    await owner.patch('/api/settings/payments', { channelNames: { direct: '  Cash and agents ' } });
    expect((await owner.get('/api/payments/config')).body.channels).toEqual({ direct: { name: 'Cash and agents' }, bank: { name: null } });
    const summary = (await owner.get(`/api/orders/${order.id}/payments`)).body.summary;
    expect(summary.channels[0]).toMatchObject({ channel: 'direct', name: 'Cash and agents' });

    await owner.patch('/api/settings/payments', { channelNames: { direct: '' } });
    expect((await owner.get('/api/settings/payments')).body.channelNames).toEqual({ direct: null, bank: null });
    expect((await owner.patch('/api/settings/payments', { channelNames: { bank: 'x'.repeat(41) } })).body.error.details.fields).toEqual({
      'channelNames.bank': 'name_invalid',
    });
  });

  it('replaces the bank list, refusing duplicates, without touching past payments (P14)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const payment = await seedPayment(owner, order.id, {
      bank: { rate: '7.05', name: 'ICBC', rateType: 'buying', at: '2026-10-07T02:30:00.000Z' },
    });

    const res = await owner.patch('/api/settings/payments', { banks: ['Bank of China', 'Bank of Communications', 'CCB'] });
    expect(res.body.banks).toEqual(['Bank of China', 'Bank of Communications', 'CCB']);
    expect((await owner.get(`/api/payments/${payment.id}`)).body.bank.name).toBe('ICBC');

    const duplicate = await owner.patch('/api/settings/payments', { banks: ['CCB', ' ccb '] });
    expect(duplicate.body.error.details.fields).toEqual({ banks: 'name_invalid' });
    expect((await owner.patch('/api/settings/payments', { banks: [''] })).body.error.details.fields).toEqual({ 'banks.0': 'name_invalid' });
  });

  it('audits every change with what changed only, and is for the Owner', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    await owner.patch('/api/settings/payments', { channelNames: { bank: 'Bank (invoiced)' }, banks: ['ICBC'] });
    await owner.patch('/api/settings/payments', { banks: ['ICBC'] }); // no change, no entry
    const entries = ctx.sqlite
      .prepare("select action, before_json, after_json from audit_entries where target_type = 'payment_settings'")
      .all() as { action: string; before_json: string; after_json: string }[];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('settings.updated');
    expect(JSON.parse(entries[0]!.before_json)).toEqual({ channelNames: { direct: null, bank: null }, banks: SEEDED.banks });
    expect(JSON.parse(entries[0]!.after_json)).toEqual({ channelNames: { direct: null, bank: 'Bank (invoiced)' }, banks: ['ICBC'] });

    const worker = await ctx.createWorker();
    expect((await worker.get('/api/settings/payments')).status).toBe(403);
    expect((await worker.patch('/api/settings/payments', { banks: [] })).status).toBe(403);
    expect((await worker.get('/api/payments/config')).status).toBe(403);
  });
});
