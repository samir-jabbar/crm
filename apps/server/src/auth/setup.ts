import { randomInt } from 'node:crypto';
import { normalizeUsername, type SetupRequest } from '@hanjing/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import type { Config } from '../config';
import type { DB, Executor } from '../db/client';
import { appState, users, type UserRow } from '../db/schema';
import type { Deps, Logger } from '../deps';
import { AppError } from '../lib/errors';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';
import { recordSignInAttempt, SETUP_ATTEMPT_USERNAME } from './attempts';
import { checkPasswordPolicy, hashPassword, verifyPassword } from './password';
import { createSession, type CreatedSession } from './sessions';
import { checkThrottle } from './throttle';

const SETUP_CODE_KEY = 'setup_code_hash';
/** No 0/O, 1/I/L: easy to read from a server log and type on a phone. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Codes are compared without regard to case, spaces or dashes. */
export function normalizeSetupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

function generateSetupCode(): string {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

export function isSetupRequired(db: Executor): boolean {
  return !db.select({ id: users.id }).from(users).where(eq(users.role, 'owner')).get();
}

/**
 * Boot step (R8): while no Owner exists, keep a fresh one-time setup code. Only its hash is stored;
 * the plain code is printed once to the server log (or comes from SETUP_CODE).
 */
export async function ensureSetupCode(db: DB, config: Config, log: Logger): Promise<void> {
  if (!isSetupRequired(db)) return;
  const code = config.setupCode ?? generateSetupCode();
  const codeHash = await hashPassword(normalizeSetupCode(code));
  db.insert(appState)
    .values({ key: SETUP_CODE_KEY, value: codeHash })
    .onConflictDoUpdate({ target: appState.key, set: { value: codeHash } })
    .run();
  const origin = config.appOrigins[0] ?? `http://localhost:${config.port}`;
  log.info(
    config.setupCode
      ? `[setup] No owner yet. Open ${origin}/setup and enter the setup code from SETUP_CODE.`
      : `[setup] No owner yet. Open ${origin}/setup and enter setup code: ${code}`,
  );
}

async function setupCodeMatches(db: Executor, code: string): Promise<boolean> {
  const stored = db.select().from(appState).where(eq(appState.key, SETUP_CODE_KEY)).get();
  if (!stored) return false;
  return verifyPassword(stored.value, normalizeSetupCode(code));
}

/** FR-001–FR-003: verify the code, create the single Owner and their first session in one transaction. */
export async function completeSetup(
  deps: Deps,
  input: SetupRequest,
  ctx: RequestCtx,
): Promise<{ user: UserRow; session: CreatedSession }> {
  const { db, clock } = deps;
  if (!isSetupRequired(db)) throw new AppError(410, 'setup_unavailable');

  // Wrong codes count per network origin only, so an attacker cannot block the installer elsewhere.
  const throttle = checkThrottle(db, clock, { ip: ctx.ip });
  if (throttle.blocked) throw new AppError(429, 'too_many_attempts', { retryAfterSeconds: throttle.retryAfterSeconds });

  if (!(await setupCodeMatches(db, input.setupCode))) {
    recordSignInAttempt(db, clock, {
      usernameInput: SETUP_ATTEMPT_USERNAME,
      usernameNormalized: SETUP_ATTEMPT_USERNAME,
      userId: null,
      outcome: 'failure',
      reason: 'invalid_credentials',
      ctx,
    });
    throw new AppError(403, 'setup_code_invalid');
  }

  const policyError = checkPasswordPolicy(input.password);
  if (policyError) throw new AppError(400, 'validation_failed', { fields: { password: policyError } });
  const passwordHash = await hashPassword(input.password);

  return db.transaction((tx) => {
    if (!isSetupRequired(tx)) throw new AppError(410, 'setup_unavailable');
    const now = clock.now();
    const user = tx
      .insert(users)
      .values({
        id: newId(),
        username: input.username,
        usernameNormalized: normalizeUsername(input.username),
        displayName: input.displayName,
        passwordHash,
        role: 'owner',
        status: 'active',
        language: input.language,
        passwordChangedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    tx.delete(appState).where(eq(appState.key, SETUP_CODE_KEY)).run();
    tx.insert(appState).values({ key: 'setup_completed_at', value: String(now) }).run();

    const session = createSession(tx, clock, user.id, ctx);
    recordSignInAttempt(tx, clock, {
      usernameInput: input.username,
      usernameNormalized: user.usernameNormalized,
      userId: user.id,
      outcome: 'success',
      reason: 'ok',
      ctx,
    });
    const actor = { actorUserId: user.id, actorLabel: user.username, ctx };
    recordAudit(tx, clock, {
      ...actor,
      action: 'setup.owner_created',
      targetType: 'user',
      targetId: user.id,
      after: { username: user.username, displayName: user.displayName, role: user.role, language: user.language },
    });
    recordAudit(tx, clock, { ...actor, action: 'auth.sign_in', targetType: 'session', targetId: session.id });
    return { user, session };
  });
}
