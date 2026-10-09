import { changePasswordRequestSchema, updateMeRequestSchema } from '@hanjing/shared';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { recordAudit } from '../audit/record';
import { recordSignInAttempt } from '../auth/attempts';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../auth/password';
import { revokeAllForUser } from '../auth/sessions';
import { checkThrottle } from '../auth/throttle';
import { AppError } from '../lib/errors';
import { users } from '../db/schema';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { parseWith, readJsonBody } from '../lib/validate';
import { presentMe } from '../policy/present';
import { route } from '../policy/route';
import { getSettings } from '../settings/service';

export function registerMeRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db, clock } = deps;

  route(app, 'GET', '/api/me', 'authenticated', (c) => {
    const user = c.get('user')!;
    return c.json(presentMe(user, c.get('session')!.id, getSettings(db), { viewer: user }));
  });

  // FR-026: the language (and display name) live on the account, so they follow the user to every device.
  route(app, 'PATCH', '/api/me', 'authenticated', async (c) => {
    const user = c.get('user')!;
    const patch = parseWith(updateMeRequestSchema, await readJsonBody(c));
    const updated = db.transaction((tx) => {
      const after = tx
        .update(users)
        .set({
          ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
          ...(patch.language !== undefined ? { language: patch.language } : {}),
          updatedAt: clock.now(),
        })
        .where(eq(users.id, user.id))
        .returning()
        .get();
      recordAudit(tx, clock, {
        actorUserId: user.id,
        actorLabel: user.username,
        action: 'profile.updated',
        targetType: 'user',
        targetId: user.id,
        ctx: c.get('reqCtx'),
        before: { displayName: user.displayName, language: user.language },
        after: { displayName: after.displayName, language: after.language },
      });
      return after;
    });
    return c.json(presentMe(updated, c.get('session')!.id, getSettings(db), { viewer: updated }));
  });

  // FR-009: change password with the current one; every other device is signed out.
  route(app, 'POST', '/api/me/password', 'authenticated', async (c) => {
    const user = c.get('user')!;
    const session = c.get('session')!;
    const ctx = c.get('reqCtx');
    const input = parseWith(changePasswordRequestSchema, await readJsonBody(c));

    const throttle = checkThrottle(db, clock, { usernameNormalized: user.usernameNormalized, ip: ctx.ip });
    if (throttle.blocked) throw new AppError(429, 'too_many_attempts', { retryAfterSeconds: throttle.retryAfterSeconds });

    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      // A wrong current password counts toward the account block, like a failed sign-in.
      recordSignInAttempt(db, clock, {
        usernameInput: user.username,
        usernameNormalized: user.usernameNormalized,
        userId: user.id,
        outcome: 'failure',
        reason: 'invalid_credentials',
        ctx,
      });
      throw new AppError(403, 'current_password_invalid');
    }
    const policyError = checkPasswordPolicy(input.newPassword);
    if (policyError) throw new AppError(400, 'validation_failed', { fields: { newPassword: policyError } });
    if (await verifyPassword(user.passwordHash, input.newPassword)) {
      throw new AppError(400, 'validation_failed', { fields: { newPassword: 'password_same_as_current' } });
    }

    const passwordHash = await hashPassword(input.newPassword);
    db.transaction((tx) => {
      const now = clock.now();
      // 005 FR-037: choosing their own password ends an Owner-set temporary one.
      tx.update(users)
        .set({ passwordHash, passwordChangedAt: now, updatedAt: now, mustChangePassword: false })
        .where(eq(users.id, user.id))
        .run();
      revokeAllForUser(tx, clock, user.id, 'password_change', { exceptSessionId: session.id });
      recordAudit(tx, clock, {
        actorUserId: user.id,
        actorLabel: user.username,
        action: 'password.changed',
        targetType: 'user',
        targetId: user.id,
        ctx,
      });
    });
    return c.body(null, 204);
  });
}
