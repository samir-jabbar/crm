import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/clock';
import { createTestContext, seedOrder, seedPayment } from '../helpers';

const channelOf = (summary: any, channel: string) => summary.channels.find((c: any) => c.channel === channel);

// 004 quickstart P1, P2, P4 / US1, FR-001 – FR-005, FR-013 – FR-016.
describe('record payments in two channels', () => {
  it('tracks planned, received and remaining per channel and in total (P1, AC2)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner); // 190,000 USD at 7.1, default plan 30% Direct / 70% Bank

    const empty = (await owner.get(`/api/orders/${order.id}/payments`)).body;
    expect(empty.items).toEqual([]);
    expect(channelOf(empty.summary, 'direct')).toEqual({ channel: 'direct', name: null, planned: '57000.00', received: '0.00', remaining: '57000.00' });
    expect(channelOf(empty.summary, 'bank')).toEqual({ channel: 'bank', name: null, planned: '133000.00', received: '0.00', remaining: '133000.00' });
    expect(empty.summary).toMatchObject({ currency: 'USD', agreedPrice: '190000.00', received: '0.00', remaining: '190000.00', percentPaid: '0.0' });

    const deposit = await seedPayment(owner, order.id, { channel: 'direct', type: 'deposit', amount: '57000' });
    expect(deposit).toMatchObject({
      orderId: order.id,
      channel: 'direct',
      type: 'deposit',
      amount: '57000.00',
      currency: 'USD',
      paymentDate: '2026-10-07',
      reference: null,
      rates: { USD: '7.100000', MAD: '0.710000', EUR: null },
      rateSource: 'manual',
      ratesFetchedAt: null,
      bank: null,
      cnyAmount: '404700.00',
      countsAs: { amount: '57000.00', currency: 'USD', manual: false },
      usdAmount: '57000.00',
      madAmount: '570000.00',
      hasProof: false,
      createdBy: 'hicham',
      updatedBy: 'hicham',
      deletedAt: null,
    });

    const after = (await owner.get(`/api/orders/${order.id}/payments`)).body.summary;
    expect(channelOf(after, 'direct')).toMatchObject({ planned: '57000.00', received: '57000.00', remaining: '0.00' });
    expect(channelOf(after, 'bank')).toMatchObject({ planned: '133000.00', received: '0.00', remaining: '133000.00' });
    expect(after).toMatchObject({ received: '57000.00', remaining: '133000.00', overpaid: '0.00', percentPaid: '30.0' });

    await seedPayment(owner, order.id, { channel: 'bank', type: 'balance', amount: '133000' });
    const paid = (await owner.get(`/api/orders/${order.id}/payments`)).body.summary;
    expect(channelOf(paid, 'direct').remaining).toBe('0.00');
    expect(channelOf(paid, 'bank').remaining).toBe('0.00');
    expect(paid).toMatchObject({ received: '190000.00', remaining: '0.00', percentPaid: '100.0' });
  });

  it('lists the history newest first, with rates, CNY and source (P2, FR-005)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const first = await seedPayment(owner, order.id, { paymentDate: '2026-10-01', reference: 'CASH-1' });
    ctx.clock.advance(MINUTE_MS);
    const second = await seedPayment(owner, order.id, { paymentDate: '2026-10-05', rateSource: 'auto', ratesFetchedAt: '2026-10-05T08:00:00.000Z' });
    ctx.clock.advance(MINUTE_MS);
    const third = await seedPayment(owner, order.id, { paymentDate: '2026-10-05', currency: 'MAD', amount: '7100' });

    const { items } = (await owner.get(`/api/orders/${order.id}/payments`)).body;
    expect(items.map((p: any) => p.id)).toEqual([third.id, second.id, first.id]);
    expect(items[1]).toMatchObject({ rateSource: 'auto', ratesFetchedAt: '2026-10-05T08:00:00.000Z', rates: { USD: '7.100000', MAD: '0.710000' } });
    expect(items[0]).toMatchObject({ currency: 'MAD', cnyAmount: '5041.00', countsAs: { amount: '710.00', currency: 'USD', manual: false } });
    expect(items[2].reference).toBe('CASH-1');
    expect((await owner.get(`/api/payments/${second.id}`)).body).toEqual(second);
  });

  it('returns every missing or invalid field at once, as translatable codes (P4)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const empty = await owner.post(`/api/orders/${order.id}/payments`, { rates: {}, proofId: 'nope', channel: 'cash' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.details.fields).toEqual({
      channel: 'channel_invalid',
      type: 'payment_type_invalid',
      amount: 'amount_invalid',
      currency: 'currency_invalid',
      paymentDate: 'date_invalid',
      'rates.USD': 'rate_required',
      'rates.MAD': 'rate_required',
    });

    const base = { channel: 'bank', type: 'balance', amount: '10', currency: 'USD', paymentDate: '2026-10-07', rates: { USD: '7.1', MAD: '0.71' } };
    const cases: [Record<string, unknown>, string, string][] = [
      [{ amount: '0' }, 'amount', 'amount_invalid'],
      [{ rates: { USD: '7.1234567', MAD: '0.71' } }, 'rates.USD', 'rate_invalid'],
      [{ rates: { USD: '7.1', MAD: '0' } }, 'rates.MAD', 'rate_invalid'],
      [{ currency: 'EUR' }, 'rates.EUR', 'rate_required'],
      [{ reference: 'x'.repeat(81) }, 'reference', 'text_too_long'],
      [{ proofId: 'missing' }, 'proofId', 'proof_invalid'],
      [{ ratesFetchedAt: 'yesterday' }, 'ratesFetchedAt', 'date_invalid'],
    ];
    for (const [patch, field, code] of cases) {
      const res = await owner.post(`/api/orders/${order.id}/payments`, { ...base, ...patch });
      expect({ patch, status: res.status, error: res.body.error?.details?.fields?.[field] }).toEqual({ patch, status: 400, error: code });
    }
  });

  it('copies the default plan into new orders and the source plan into duplicates (FR-013)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const { plan } = (await owner.get(`/api/orders/${order.id}/payments`)).body.summary;
    expect(plan.map(({ id: _id, ...stage }: any) => stage)).toEqual([
      { position: 0, type: 'deposit', channel: 'direct', percent: '30', amount: '57000.00', dueBeforeStatus: 'in_production', dueDate: null },
      { position: 1, type: 'balance', channel: 'bank', percent: '70', amount: '133000.00', dueBeforeStatus: 'on_vessel', dueDate: null },
    ]);
    const copy = (await owner.post(`/api/orders/${order.id}/duplicate`, { titleSuffix: ' (copy)' })).body;
    const copied = (await owner.get(`/api/orders/${copy.id}/payments`)).body.summary.plan;
    expect(copied.map((s: any) => [s.type, s.channel, s.percent])).toEqual([
      ['deposit', 'direct', '30'],
      ['balance', 'bank', '70'],
    ]);
    expect(copied[0].id).not.toBe(plan[0].id);
  });

  it('refuses unknown and deleted orders, and audits every creation', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const payment = await seedPayment(owner, order.id, { amount: '1200' });
    const entry = ctx.sqlite
      .prepare("select action, after_json from audit_entries where target_type = 'payment' and target_id = ?")
      .get(payment.id) as { action: string; after_json: string };
    expect(entry.action).toBe('record.created');
    expect(JSON.parse(entry.after_json)).toMatchObject({
      orderId: order.id,
      channel: 'bank',
      amount: '1200.00',
      currency: 'USD',
      rates: { USD: '7.100000', MAD: '0.710000', EUR: null },
      cnyAmount: '8520.00',
      countsAs: '1200.00',
    });

    const unknown = '00000000-0000-7000-8000-000000000000';
    expect((await owner.post(`/api/orders/${unknown}/payments`, {})).status).toBe(404);
    expect((await owner.get(`/api/orders/${unknown}/payments`)).status).toBe(404);
    expect((await owner.delete(`/api/orders/${order.id}`)).status).toBe(204);
    expect((await owner.get(`/api/orders/${order.id}/payments`)).status).toBe(404);
    expect((await owner.get(`/api/payments/${payment.id}`)).status).toBe(404);
  });
});
