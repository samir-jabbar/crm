import { describe, expect, it } from 'vitest';
import { createTestContext, OWNER } from '../helpers';

// US2 acceptance 3–4 / FR-026, FR-028.
describe('PATCH /api/me', () => {
  it('saves the language on the account so it follows the user to other devices', async () => {
    const ctx = await createTestContext();
    const phone = await ctx.createOwner();
    const res = await phone.patch('/api/me', { language: 'ar' });
    expect(res.status).toBe(200);
    expect(res.body.user.language).toBe('ar');

    const laptop = ctx.client('198.51.100.7');
    await laptop.post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
    expect((await laptop.get('/api/me')).body.user.language).toBe('ar');
  });

  it('stores any script exactly as entered', async () => {
    const ctx = await createTestContext();
    const client = await ctx.createOwner();
    const name = '汉景 هانجينغ Élodie';
    const res = await client.patch('/api/me', { displayName: name });
    expect(res.status).toBe(200);
    expect((await client.get('/api/me')).body.user.displayName).toBe(name);
  });

  it('rejects an unsupported language', async () => {
    const ctx = await createTestContext();
    const client = await ctx.createOwner();
    const res = await client.patch('/api/me', { language: 'de' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toEqual({ language: 'language_invalid' });
  });

  it('audits only the changed fields', async () => {
    const ctx = await createTestContext();
    const client = await ctx.createOwner();
    await client.patch('/api/me', { language: 'fr', displayName: OWNER.displayName });
    const entry = ctx.sqlite
      .prepare("select before_json, after_json from audit_entries where action = 'profile.updated'")
      .get() as { before_json: string; after_json: string };
    expect(JSON.parse(entry.before_json)).toEqual({ language: 'en' });
    expect(JSON.parse(entry.after_json)).toEqual({ language: 'fr' });
  });
});
