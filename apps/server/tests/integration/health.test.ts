import { describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers';

describe('platform pipeline', () => {
  it('serves the public health route', async () => {
    const ctx = await createTestContext();
    const res = await ctx.client().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const ctx = await createTestContext();
    const res = await ctx.client().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found' } });
  });

  it('rejects state-changing requests from a foreign origin', async () => {
    const ctx = await createTestContext();
    const res = await ctx.client().request('POST', '/api/health', {}, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'csrf_rejected' } });
  });

  it('migrations seed CNY as base currency and the four currencies', async () => {
    const ctx = await createTestContext();
    const rows = ctx.sqlite.prepare('select code from currencies order by sort_order').all() as {
      code: string;
    }[];
    expect(rows.map((r) => r.code)).toEqual(['CNY', 'USD', 'MAD', 'EUR']);
    const settings = ctx.sqlite.prepare('select * from company_settings').get() as Record<string, unknown>;
    expect(settings).toMatchObject({ id: 1, base_currency: 'CNY', session_idle_timeout_minutes: 720 });
  });
});
