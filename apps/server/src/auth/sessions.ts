import { createHash, randomBytes } from 'node:crypto';
import { SESSION_ABSOLUTE_LIFETIME_MS, type SessionRevokeReason } from '@hanjing/shared';
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { Config } from '../config';
import type { DB, Executor } from '../db/client';
import { sessions, users, type SessionRow, type UserRow } from '../db/schema';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';
import { getIdleTimeoutMs } from '../settings/service';

export const SESSION_COOKIE = 'hj_session';
/** last_active_at is written at most this often, to limit writes. */
const TOUCH_INTERVAL_MS = 60_000;

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreatedSession {
  id: string;
  token: string;
}

export function createSession(tx: Executor, clock: Clock, userId: string, ctx: RequestCtx): CreatedSession {
  const token = generateToken();
  const now = clock.now();
  const id = newId();
  tx.insert(sessions)
    .values({
      id,
      tokenHash: hashToken(token),
      userId,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + SESSION_ABSOLUTE_LIFETIME_MS,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      deviceLabel: ctx.deviceLabel,
      location: ctx.location,
    })
    .run();
  return { id, token };
}

export interface ValidSession {
  session: SessionRow;
  user: UserRow;
}

/** True when the session can still be used at `now` (not revoked, not expired, not idle). */
export function isSessionActive(session: SessionRow, now: number, idleTimeoutMs: number): boolean {
  return session.revokedAt === null && now < session.expiresAt && now - session.lastActiveAt < idleTimeoutMs;
}

/**
 * Validate a cookie token (FR-013): revoked, past the absolute expiry, or idle longer than the
 * configured timeout → invalid. Idle sessions are marked `timeout` and audited when detected.
 */
export function validateSessionToken(db: DB, clock: Clock, token: string): ValidSession | null {
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .get();
  if (!row || row.session.revokedAt !== null) return null;

  const now = clock.now();
  if (now >= row.session.expiresAt) return null;

  if (now - row.session.lastActiveAt >= getIdleTimeoutMs(db)) {
    db.transaction((tx) => {
      revokeSession(tx, clock, row.session.id, 'timeout');
      recordAudit(tx, clock, {
        actorUserId: row.user.id,
        actorLabel: row.user.username,
        action: 'session.timed_out',
        targetType: 'session',
        targetId: row.session.id,
        ctx: {
          ip: row.session.ip,
          userAgent: row.session.userAgent,
          deviceLabel: row.session.deviceLabel,
          location: row.session.location,
        },
      });
    });
    return null;
  }

  if (row.user.status !== 'active') return null;

  if (now - row.session.lastActiveAt > TOUCH_INTERVAL_MS) {
    db.update(sessions).set({ lastActiveAt: now }).where(eq(sessions.id, row.session.id)).run();
    row.session.lastActiveAt = now;
  }
  return row;
}

export function revokeSession(tx: Executor, clock: Clock, sessionId: string, reason: SessionRevokeReason): void {
  tx.update(sessions)
    .set({ revokedAt: clock.now(), revokedReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .run();
}

/** Revoke every open session of a user, optionally keeping one (e.g. the current one on password change). */
export function revokeAllForUser(
  tx: Executor,
  clock: Clock,
  userId: string,
  reason: SessionRevokeReason,
  options: { exceptSessionId?: string } = {},
): number {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (options.exceptSessionId) conditions.push(ne(sessions.id, options.exceptSessionId));
  const result = tx
    .update(sessions)
    .set({ revokedAt: clock.now(), revokedReason: reason })
    .where(and(...conditions))
    .run();
  return result.changes;
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function setSessionCookie(c: Context, token: string, config: Config): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: Math.floor(SESSION_ABSOLUTE_LIFETIME_MS / 1000),
  });
}

export function clearSessionCookie(c: Context, config: Config): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: config.cookieSecure, httpOnly: true, sameSite: 'Lax' });
}
