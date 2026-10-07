import { beforeAll, describe, expect, it } from 'vitest';
import {
  checkPasswordPolicy,
  configurePasswordHashing,
  hashPassword,
  isCommonPassword,
  verifyAgainstDummy,
  verifyPassword,
} from '../../src/auth/password';

beforeAll(() => configurePasswordHashing({ memoryCost: 1024, timeCost: 1 }));

describe('password policy (FR-008)', () => {
  it('rejects passwords shorter than 10 characters', () => {
    expect(checkPasswordPolicy('short-pw1')).toBe('password_too_short');
  });

  it('rejects passwords longer than 128 characters', () => {
    expect(checkPasswordPolicy('x'.repeat(129))).toBe('password_too_long');
  });

  it('rejects common passwords case-insensitively', () => {
    expect(isCommonPassword('1234567890')).toBe(true);
    expect(checkPasswordPolicy('QWERTYUIOP')).toBe('password_too_common');
  });

  it('accepts a long uncommon password', () => {
    expect(checkPasswordPolicy('Correct-Horse-Battery-9')).toBeNull();
  });
});

describe('argon2id hashing', () => {
  it('round-trips and never stores the plain password', async () => {
    const hash = await hashPassword('Correct-Horse-Battery-9');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('Correct-Horse');
    expect(await verifyPassword(hash, 'Correct-Horse-Battery-9')).toBe(true);
    expect(await verifyPassword(hash, 'correct-horse-battery-9')).toBe(false);
  });

  it('dummy verification (unknown usernames) always fails', async () => {
    expect(await verifyAgainstDummy('anything-at-all')).toBe(false);
  });
});
