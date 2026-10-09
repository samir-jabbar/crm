import { describe, expect, it } from 'vitest';
import { DAY_MS, MINUTE_MS } from '../../src/clock';
import { createTestContext, OWNER, seedOrder, seedPayment, TINY_JPEG, type TestContext } from '../helpers';

const auditOf = (ctx: TestContext, id: string) =>
  (
    ctx.sqlite
      .prepare("select action, before_json, after_json from audit_entries where target_type = 'payment' and target_id = ? order by rowid")
      .all(id) as { action: string; before_json: string | null; after_json: string | null }[]
  ).map((r) => ({ action: r.action, before: r.before_json && JSON.parse(r.before_json), after: r.after_json && JSON.parse(r.after_json) }));

/** The payment as a full PUT body, with some fields changed. */
const body = (p: any, patch: Record<string, unknown> = {}) => ({
  channel: p.channel,
  type: p.type,
  amount: p.amount,
  currency: p.currency,
  paymentDate: p.paymentDate,
  reference: p.reference,
  rates: p.rates,
  rateSource: p.rateSource,
  ratesFetchedAt: p.ratesFetchedAt,
  bank: p.bank,
  countsAs: p.countsAs.manual ? p.countsAs.amount : null,
  proofId: p.proofId,
  notes: p.notes,
  ...patch,
});

// 004 quickstart P18 / US6, FR-024 – FR-026.
describe('edit, delete and restore payments', () => {
  it('recomputes the values on edit and audits only what changed (P18)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const bank = { rate: '7.05', name: 'Bank of China', rateType: 'buying', at: '2026-10-07T02:30:00.000Z' };
    const payment = await seedPayment(owner, order.id, { amount: '133000', bank });

    ctx.clock.advance(MINUTE_MS);
    const res = await owner.put(`/api/payments/${payment.id}`, body(payment, { amount: '130000' }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amount: '130000.00',
      cnyAmount: '916500.00',
      countsAs: { amount: '130000.00', manual: false },
      usdAmount: '130000.00',
      madAmount: '1290845.07',
      updatedBy: 'hicham',
    });
    expect(res.body.updatedAt).not.toBe(payment.updatedAt);
    expect((await owner.get(`/api/orders/${order.id}`)).body.financials).toMatchObject({ received: '130000.00', receivedCny: '916500.00' });
    expect(auditOf(ctx, payment.id).at(-1)).toEqual({
      action: 'record.updated',
      before: { amount: '133000.00', cnyAmount: '937650.00', countsAs: '133000.00' },
      after: { amount: '130000.00', cnyAmount: '916500.00', countsAs: '130000.00' },
    });
    // An unchanged save writes nothing.
    await owner.put(`/api/payments/${payment.id}`, body(res.body));
    expect(auditOf(ctx, payment.id)).toHaveLength(2);
  });

  it('keeps a typed "counts as" while it is sent, and recomputes it when cleared', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const mad = await seedPayment(owner, order.id, { channel: 'direct', amount: '570000', currency: 'MAD', countsAs: '56800' });
    const changedRate = await owner.put(`/api/payments/${mad.id}`, body(mad, { rates: { USD: '7.1', MAD: '0.72', EUR: null } }));
    expect(changedRate.body).toMatchObject({ countsAs: { amount: '56800.00', manual: true }, cnyAmount: '410400.00' });
    const cleared = await owner.put(`/api/payments/${mad.id}`, body(changedRate.body, { countsAs: null }));
    expect(cleared.body.countsAs).toEqual({ amount: '57802.82', currency: 'USD', manual: false }); // 570,000 × 0.72 ÷ 7.1
  });

  it('refreshes the market rate only when the date or the currency changes', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const insert = ctx.sqlite.prepare(
      "insert into exchange_rates (provider, rate_date, currency, rate_micro, fetched_at) values ('currency_api', ?, ?, ?, 0)",
    );
    insert.run('2026-10-01', 'USD', 7_000_000);
    const payment = await seedPayment(owner, order.id, { paymentDate: '2026-10-02' });
    expect(payment.marketRate).toEqual({ rate: '7.000000', rateDate: '2026-10-01' });

    insert.run('2026-10-03', 'USD', 7_200_000);
    const sameDate = await owner.put(`/api/payments/${payment.id}`, body(payment, { reference: 'X-1' }));
    expect(sameDate.body.marketRate).toEqual({ rate: '7.000000', rateDate: '2026-10-01' });
    const newDate = await owner.put(`/api/payments/${payment.id}`, body(sameDate.body, { paymentDate: '2026-10-04' }));
    expect(newDate.body.marketRate).toEqual({ rate: '7.200000', rateDate: '2026-10-03' });
  });

  it('deletes recoverably and restores unchanged (FR-025)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const keep = await seedPayment(owner, order.id, { amount: '1000' });
    const twice = await seedPayment(owner, order.id, { amount: '57000' });

    expect((await owner.delete(`/api/payments/${twice.id}`)).status).toBe(204);
    expect((await owner.delete(`/api/payments/${twice.id}`)).status).toBe(404);
    expect((await owner.get(`/api/payments/${twice.id}`)).status).toBe(404);
    const list = (await owner.get(`/api/orders/${order.id}/payments`)).body;
    expect(list.items.map((p: any) => p.id)).toEqual([keep.id]);
    expect(list.summary.received).toBe('1000.00');
    expect((await owner.get(`/api/orders/${order.id}`)).body.financials.received).toBe('1000.00');

    const deleted = (await owner.get(`/api/orders/${order.id}/payments?deleted=true`)).body;
    expect(deleted.items.map((p: any) => p.id)).toEqual([twice.id]);
    expect(deleted.summary.received).toBe('1000.00');

    const restored = await owner.post(`/api/payments/${twice.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body).toEqual({ ...twice, deletedAt: null });
    expect((await owner.get(`/api/orders/${order.id}/payments`)).body.summary.received).toBe('58000.00');
    expect(auditOf(ctx, twice.id).map((a) => a.action)).toEqual(['record.created', 'record.deleted', 'record.restored']);
    expect((await owner.post(`/api/payments/${keep.id}/restore`)).status).toBe(404);
  });

  it('refuses changes to the payments of a deleted order, and unlinks a removed proof', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const upload = await owner.upload('/api/payment-proofs', { bytes: TINY_JPEG, filename: 'slip.jpg', type: 'image/jpeg' });
    const payment = await seedPayment(owner, order.id, { proofId: upload.body.id });

    expect((await owner.put(`/api/payments/${payment.id}`, body(payment, { notes: 'kept' }))).body.hasProof).toBe(true);
    const unlinked = await owner.put(`/api/payments/${payment.id}`, body(payment, { proofId: null }));
    expect(unlinked.body).toMatchObject({ hasProof: false, proofId: null });

    ctx.clock.advance(DAY_MS + MINUTE_MS);
    const later = ctx.client();
    await later.post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
    await later.upload('/api/payment-proofs', { bytes: TINY_JPEG, filename: 'x.jpg', type: 'image/jpeg' });
    expect(ctx.sqlite.prepare('select count(*) as n from files where id = ?').get(upload.body.id)).toEqual({ n: 0 });

    expect((await later.delete(`/api/orders/${order.id}`)).status).toBe(204);
    expect((await later.put(`/api/payments/${payment.id}`, body(unlinked.body, { amount: '1' }))).status).toBe(404);
    expect((await later.delete(`/api/payments/${payment.id}`)).status).toBe(404);
  });
});
