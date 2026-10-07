import { describe, expect, it } from 'vitest';
import { auditActions, createTestContext, OWNER, TEST_SETUP_CODE } from '../helpers';

// Quickstart Q2 / US1 acceptance 1–3.
describe('first-launch setup', () => {
  it('reports setup as required on a fresh database', async () => {
    const ctx = await createTestContext();
    const res = await ctx.client().get('/api/setup/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ setupRequired: true });
  });

  it('refuses a wrong setup code', async () => {
    const ctx = await createTestContext();
    const res = await ctx.client().post('/api/setup', { ...OWNER, setupCode: 'WRONG-CODE-0000' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'setup_code_invalid' } });
  });

  it('validates fields with translatable codes', async () => {
    const ctx = await createTestContext();
    const res = await ctx.client().post('/api/setup', { ...OWNER, username: 'ab', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details.fields).toMatchObject({
      username: 'username_invalid',
      password: 'password_too_short',
    });
  });

  it('rejects a common password', async () => {
    const ctx = await createTestContext();
    const res = await ctx.client().post('/api/setup', { ...OWNER, password: '1234567890' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toEqual({ password: 'password_too_common' });
  });

  it('creates the Owner, signs them in, audits it, then closes setup for good', async () => {
    const ctx = await createTestContext();
    const client = ctx.client();
    // Codes are compared without regard to case or spaces.
    const res = await client.post('/api/setup', { ...OWNER, setupCode: ` ${TEST_SETUP_CODE.toLowerCase()} ` });
    expect(res.status).toBe(201);
    expect(res.setCookies.join(';')).toMatch(/hj_session=.+HttpOnly/i);
    expect(res.body.user).toMatchObject({ username: OWNER.username, role: 'owner', language: OWNER.language });

    const me = await client.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.displayName).toBe(OWNER.displayName);

    expect(auditActions(ctx)).toEqual(expect.arrayContaining(['setup.owner_created', 'auth.sign_in']));

    const again = await ctx.client().post('/api/setup', { ...OWNER, username: 'someone-else' });
    expect(again.status).toBe(410);
    expect(again.body).toEqual({ error: { code: 'setup_unavailable' } });
    expect((await ctx.client().get('/api/setup/status')).body).toEqual({ setupRequired: false });
  });
});
