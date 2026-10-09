import { describe, expect, it } from 'vitest';
import { createTestContext, fakeRates, seedOrder, seedPayment } from '../helpers';

const bankBoc = { rate: '7.05', name: 'Bank of China', rateType: 'buying', at: '2026-10-07T02:30:00.000Z' };

// 004 quickstart P5–P8 / US2, FR-006 – FR-011, AC3, research R1–R3.
describe('payment rates and the bank conversion', () => {
  it('counts the CNY that actually arrived and compares the bank with the market (P5, AC3)', async () => {
    const rates = fakeRates();
    const ctx = await createTestContext({}, { http: rates.http });
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    await owner.get('/api/rates?currency=USD'); // the market rates of 2026-10-07 are now cached
    const callsBeforeSave = rates.calls.length;

    const payment = await seedPayment(owner, order.id, {
      amount: '133000',
      rateSource: 'auto',
      ratesFetchedAt: '2026-10-07T02:31:00.000Z',
      bank: bankBoc,
    });
    expect(payment).toMatchObject({
      cnyAmount: '937650.00',
      countsAs: { amount: '133000.00', currency: 'USD', manual: false },
      usdAmount: '133000.00',
      madAmount: '1320633.80',
      marketRate: { rate: '7.100000', rateDate: '2026-10-07' },
      bank: { rate: '7.050000', name: 'Bank of China', rateType: 'buying', at: '2026-10-07T02:30:00.000Z' },
      gap: { cny: '-6650.00', percent: '-0.7' },
      rateSource: 'auto',
      ratesFetchedAt: '2026-10-07T02:31:00.000Z',
    });
    // Saving never calls the provider (research R3).
    expect(rates.calls.length).toBe(callsBeforeSave);
  });

  it('keeps every rate and value when market rates move (P6, SC-003)', async () => {
    const rates = fakeRates();
    const ctx = await createTestContext({}, { http: rates.http });
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    await owner.get('/api/rates?currency=USD');
    const payment = await seedPayment(owner, order.id, { amount: '133000', bank: bankBoc });

    rates.state.dates['2026-10-07'] = { USD: '7.25', MAD: '0.73', EUR: '7.9' };
    expect((await owner.post('/api/rates/refresh')).body.rates[0].rate).toBe('7.250000');
    expect((await owner.get(`/api/payments/${payment.id}`)).body).toEqual(payment);
  });

  it('converts a payment in another currency through its own rates, with a manual override (P8)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner); // USD
    const mad = await seedPayment(owner, order.id, { channel: 'direct', amount: '570000', currency: 'MAD' });
    expect(mad).toMatchObject({ cnyAmount: '404700.00', countsAs: { amount: '57000.00', currency: 'USD', manual: false }, madAmount: '570000.00' });

    const typed = await seedPayment(owner, order.id, { channel: 'direct', amount: '570000', currency: 'MAD', countsAs: '56800' });
    expect(typed).toMatchObject({ cnyAmount: '404700.00', countsAs: { amount: '56800.00', currency: 'USD', manual: true } });

    const sameCurrency = await owner.post(`/api/orders/${order.id}/payments`, {
      channel: 'bank',
      type: 'balance',
      amount: '10',
      currency: 'USD',
      paymentDate: '2026-10-07',
      rates: { USD: '7.1', MAD: '0.71' },
      countsAs: '9',
    });
    expect(sameCurrency.body.error.details.fields).toEqual({ countsAs: 'amount_invalid' });

    const summary = (await owner.get(`/api/orders/${order.id}/payments`)).body.summary;
    expect(summary.received).toBe('113800.00'); // 57,000 + 56,800
  });

  it('takes the bank block whole, and never for CNY (FR-008)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const base = { channel: 'bank', type: 'balance', amount: '10', currency: 'USD', paymentDate: '2026-10-07', rates: { USD: '7.1', MAD: '0.71' } };
    const incomplete = await owner.post(`/api/orders/${order.id}/payments`, { ...base, bank: { rate: '7.05', name: 'ICBC' } });
    expect(incomplete.body.error.details.fields).toMatchObject({ 'bank.rateType': 'bank_rate_incomplete', 'bank.at': 'bank_rate_incomplete' });
    const badRate = await owner.post(`/api/orders/${order.id}/payments`, { ...base, bank: { ...bankBoc, rate: '0' } });
    expect(badRate.body.error.details.fields).toEqual({ 'bank.rate': 'rate_invalid' });
    const cny = await owner.post(`/api/orders/${order.id}/payments`, { ...base, currency: 'CNY', bank: bankBoc });
    expect(cny.body.error.details.fields).toEqual({ bank: 'bank_rate_incomplete' });
  });

  it('requires the EUR rate on EUR orders, and leaves the comparison out without a market rate', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const eurOrder = await seedOrder(owner, { currency: 'EUR', agreedRate: '7.8' });
    const base = { channel: 'bank', type: 'balance', amount: '100', currency: 'USD', paymentDate: '2026-10-07', rates: { USD: '7.1', MAD: '0.71' } };
    const missing = await owner.post(`/api/orders/${eurOrder.id}/payments`, base);
    expect(missing.body.error.details.fields).toEqual({ 'rates.EUR': 'rate_required' });
    const ok = await seedPayment(owner, eurOrder.id, { ...base, rates: { USD: '7.1', MAD: '0.71', EUR: '7.8' }, bank: bankBoc });
    // 100 USD × 7.1 ÷ 7.8 = 91.03 EUR; nothing cached, so no market rate and no gap.
    expect(ok).toMatchObject({ countsAs: { amount: '91.03', currency: 'EUR' }, marketRate: null, gap: null, cnyAmount: '705.00' });
  });
});
