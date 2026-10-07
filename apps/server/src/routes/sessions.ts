import type { SessionListResponse } from '@hanjing/shared';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Hono } from 'hono';
import { recordAudit } from '../audit/record';
import { clearSessionCookie, isSessionActive, revokeAllForUser, revokeSession } from '../auth/sessions';
import { sessions } from '../db/schema';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { notFound } from '../lib/errors';
import { presentSession } from '../policy/present';
import { route } from '../policy/route';
import { getIdleTimeoutMs } from '../settings/service';

/** FR-014, FR-015: see where the account is signed in, and end any or all of those sessions. */
export function registerSessionRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db, clock, config } = deps;

  route(app, 'GET', '/api/me/sessions', 'authenticated', (c) => {
    const user = c.get('user')!;
    const current = c.get('session')!;
    const now = clock.now();
    const idle = getIdleTimeoutMs(db);
    const rows = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
      .orderBy(desc(sessions.lastActiveAt))
      .all()
      .filter((s) => isSessionActive(s, now, idle));
    return c.json<SessionListResponse>({ items: rows.map((s) => presentSession(s, current.id, { viewer: user })) });
  });

  route(app, 'DELETE', '/api/me/sessions/:id', 'authenticated', (c) => {
    const user = c.get('user')!;
    const current = c.get('session')!;
    const target = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, c.req.param('id') ?? ''), eq(sessions.userId, user.id)))
      .get();
    if (!target || !isSessionActive(target, clock.now(), getIdleTimeoutMs(db))) throw notFound();

    db.transaction((tx) => {
      revokeSession(tx, clock, target.id, 'remote');
      recordAudit(tx, clock, {
        actorUserId: user.id,
        actorLabel: user.username,
        action: 'session.revoked',
        targetType: 'session',
        targetId: target.id,
        ctx: c.get('reqCtx'),
        after: { deviceLabel: target.deviceLabel },
      });
    });
    if (target.id === current.id) clearSessionCookie(c, config);
    return c.body(null, 204);
  });

  route(app, 'POST', '/api/me/sessions/revoke-all', 'authenticated', (c) => {
    const user = c.get('user')!;
    db.transaction((tx) => {
      const count = revokeAllForUser(tx, clock, user.id, 'revoke_all');
      recordAudit(tx, clock, {
        actorUserId: user.id,
        actorLabel: user.username,
        action: 'session.revoked_all',
        targetType: 'user',
        targetId: user.id,
        ctx: c.get('reqCtx'),
        after: { sessionsEnded: count },
      });
    });
    clearSessionCookie(c, config);
    return c.body(null, 204);
  });
}
