import { convertToCnyMinor, formatAmount, formatRate, parseAmount, parseRate, percent1, rateDeviates } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';

// 003 research R2 / FR-003: rates are integer micro-units, conversion is exact with half a cent rounded up.
describe('rates', () => {
  it('parses rates into micro-units', () => {
    expect(parseRate('7.1')).toBe(7_100_000);
    expect(parseRate('0.000001')).toBe(1);
    expect(parseRate('9999999.999999')).toBe(9_999_999_999_999);
    expect(parseRate('1')).toBe(1_000_000);
  });

  it('rejects zero, too many decimals or digits, signs, commas and exponents', () => {
    for (const bad of ['0', '0.000000', '1.1234567', '12345678', '-1', '7,1', '1e3', '', ' 7.1', '.5']) {
      expect(() => parseRate(bad), bad).toThrow();
    }
  });

  it('formats rates with 6 decimals and round-trips', () => {
    expect(formatRate(7_100_000)).toBe('7.100000');
    expect(formatRate(1)).toBe('0.000001');
    expect(formatRate(1_000_000n)).toBe('1.000000');
    for (const s of ['7.1', '0.71', '1234567.654321']) expect(parseRate(formatRate(parseRate(s)))).toBe(parseRate(s));
  });
});

describe('conversion to CNY', () => {
  it('multiplies exactly (X2)', () => {
    expect(convertToCnyMinor(parseAmount('1200'), parseRate('7.1'))).toBe(852_000n);
    expect(formatAmount(convertToCnyMinor(parseAmount('1250'), parseRate('7.1')))).toBe('8875.00');
    expect(convertToCnyMinor(350_000, 1_000_000)).toBe(350_000n);
  });

  it('rounds half a cent up and anything below down', () => {
    expect(convertToCnyMinor(1, 500_000)).toBe(1n);
    expect(convertToCnyMinor(1, 499_999)).toBe(0n);
    expect(convertToCnyMinor(3, 1_500_000)).toBe(5n); // 4.5 cents → 5
  });

  it('stays exact at the largest amount and rate', () => {
    const result = convertToCnyMinor(parseAmount('999999999999.99'), parseRate('9999999.999999'));
    // The product ends in …000001 micro-cents: below half a cent, so it rounds down.
    expect(result).toBe((99_999_999_999_999n * 9_999_999_999_999n) / 1_000_000n);
    expect(result > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('formats bigint totals', () => {
    expect(formatAmount(134_900_000n)).toBe('1349000.00');
    expect(formatAmount(-14_550_000n)).toBe('-145500.00');
  });
});

describe('percent1', () => {
  it('rounds to one decimal, half away from zero (X5, X7)', () => {
    expect(percent1(14_550_000, 134_900_000)).toBe('10.8');
    expect(percent1(120_350_000n, 120_000_000n)).toBe('100.3');
    expect(percent1(1, 8)).toBe('12.5');
    expect(percent1(1, 3)).toBe('33.3');
    expect(percent1(0, 5)).toBe('0.0');
  });

  it('keeps the sign of a loss and returns null for a zero denominator', () => {
    expect(percent1(-5, 100)).toBe('-5.0');
    expect(percent1(-1, 8)).toBe('-12.5');
    expect(percent1(-1, 100_000)).toBe('0.0');
    expect(percent1(10, 0)).toBeNull();
  });
});

describe('rate typo warning (FR-005, X11)', () => {
  it('warns above 20% away from the latest rate', () => {
    expect(rateDeviates(parseRate('71.0'), parseRate('7.10'))).toBe(true);
    expect(rateDeviates(parseRate('0.71'), parseRate('7.10'))).toBe(true);
    expect(rateDeviates(parseRate('7.30'), parseRate('7.10'))).toBe(false);
    expect(rateDeviates(parseRate('8.52'), parseRate('7.10'))).toBe(false); // exactly 20%
    expect(rateDeviates(parseRate('7.1'), 0)).toBe(false);
  });
});
