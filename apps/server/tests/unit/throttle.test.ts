import { describe, expect, it } from 'vitest';
import { recordSignInAttempt } from '../../src/auth/attempts';
import { checkThrottle } from '../../src/auth/throttle';
import { MINUTE_MS } from '../../src/clock';
import { createTestContext } from '../helpers';

const ctxFor = (ip: string) => ({ ip, userAgent: 'test', deviceLabel: 'Test', location: null });

async function setup() {
  const t = await createTestContext();
  const fail = (username: string, ip: string) =>
    recordSignInAttempt(t.db, t.clock, {
      usernameInput: username,
      usernameNormalized: username,
      userId: null,
      outcome: 'failure',
      reason: 'invalid_credentials',
      ctx: ctxFor(ip),
    });
  return { ...t, fail };
}

// FR-011 / research R6.
describe('guessing blocks', () => {
  it('allows four failures', async () => {
    const t = await setup();
    for (let i = 0; i < 4; i++) t.fail('hicham', '1.1.1.1');
    expect(checkThrottle(t.db, t.clock, { usernameNormalized: 'hicham', ip: '2.2.2.2' }).blocked).toBe(false);
  });

  it('blocks the account after five failures within 15 minutes, with the right retry time', async () => {
    const t = await setup();
    for (let i = 0; i < 5; i++) {
      t.fail('hicham', `10.0.0.${i}`);
      t.clock.advance(MINUTE_MS);
    }
    // Oldest failure was 5 minutes ago → 10 minutes left.
    const result = checkThrottle(t.db, t.clock, { usernameNormalized: 'hicham', ip: '9.9.9.9' });
    expect(result).toEqual({ blocked: true, reason: 'account_blocked', retryAfterSeconds: 600 });
  });

  it('blocks a network origin that tries many usernames', async () => {
    const t = await setup();
    for (const name of ['a', 'b', 'c', 'd', 'e']) t.fail(name, '6.6.6.6');
    const result = checkThrottle(t.db, t.clock, { usernameNormalized: 'hicham', ip: '6.6.6.6' });
    expect(result).toMatchObject({ blocked: true, reason: 'ip_blocked' });
  });

  it('ignores failures older than 15 minutes and lifts the block by itself', async () => {
    const t = await setup();
    for (let i = 0; i < 5; i++) t.fail('hicham', '1.1.1.1');
    expect(checkThrottle(t.db, t.clock, { usernameNormalized: 'hicham', ip: '2.2.2.2' }).blocked).toBe(true);
    t.clock.advance(15 * MINUTE_MS);
    expect(checkThrottle(t.db, t.clock, { usernameNormalized: 'hicham', ip: '2.2.2.2' }).blocked).toBe(false);
  });

  it('waits for enough failures to expire when there are more than five', async () => {
    const t = await setup();
    for (let i = 0; i < 7; i++) {
      t.fail('hicham', '1.1.1.1');
      t.clock.advance(MINUTE_MS);
    }
    // Failures at −7…−1 min: the block lifts when only four remain, i.e. 15 min after the third-oldest (−5 min).
    const result = checkThrottle(t.db, t.clock, { usernameNormalized: 'hicham', ip: '2.2.2.2' });
    expect(result).toMatchObject({ blocked: true, retryAfterSeconds: 10 * 60 });
  });
});
