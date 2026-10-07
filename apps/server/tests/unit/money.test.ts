import { formatAmount, isAmount, lineTotalMinor, parseAmount, sumMinor } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';

// 002 research R1 / constitution I: exact money, no floats.
describe('money', () => {
  it('parses decimal strings into minor units', () => {
    expect(parseAmount('190000')).toBe(19_000_000);
    expect(parseAmount('190000.5')).toBe(19_000_050);
    expect(parseAmount('0.01')).toBe(1);
    expect(parseAmount('999999999999.99')).toBe(99_999_999_999_999);
  });

  it('rejects anything that is not a plain non-negative amount', () => {
    for (const bad of ['1.234', '-5', '1e5', 'abc', '', '1,000', ' 1']) {
      expect(isAmount(bad), bad).toBe(false);
      expect(() => parseAmount(bad), bad).toThrow();
    }
  });

  it('formats minor units back to two decimals', () => {
    expect(formatAmount(18_250_000)).toBe('182500.00');
    expect(formatAmount(5)).toBe('0.05');
    expect(formatAmount(-750_000)).toBe('-7500.00');
    expect(formatAmount(0)).toBe('0.00');
  });

  it('keeps line totals and sums exact', () => {
    // 0.1 + 0.2 style traps never happen with integers.
    expect(sumMinor([parseAmount('0.1'), parseAmount('0.2')])).toBe(30);
    expect(formatAmount(lineTotalMinor(3, parseAmount('19.99')))).toBe('59.97');
    expect(formatAmount(lineTotalMinor(99_999, parseAmount('999999.99')))).toBe('99998999000.01');
    expect(formatAmount(sumMinor([lineTotalMinor(2, 8_500_000), lineTotalMinor(1, 1_250_000)]))).toBe('182500.00');
  });
});
