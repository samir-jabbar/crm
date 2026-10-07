import { describe, expect, it } from 'vitest';
import { newId } from '../../src/lib/ids';

describe('newId (UUIDv7)', () => {
  it('produces valid version-7 UUIDs', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('sorts in creation order, even within the same millisecond', () => {
    const ids = Array.from({ length: 5000 }, () => newId(1_800_000_000_000));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
