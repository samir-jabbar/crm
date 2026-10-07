import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../src/env';
import { assertAllApiRoutesHavePolicy, registeredRoutes } from '../../src/policy/route';
import { createTestContext } from '../helpers';

// Quickstart Q3 / FR-017, SC-003: deny by default.
describe('permission gate', () => {
  it('refuses every non-public API route to signed-out visitors', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const routes = registeredRoutes(ctx.app).filter((r) => r.policy !== 'public');
    expect(routes.length).toBeGreaterThan(0);
    const anonymous = ctx.client();
    for (const r of routes) {
      const path = r.path.replace(/:[A-Za-z]+/g, '00000000-0000-0000-0000-000000000000');
      const res = await anonymous.request(r.method, path, r.method === 'GET' ? undefined : {});
      expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({
        route: `${r.method} ${r.path}`,
        status: 401,
      });
    }
  });

  it('only exposes the expected public routes', async () => {
    const ctx = await createTestContext();
    const publicRoutes = registeredRoutes(ctx.app)
      .filter((r) => r.policy === 'public')
      .map((r) => `${r.method} ${r.path}`)
      .sort();
    expect(publicRoutes).toEqual(['GET /api/health', 'GET /api/setup/status', 'POST /api/auth/sign-in', 'POST /api/setup']);
  });

  it('fails at startup when a route bypasses route()', () => {
    const app = new Hono<AppEnv>();
    app.get('/api/rogue', (c) => c.text('oops'));
    expect(() => assertAllApiRoutesHavePolicy(app)).toThrow(/GET \/api\/rogue/);
  });
});
