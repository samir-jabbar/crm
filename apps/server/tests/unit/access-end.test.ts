import { describe, expect, it } from 'vitest';
import { accessEnded, chinaToday, parsePermissions } from '../../src/policy/access';

// 005 FR-023: access lasts until the end of the chosen day, China time (UTC+8).
describe('access end date', () => {
  it('changes day at 16:00 UTC', () => {
    expect(chinaToday(Date.parse('2026-11-30T15:59:59Z'))).toBe('2026-11-30');
    expect(chinaToday(Date.parse('2026-11-30T16:00:00Z'))).toBe('2026-12-01');
  });

  it('is inclusive', () => {
    const user = { accessEndsOn: '2026-11-30' };
    expect(accessEnded(user, Date.parse('2026-11-30T15:59:59Z'))).toBe(false);
    expect(accessEnded(user, Date.parse('2026-11-30T16:00:00Z'))).toBe(true);
    expect(accessEnded({ accessEndsOn: null }, Date.parse('2099-01-01T00:00:00Z'))).toBe(false);
  });

  it('treats a missing or broken permission set as no access', () => {
    expect(parsePermissions(null)).toEqual({ modules: {}, hidden: [] });
    expect(parsePermissions('{not json')).toEqual({ modules: {}, hidden: [] });
    expect(parsePermissions('{"modules":{"users":["view"]},"hidden":[]}')).toEqual({ modules: {}, hidden: [] });
    expect(parsePermissions('{"modules":{"expenses":["create"]},"hidden":[]}')).toEqual({ modules: { expenses: ['view', 'create'] }, hidden: [] });
  });
});
