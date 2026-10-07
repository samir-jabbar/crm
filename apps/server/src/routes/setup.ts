import { setupRequestSchema, type SetupStatusResponse } from '@hanjing/shared';
import type { Hono } from 'hono';
import { completeSetup, isSetupRequired } from '../auth/setup';
import { setSessionCookie } from '../auth/sessions';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';
import { parseWith, readJsonBody } from '../lib/validate';
import { presentMe } from '../policy/present';
import { route } from '../policy/route';
import { getSettings } from '../settings/service';

export function registerSetupRoutes(app: Hono<AppEnv>, deps: Deps): void {
  route(app, 'GET', '/api/setup/status', 'public', (c) =>
    c.json<SetupStatusResponse>({ setupRequired: isSetupRequired(deps.db) }),
  );

  route(app, 'POST', '/api/setup', 'public', async (c) => {
    if (!isSetupRequired(deps.db)) throw new AppError(410, 'setup_unavailable');
    const input = parseWith(setupRequestSchema, await readJsonBody(c));
    const { user, session } = await completeSetup(deps, input, c.get('reqCtx'));
    setSessionCookie(c, session.token, deps.config);
    return c.json(presentMe(user, session.id, getSettings(deps.db), { viewer: user }), 201);
  });
}
