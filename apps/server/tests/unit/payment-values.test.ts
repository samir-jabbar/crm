import { formatAmount, parseAmount, parseRate, paymentGap, paymentValues, type PaymentValueInput } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';

const rates = { USD: parseRate('7.1'), MAD: parseRate('0.71'), EUR: parseRate('7.8') };
const values = (input: Partial<PaymentValueInput> & Pick<PaymentValueInput, 'amountMinor' | 'currency' | 'orderCurrency'>) => {
  const v = paymentValues({ rates, bankRateMicro: null, countsAsMinor: null, ...input });
  return {
    cny: formatAmount(v.cnyMinor),
    order: formatAmount(v.orderMinor),
    manual: v.orderManual,
    usd: formatAmount(v.usdMinor),
    mad: formatAmount(v.madMinor),
  };
};

// 004 research R1, decided 2026-10-08.
describe('paymentValues', () => {
  it('values a CNY payment on a CNY order', () => {
    expect(values({ amountMinor: parseAmount('71000'), currency: 'CNY', orderCurrency: 'CNY' })).toEqual({
      cny: '71000.00',
      order: '71000.00',
      manual: false,
      usd: '10000.00', // 71,000 ÷ 7.1
      mad: '100000.00', // 71,000 ÷ 0.71
    });
  });

  it('values a USD payment on a USD order at the customer rate', () => {
    expect(values({ amountMinor: parseAmount('57000'), currency: 'USD', orderCurrency: 'USD' })).toEqual({
      cny: '404700.00',
      order: '57000.00',
      manual: false,
      usd: '57000.00',
      mad: '570000.00',
    });
  });

  it('counts the CNY that actually arrived when a bank rate is entered (P5)', () => {
    const v = values({ amountMinor: parseAmount('133000'), currency: 'USD', orderCurrency: 'USD', bankRateMicro: parseRate('7.05') });
    expect(v).toEqual({ cny: '937650.00', order: '133000.00', manual: false, usd: '133000.00', mad: '1320633.80' });
  });

  it('converts a payment in another currency through its own rates, or keeps a typed figure (P8)', () => {
    const mad = { amountMinor: parseAmount('570000'), currency: 'MAD', orderCurrency: 'USD' } as const;
    expect(values(mad)).toEqual({ cny: '404700.00', order: '57000.00', manual: false, usd: '57000.00', mad: '570000.00' });
    expect(values({ ...mad, countsAsMinor: parseAmount('56800') })).toMatchObject({ cny: '404700.00', order: '56800.00', manual: true });
    // A same-currency payment always counts for its own amount.
    expect(values({ amountMinor: 100, currency: 'USD', orderCurrency: 'USD', countsAsMinor: 50 })).toMatchObject({ order: '1.00', manual: false });
  });

  it('uses the EUR rate for EUR, and the customer rates (not the bank rate) for "counts as"', () => {
    expect(values({ amountMinor: parseAmount('1000'), currency: 'EUR', orderCurrency: 'USD' })).toMatchObject({
      cny: '7800.00',
      order: '1098.59', // 1,000 × 7.8 ÷ 7.1 = 1,098.591…
    });
    expect(
      values({ amountMinor: parseAmount('1000'), currency: 'USD', orderCurrency: 'CNY', bankRateMicro: parseRate('7.05') }),
    ).toMatchObject({ cny: '7050.00', order: '7100.00' });
    expect(() => paymentValues({ amountMinor: 1, currency: 'EUR', orderCurrency: 'USD', rates: { ...rates, EUR: null }, bankRateMicro: null, countsAsMinor: null })).toThrow();
  });

  it('rounds half up at every step', () => {
    // 0.01 USD at 7.15 = 0.0715 CNY → 0.07; 0.07 CNY ÷ 0.71 = 0.0985… MAD → 0.10
    expect(values({ amountMinor: 1, currency: 'USD', orderCurrency: 'USD', rates: { ...rates, USD: parseRate('7.15') } })).toMatchObject({
      cny: '0.07',
      mad: '0.10',
    });
  });
});

describe('paymentGap', () => {
  it('compares the bank rate with the market rate, in CNY and percent (P5)', () => {
    expect(paymentGap(parseAmount('133000'), parseRate('7.05'), parseRate('7.1'))).toEqual({ cny: -665_000n, percent: '-0.7' });
    expect(paymentGap(parseAmount('100'), parseRate('7.2'), parseRate('7.1'))).toEqual({ cny: 1000n, percent: '1.4' });
  });

  it('is unknown without both rates', () => {
    expect(paymentGap(100, null, parseRate('7.1'))).toBeNull();
    expect(paymentGap(100, parseRate('7.05'), null)).toBeNull();
  });
});
