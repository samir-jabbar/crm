import { describe, expect, it } from 'vitest';
import { createTestContext, OWNER } from '../helpers';

// Hardening (T090): security headers and session-cookie attributes.
describe('security headers and cookies', () => {
  it('sends a same-origin-only CSP and the standard protective headers', async () => {
    const ctx = await createTestContext();
    const res = await ctx.client().get('/api/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/https?:\/\//);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('issues an HttpOnly, SameSite=Lax session cookie (not Secure over plain HTTP)', async () => {
    const ctx = await createTestContext();
    const res = await ctx.client().post('/api/setup', OWNER);
    const cookie = res.setCookies.find((c) => c.startsWith('hj_session='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect(cookie).toMatch(/Max-Age=2592000/i);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it('marks the cookie Secure in production over HTTPS', async () => {
    const origin = 'https://orders.example.com';
    const ctx = await createTestContext({ NODE_ENV: 'production', APP_ORIGIN: origin });
    const res = await ctx.client().request('POST', '/api/setup', OWNER, { origin });
    expect(res.status).toBe(201);
    expect(res.setCookies.find((c) => c.startsWith('hj_session='))).toMatch(/Secure/i);
  });
});
