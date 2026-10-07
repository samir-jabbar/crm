import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/clock';
import { auditActions, createTestContext, OWNER } from '../helpers';

const NEW_PASSWORD = 'Another-Long-Passphrase-7';

// Quickstart Q13 / US3 acceptance 4, FR-009.
describe('change password', () => {
  it('requires the current password', async () => {
    const ctx = await createTestContext();
    const client = await ctx.createOwner();
    const res = await client.post('/api/me/password', { currentPassword: 'wrong-wrong-wrong', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'current_password_invalid' } });
  });

  it('applies the password policy', async () => {
    const ctx = await createTestContext();
    const client = await ctx.createOwner();
    const common = await client.post('/api/me/password', { currentPassword: OWNER.password, newPassword: '1234567890' });
    expect(common.status).toBe(400);
    expect(common.body.error.details.fields).toEqual({ newPassword: 'password_too_common' });
    const same = await client.post('/api/me/password', { currentPassword: OWNER.password, newPassword: OWNER.password });
    expect(same.body.error.details.fields).toEqual({ newPassword: 'password_same_as_current' });
  });

  it('signs out every other device but keeps the current one', async () => {
    const ctx = await createTestContext();
    const phone = await ctx.createOwner();
    const laptop = ctx.client('198.51.100.7');
    await laptop.post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });

    const res = await phone.post('/api/me/password', { currentPassword: OWNER.password, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(204);
    expect((await laptop.get('/api/me')).status).toBe(401);
    expect((await phone.get('/api/me')).status).toBe(200);
    expect(auditActions(ctx)).toContain('password.changed');

    const oldPw = await ctx.client().post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
    expect(oldPw.status).toBe(401);
    const newPw = await ctx.client().post('/api/auth/sign-in', { username: OWNER.username, password: NEW_PASSWORD });
    expect(newPw.status).toBe(200);
  });
});

// Quickstart Q14 / US3 acceptance 5, SC-010.
describe('guessing blocks on sign-in', () => {
  it('blocks the sixth attempt even with the right password, then lifts the block by itself', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    for (let i = 0; i < 5; i++) {
      const res = await ctx.client(`10.1.1.${i}`).post('/api/auth/sign-in', { username: OWNER.username, password: 'bad-guess-000' });
      expect(res.status).toBe(401);
    }
    const blocked = await ctx
      .client('10.2.2.2')
      .post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('too_many_attempts');
    expect(blocked.body.error.details.retryAfterSeconds).toBe(15 * 60);
    expect(blocked.headers.get('retry-after')).toBe(String(15 * 60));
    const row = ctx.sqlite.prepare('select outcome, reason from sign_in_attempts order by rowid desc limit 1').get();
    expect(row).toEqual({ outcome: 'blocked', reason: 'account_blocked' });
    expect(auditActions(ctx)).toContain('auth.sign_in_blocked');

    ctx.clock.advance(15 * MINUTE_MS);
    const ok = await ctx.client('10.2.2.2').post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
    expect(ok.status).toBe(200);
  });

  it('counts wrong setup codes toward the per-IP block', async () => {
    const ctx = await createTestContext();
    const attacker = ctx.client('6.6.6.6');
    for (let i = 0; i < 5; i++) {
      expect((await attacker.post('/api/setup', { ...OWNER, setupCode: 'WRONG-CODE-000' })).status).toBe(403);
    }
    const res = await attacker.post('/api/setup', OWNER);
    expect(res.status).toBe(429);
    // Someone else (the installer) can still complete setup.
    expect((await ctx.client('203.0.113.50').post('/api/setup', OWNER)).status).toBe(201);
  });
});
