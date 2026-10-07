import { likePattern, normalizeForSearch } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/db/client';

// 002 research R3 / SC-006: one normalization for SQL and JS.
const CORPUS = ['Éloïse Diallo', 'DOOSAN DX225LC', 'شَرِكَة الدار', 'شركة الدار', '汉景机械', 'ـالدار', 'Ñandú Çağrı'];

describe('search normalization', () => {
  it('strips accents, Arabic marks and tatweel, and lower-cases', () => {
    expect(normalizeForSearch('Éloïse')).toBe('eloise');
    expect(normalizeForSearch('DOOSAN')).toBe('doosan');
    expect(normalizeForSearch('شَرِكَة')).toBe(normalizeForSearch('شركة'));
    expect(normalizeForSearch('ـالدار')).toBe('الدار');
    expect(normalizeForSearch('汉景机械')).toBe('汉景机械');
  });

  it('gives the same result in SQL (hj_norm) and in JS', () => {
    const { sqlite } = openDb(':memory:');
    const stmt = sqlite.prepare('select hj_norm(?) as v');
    for (const text of CORPUS) {
      expect((stmt.get(text) as { v: string }).v, text).toBe(normalizeForSearch(text));
    }
    expect((stmt.get(null) as { v: null }).v).toBeNull();
  });

  it('matches through LIKE with escaped wildcards', () => {
    const { sqlite } = openDb(':memory:');
    const match = (text: string, q: string) =>
      (sqlite.prepare("select hj_norm(?) like ? escape '\\' as m").get(text, likePattern(q)) as { m: number }).m === 1;
    expect(match('Éloïse Diallo', 'eloise')).toBe(true);
    expect(match('شَرِكَة الدار البيضاء', 'شركة')).toBe(true);
    expect(match('汉景机械有限公司', '汉景')).toBe(true);
    expect(match('Discount 50% off', '50%')).toBe(true);
    expect(match('Discount 500 off', '50%')).toBe(false);
    expect(match('a_b', 'a_b')).toBe(true);
    expect(match('axb', 'a_b')).toBe(false);
  });
});
