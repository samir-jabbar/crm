import { normalizeUsername, type SignInReason, type SignInRequest } from '@hanjing/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import { users, type UserRow } from '../db/schema';
import type { Deps } from '../deps';
import { AppError } from '../lib/errors';
import type { RequestCtx } from '../lib/requestContext';
import { recordSignInAttempt } from './attempts';
import { verifyAgainstDummy, verifyPassword } from './password';
import { createSession, type CreatedSession } from './sessions';
import { checkThrottle } from './throttle';

/**
 * Username + password sign-in (FR-006 – FR-011, D9). Every attempt is recorded for the history and the
 * guessing blocks, and every failure looks the same from outside.
 */
export async function signIn(
  deps: Deps,
  input: SignInRequest,
  ctx: RequestCtx,
): Promise<{ user: UserRow; session: CreatedSession }> {
  const { db, clock } = deps;
  const usernameNormalized = normalizeUsername(input.username);

  // FR-011: refuse while blocked — before any password check, so blocked guesses learn nothing.
  const throttle = checkThrottle(db, clock, { usernameNormalized, ip: ctx.ip });
  if (throttle.blocked) {
    const knownUser = db.select().from(users).where(eq(users.usernameNormalized, usernameNormalized)).get();
    db.transaction((tx) => {
      recordSignInAttempt(tx, clock, {
        usernameInput: input.username,
        usernameNormalized,
        userId: knownUser?.id ?? null,
        outcome: 'blocked',
        reason: throttle.reason,
        ctx,
      });
      recordAudit(tx, clock, {
        actorUserId: knownUser?.id ?? null,
        actorLabel: knownUser?.username ?? (input.username.trim() || '(empty)'),
        action: 'auth.sign_in_blocked',
        targetType: 'user',
        targetId: knownUser?.id ?? null,
        ctx,
      });
    });
    throw new AppError(429, 'too_many_attempts', { retryAfterSeconds: throttle.retryAfterSeconds });
  }

  const user = db.select().from(users).where(eq(users.usernameNormalized, usernameNormalized)).get();
  // Always run argon2, even for unknown usernames, so timing reveals nothing.
  const passwordOk = user ? await verifyPassword(user.passwordHash, input.password) : await verifyAgainstDummy(input.password);

  if (!user || !passwordOk || user.status !== 'active') {
    const reason: SignInReason = user && passwordOk ? 'account_inactive' : 'invalid_credentials';
    db.transaction((tx) => {
      recordSignInAttempt(tx, clock, {
        usernameInput: input.username,
        usernameNormalized,
        userId: user?.id ?? null,
        outcome: 'failure',
        reason,
        ctx,
      });
      recordAudit(tx, clock, {
        actorUserId: user?.id ?? null,
        actorLabel: user?.username ?? (input.username.trim() || '(empty)'),
        action: 'auth.sign_in_failed',
        targetType: 'user',
        targetId: user?.id ?? null,
        ctx,
      });
    });
    throw new AppError(401, 'invalid_credentials');
  }

  return db.transaction((tx) => {
    const session = createSession(tx, clock, user.id, ctx);
    recordSignInAttempt(tx, clock, {
      usernameInput: input.username,
      usernameNormalized,
      userId: user.id,
      outcome: 'success',
      reason: 'ok',
      ctx,
    });
    recordAudit(tx, clock, {
      actorUserId: user.id,
      actorLabel: user.username,
      action: 'auth.sign_in',
      targetType: 'session',
      targetId: session.id,
      ctx,
    });
    return { user, session };
  });
}
