import { SIGN_IN_THROTTLE } from '@hanjing/shared';
import { and, asc, eq, gt, notInArray } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { signInAttempts } from '../db/schema';

export type ThrottleResult =
  | { blocked: false }
  | { blocked: true; reason: 'account_blocked' | 'ip_blocked'; retryAfterSeconds: number };

/**
 * When does a block lift? Failures expire one by one; the block ends once fewer than `maxFailures`
 * remain in the window — i.e. when the (n − max + 1)-th oldest failure leaves it.
 */
function unblockAt(failureTimes: number[]): number | null {
  const { maxFailures, windowMs } = SIGN_IN_THROTTLE;
  if (failureTimes.length < maxFailures) return null;
  return failureTimes[failureTimes.length - maxFailures]! + windowMs;
}

/** 005: refusals after a correct password (pending, suspended, ended) are not guesses and never count. */
const NOT_GUESSES = ['account_pending', 'account_suspended', 'access_ended'] as const;

function recentFailures(db: Executor, since: number, column: 'username' | 'ip', value: string): number[] {
  const failures = and(eq(signInAttempts.outcome, 'failure'), notInArray(signInAttempts.reason, [...NOT_GUESSES]), gt(signInAttempts.occurredAt, since));
  const where = column === 'username' ? and(eq(signInAttempts.usernameNormalized, value), failures) : and(eq(signInAttempts.ip, value), failures);
  return db
    .select({ at: signInAttempts.occurredAt })
    .from(signInAttempts)
    .where(where)
    .orderBy(asc(signInAttempts.occurredAt))
    .all()
    .map((r) => r.at);
}

/**
 * FR-011 / R6: 5 failures within 15 minutes, per account and per network origin, block further attempts.
 * Nothing is stored as "locked": blocks lift on their own, so nobody can lock the Owner out for good.
 */
export function checkThrottle(
  db: Executor,
  clock: Clock,
  key: { usernameNormalized?: string; ip: string },
): ThrottleResult {
  const now = clock.now();
  const since = now - SIGN_IN_THROTTLE.windowMs;
  const candidates: { reason: 'account_blocked' | 'ip_blocked'; until: number | null }[] = [];
  if (key.usernameNormalized) {
    candidates.push({
      reason: 'account_blocked',
      until: unblockAt(recentFailures(db, since, 'username', key.usernameNormalized)),
    });
  }
  candidates.push({ reason: 'ip_blocked', until: unblockAt(recentFailures(db, since, 'ip', key.ip)) });

  const active = candidates.filter((c): c is { reason: typeof c.reason; until: number } => c.until !== null && c.until > now);
  if (active.length === 0) return { blocked: false };
  const longest = active.reduce((a, b) => (b.until > a.until ? b : a));
  return { blocked: true, reason: longest.reason, retryAfterSeconds: Math.ceil((longest.until - now) / 1000) };
}
