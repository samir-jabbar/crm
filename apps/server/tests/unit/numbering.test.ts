import { describe, expect, it } from 'vitest';
import { chinaYear, formatOrderNumber } from '../../src/orders/numbering';

// 002 FR-009 / research R2.
describe('order numbering', () => {
  it('uses the calendar year in China time', () => {
    expect(chinaYear(Date.parse('2026-12-31T16:30:00Z'))).toBe(2027); // 00:30 on 1 Jan in Shanghai
    expect(chinaYear(Date.parse('2026-12-31T15:59:59Z'))).toBe(2026); // 23:59 on 31 Dec in Shanghai
    expect(chinaYear(Date.parse('2026-06-01T00:00:00Z'))).toBe(2026);
  });

  it('formats prefix-year-counter with at least three digits', () => {
    expect(formatOrderNumber('HJ', 2026, 7)).toBe('HJ-2026-007');
    expect(formatOrderNumber('HJ', 2026, 42)).toBe('HJ-2026-042');
    expect(formatOrderNumber('HJM', 2026, 1000)).toBe('HJM-2026-1000');
  });
});
