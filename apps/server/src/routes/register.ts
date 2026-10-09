import { registerRequestSchema, type RegistrationStatusResponse } from '@hanjing/shared';
import type { Hono } from 'hono';
import { registerUser } from '../auth/register';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { parseWith, readJsonBody } from '../lib/validate';
import { route } from '../policy/route';
import { getSettings } from '../settings/service';

/** 005 FR-001 – FR-006 (D9): workers register themselves and wait for the Owner's approval. */
export function registerRegistrationRoutes(app: Hono<AppEnv>, deps: Deps): void {
  route(app, 'GET', '/api/auth/registration', 'public', (c) =>
    c.json<RegistrationStatusResponse>({ open: getSettings(deps.db).registrationOpen }),
  );

  route(app, 'POST', '/api/auth/register', 'public', async (c) => {
    const input = parseWith(registerRequestSchema, await readJsonBody(c));
    await registerUser(deps, input, c.get('reqCtx'));
    return c.json({ status: 'pending' as const }, 201);
  });
}
