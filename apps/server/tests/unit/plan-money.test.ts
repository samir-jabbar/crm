import { averageRateMicro, formatPercent, mulDivRound, parsePercent, planAmounts } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';

// 004 research R1/R4/R5: exact half-up division, plan percentages in basis points, average rates.
describe('mulDivRound', () => {
  it('rounds half up and stays exact for large values', () => {
    expect(mulDivRound(1, 1, 2)).toBe(1n);
    expect(mulDivRound(1, 1, 3)).toBe(0n);
    expect(mulDivRound(2, 1, 3)).toBe(1n);
    expect(mulDivRound(5_700_000, 7_100_000, 7_100_000)).toBe(5_700_000n);
    // 570,000.00 MAD at 0.71 ÷ 7.10 = 57,000.00 USD
    expect(mulDivRound(57_000_000, 710_000, 7_100_000)).toBe(5_700_000n);
    expect(mulDivRound(99_999_999_999_999n, 9_999_999_999_999n, 1n)).toBe(99_999_999_999_999n * 9_999_999_999_999n);
  });

  it('refuses a zero divisor and negative inputs', () => {
    expect(() => mulDivRound(1, 1, 0)).toThrow();
    expect(() => mulDivRound(-1, 1, 2)).toThrow();
  });
});

describe('plan percentages', () => {
  it('parses percentages into basis points', () => {
    expect(parsePercent('30')).toBe(3000);
    expect(parsePercent('12.5')).toBe(1250);
    expect(parsePercent('0.01')).toBe(1);
    expect(parsePercent('100')).toBe(10_000);
    expect(parsePercent('33.33')).toBe(3333);
  });

  it('rejects zero, more than 100, too many decimals, signs and text', () => {
    for (const bad of ['0', '0.00', '100.01', '1.234', '-5', 'abc', '', '1e2', '1000']) {
      expect(() => parsePercent(bad), bad).toThrow();
    }
  });

  it('formats basis points in their shortest form and round-trips', () => {
    expect(formatPercent(3000)).toBe('30');
    expect(formatPercent(1250)).toBe('12.5');
    expect(formatPercent(1)).toBe('0.01');
    expect(formatPercent(10_000)).toBe('100');
    for (const s of ['30', '12.5', '33.33', '0.01']) expect(formatPercent(parsePercent(s))).toBe(s);
  });

  it('splits the agreed price exactly, the last stage taking the rounding difference', () => {
    expect(planAmounts(19_000_000, [3000, 7000])).toEqual([5_700_000n, 13_300_000n]);
    const thirds = planAmounts(100, [3333, 3333, 3334]);
    expect(thirds).toEqual([33n, 33n, 34n]);
    expect(thirds.reduce((a, b) => a + b, 0n)).toBe(100n);
    const odd = planAmounts(1, [5000, 5000]);
    expect(odd.reduce((a, b) => a + b, 0n)).toBe(1n);
    expect(planAmounts(12_345, [10_000])).toEqual([12_345n]);
    expect(planAmounts(0, [3000, 7000])).toEqual([0n, 0n]);
  });
});

describe('averageRateMicro', () => {
  it('is total CNY ÷ total amount, as a micro-rate (P10)', () => {
    expect(averageRateMicro(134_235_000, 19_000_000)).toBe(7_065_000n);
    expect(averageRateMicro(852_000, 120_000)).toBe(7_100_000n);
    expect(averageRateMicro(0, 0)).toBeNull();
  });
});
