import { describe, expect, it } from 'vitest';
import { createTestContext, seedExpense, seedOrder, seedPayment } from '../helpers';

const bankBoc = { rate: '7.05', name: 'Bank of China', rateType: 'buying', at: '2026-10-07T02:30:00.000Z' };

/** The worked example: 190,000 USD at 7.10 with 1,203,500.00 CNY of expenses. */
async function workedExample() {
  const ctx = await createTestContext();
  const owner = await ctx.createOwner();
  const order = await seedOrder(owner);
  await seedExpense(owner, order.id, { amount: '1000000', categoryId: 'cat-equipment_purchase' });
  await seedExpense(owner, order.id, { amount: '203500', categoryId: 'cat-sea_freight' });
  return { ctx, owner, order };
}

const financialsOf = async (owner: any, orderId: string) => (await owner.get(`/api/orders/${orderId}`)).body.financials;

// 004 quickstart P9–P11 / US3, FR-016 – FR-020, D2.
describe('received money, what remains, and the real profit', () => {
  it('equals the 003 profit before any payment (P9)', async () => {
    const { owner, order } = await workedExample();
    expect(await financialsOf(owner, order.id)).toMatchObject({
      profit: '145500.00',
      marginPercent: '10.8',
      received: '0.00',
      remaining: '190000.00',
      remainingCny: '1349000.00',
    });
  });

  it('counts received money at its own value and the rest at the agreed rate (P10)', async () => {
    const { owner, order } = await workedExample();
    await seedPayment(owner, order.id, { channel: 'direct', type: 'deposit', amount: '57000' });

    // Part paid: 404,700 received + 133,000 × 7.1 still to come.
    expect(await financialsOf(owner, order.id)).toMatchObject({
      receivedCny: '404700.00',
      remaining: '133000.00',
      remainingCny: '944300.00',
      profit: '145500.00', // 404,700 + 944,300 − 1,203,500
      percentPaid: '30.0',
      fxResultCny: '0.00',
    });

    await seedPayment(owner, order.id, { channel: 'bank', type: 'balance', amount: '133000', bank: bankBoc });
    expect(await financialsOf(owner, order.id)).toMatchObject({
      received: '190000.00',
      receivedCny: '1342350.00',
      remaining: '0.00',
      remainingCny: '0.00',
      overpaid: '0.00',
      percentPaid: '100.0',
      profit: '138850.00',
      marginPercent: '10.3',
      fxResultCny: '-6650.00',
    });
    const { summary } = (await owner.get(`/api/orders/${order.id}/payments`)).body;
    expect(summary).toMatchObject({
      receivedTotals: { cny: '1342350.00', usd: '190000.00' },
      averageRates: [{ currency: 'USD', rate: '7.065000' }],
      agreedRate: '7.100000',
      fxResultCny: '-6650.00',
      remainingCny: '0.00',
    });
  });

  it('needs the agreed rate only while money remains (P11, FR-018)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    await seedExpense(owner, order.id, { amount: '100000' });
    ctx.sqlite.prepare('update orders set agreed_rate_micro = null where id = ?').run(order.id);

    await seedPayment(owner, order.id, { amount: '57000' });
    expect(await financialsOf(owner, order.id)).toMatchObject({
      profit: null,
      profitUnavailableReason: 'agreed_rate_missing',
      receivedCny: '404700.00',
      remainingCny: null,
      fxResultCny: null,
    });

    await seedPayment(owner, order.id, { amount: '133000' });
    expect(await financialsOf(owner, order.id)).toMatchObject({
      profit: '1249000.00', // 1,349,000 received − 100,000
      profitUnavailableReason: null,
      remainingCny: '0.00',
      fxResultCny: null,
    });
  });

  it('keeps CNY orders simple, and averages each foreign currency on its own', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner, { currency: 'CNY', agreedPrice: '100000', items: [] });
    await seedPayment(owner, order.id, { currency: 'CNY', amount: '30000' });
    await seedPayment(owner, order.id, { currency: 'USD', amount: '1000', rates: { USD: '7.2', MAD: '0.71' } });
    await seedPayment(owner, order.id, { currency: 'USD', amount: '1000', rates: { USD: '7.0', MAD: '0.71' } });
    const { summary } = (await owner.get(`/api/orders/${order.id}/payments`)).body;
    expect(summary).toMatchObject({
      received: '44200.00', // 30,000 + 7,200 + 7,000
      remaining: '55800.00',
      percentPaid: '44.2',
      agreedRate: null,
      fxResultCny: '0.00',
      averageRates: [{ currency: 'USD', rate: '7.100000' }],
    });
  });

  it('leaves deleted payments and the payments of a deleted order out, until restored', async () => {
    const { ctx, owner, order } = await workedExample();
    const payment = await seedPayment(owner, order.id, { amount: '57000' });
    ctx.sqlite.prepare('update payments set deleted_at = 1 where id = ?').run(payment.id);
    expect((await financialsOf(owner, order.id)).received).toBe('0.00');
    ctx.sqlite.prepare('update payments set deleted_at = null where id = ?').run(payment.id);

    expect((await owner.delete(`/api/orders/${order.id}`)).status).toBe(204);
    expect((await owner.get(`/api/payments/${payment.id}`)).status).toBe(404);
    expect((await owner.post(`/api/orders/${order.id}/restore`)).status).toBe(200);
    expect((await financialsOf(owner, order.id)).received).toBe('57000.00');
  });
});
