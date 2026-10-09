import { normalizeUsername, REGISTRATION_THROTTLE, type RegisterRequest } from '@hanjing/shared';
import { and, count, eq, gt, min } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import { registrations, users } from '../db/schema';
import type { Deps } from '../deps';
import { AppError } from '../lib/errors';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';
import { getSettings } from '../settings/service';
import { checkPasswordPolicy, hashPassword } from './password';

const usernameTaken = () => new AppError(400, 'validation_failed', { fields: { username: 'username_taken' } });

/** FR-006: at most `config.registrationsPerHour` (default 5) registrations per network origin within the hour. */
function checkRegistrationThrottle(deps: Deps, ip: string): void {
  const since = deps.clock.now() - REGISTRATION_THROTTLE.windowMs;
  const recent = deps.db
    .select({ n: count(), oldest: min(registrations.createdAt) })
    .from(registrations)
    .where(and(eq(registrations.ip, ip), gt(registrations.createdAt, since)))
    .get();
  if (recent && recent.n >= deps.config.registrationsPerHour) {
    const retryAfterMs = (recent.oldest ?? since) + REGISTRATION_THROTTLE.windowMs - deps.clock.now();
    throw new AppError(429, 'too_many_attempts', { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) });
  }
}

/**
 * Self-registration (ROADMAP D9, 005 FR-001 – FR-006): a pending worker account that cannot sign in until the Owner
 * approves it. Usernames follow 001's rules and are unique among every account, deleted ones included; only a
 * rejected registration frees its username (research R6).
 */
export async function registerUser(deps: Deps, input: RegisterRequest, ctx: RequestCtx): Promise<void> {
  const { db, clock } = deps;
  if (!getSettings(db).registrationOpen) throw new AppError(403, 'registration_closed');
  checkRegistrationThrottle(deps, ctx.ip);

  const usernameNormalized = normalizeUsername(input.username);
  if (db.select({ id: users.id }).from(users).where(eq(users.usernameNormalized, usernameNormalized)).get()) throw usernameTaken();
  const policyError = checkPasswordPolicy(input.password);
  if (policyError) throw new AppError(400, 'validation_failed', { fields: { password: policyError } });
  const passwordHash = await hashPassword(input.password);

  try {
    db.transaction((tx) => {
      const now = clock.now();
      const user = tx
        .insert(users)
        .values({
          id: newId(),
          username: input.username.trim(),
          usernameNormalized,
          displayName: input.displayName,
          passwordHash,
          role: 'worker',
          status: 'pending',
          language: input.language,
          passwordChangedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      tx.insert(registrations)
        .values({ id: newId(), userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent, deviceLabel: ctx.deviceLabel, location: ctx.location, createdAt: now })
        .run();
      recordAudit(tx, clock, {
        actorUserId: user.id,
        actorLabel: user.username,
        action: 'user.registered',
        targetType: 'user',
        targetId: user.id,
        ctx,
        after: { username: user.username, displayName: user.displayName, language: user.language },
      });
    });
  } catch (error) {
    // Two people registering the same name at once: the unique index decides.
    if (error instanceof Error && /UNIQUE constraint failed: users\.username_normalized/.test(error.message)) throw usernameTaken();
    throw error;
  }
}
