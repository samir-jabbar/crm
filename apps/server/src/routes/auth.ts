import { signInRequestSchema } from '@hanjing/shared';
import type { Hono } from 'hono';
import { recordAudit } from '../audit/record';
import { clearSessionCookie, revokeSession, setSessionCookie } from '../auth/sessions';
import { signIn } from '../auth/signIn';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { parseWith, readJsonBody } from '../lib/validate';
import { presentMe } from '../policy/present';
import { route } from '../policy/route';
import { getSettings } from '../settings/service';

export function registerAuthRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db, clock, config } = deps;

  route(app, 'POST', '/api/auth/sign-in', 'public', async (c) => {
    const input = parseWith(signInRequestSchema, await readJsonBody(c));
    const { user, session } = await signIn(deps, input, c.get('reqCtx'));
    setSessionCookie(c, session.token, config);
    return c.json(presentMe(user, session.id, getSettings(db), { viewer: user }));
  });

  route(app, 'POST', '/api/auth/sign-out', 'authenticated', (c) => {
    const user = c.get('user')!;
    const session = c.get('session')!;
    db.transaction((tx) => {
      revokeSession(tx, clock, session.id, 'sign_out');
      recordAudit(tx, clock, {
        actorUserId: user.id,
        actorLabel: user.username,
        action: 'auth.sign_out',
        targetType: 'session',
        targetId: session.id,
        ctx: c.get('reqCtx'),
      });
    });
    clearSessionCookie(c, config);
    return c.body(null, 204);
  });
}
