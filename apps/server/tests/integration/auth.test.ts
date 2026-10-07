import { describe, expect, it } from 'vitest';
import { DAY_MS, MINUTE_MS } from '../../src/clock';
import { auditActions, createTestContext, OWNER } from '../helpers';

// Quickstart Q4, Q5 / US1 acceptance 4–6.
describe('sign-in, sign-out and session timeouts', () => {
  it('gives the same answer for a wrong username and a wrong password', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const wrongUser = await ctx.client().post('/api/auth/sign-in', { username: 'nobody', password: OWNER.password });
    const wrongPass = await ctx.client().post('/api/auth/sign-in', { username: OWNER.username, password: 'nope-nope-nope' });
    expect(wrongUser.status).toBe(401);
    expect(wrongPass.status).toBe(401);
    expect(wrongUser.body).toEqual({ error: { code: 'invalid_credentials' } });
    expect(wrongPass.body).toEqual(wrongUser.body);
    expect(auditActions(ctx).filter((a) => a === 'auth.sign_in_failed')).toHaveLength(2);
  });

  it('signs in case-insensitively, records the attempt, then signs out', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const client = ctx.client();
    const res = await client.post('/api/auth/sign-in', { username: `  ${OWNER.username.toUpperCase()} `, password: OWNER.password });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(OWNER.username);
    // Setup records the first success; this sign-in adds a second one.
    const latest = ctx.sqlite
      .prepare('select outcome, reason, ip, username_input from sign_in_attempts order by rowid desc limit 1')
      .get();
    expect(latest).toEqual({ outcome: 'success', reason: 'ok', ip: client.ip, username_input: '  HICHAM ' });

    expect((await client.get('/api/me')).status).toBe(200);
    expect((await client.post('/api/auth/sign-out')).status).toBe(204);
    expect((await client.get('/api/me')).status).toBe(401);
    expect(auditActions(ctx)).toContain('auth.sign_out');
  });

  it('ends a session after the idle timeout (default 12 h)', async () => {
    const ctx = await createTestContext();
    const client = await ctx.createOwner();
    ctx.clock.advance(719 * MINUTE_MS);
    expect((await client.get('/api/me')).status).toBe(200);
    ctx.clock.advance(720 * MINUTE_MS);
    const res = await client.get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'unauthenticated' } });
    const row = ctx.sqlite.prepare('select revoked_reason from sessions').get() as { revoked_reason: string };
    expect(row.revoked_reason).toBe('timeout');
    expect(auditActions(ctx)).toContain('session.timed_out');
  });

  it('ends every session 30 days after sign-in, even when active', async () => {
    const ctx = await createTestContext();
    const client = await ctx.createOwner();
    let elapsed = 0;
    while (elapsed + 11 * 60 * MINUTE_MS < 30 * DAY_MS) {
      ctx.clock.advance(11 * 60 * MINUTE_MS);
      elapsed += 11 * 60 * MINUTE_MS;
      expect((await client.get('/api/me')).status).toBe(200);
    }
    ctx.clock.advance(11 * 60 * MINUTE_MS);
    expect((await client.get('/api/me')).status).toBe(401);
  });

  it('treats an unknown session cookie as signed out and clears it', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const client = ctx.client();
    client.cookies.set('hj_session', 'forged-token');
    const res = await client.get('/api/me');
    expect(res.status).toBe(401);
    expect(client.cookies.has('hj_session')).toBe(false);
  });
});
