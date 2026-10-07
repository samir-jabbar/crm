import { describe, expect, it } from 'vitest';
import { resetOwnerPassword } from '../../src/cli/reset-owner-password';
import { createTestContext, OWNER } from '../helpers';

const RESET_PASSWORD = 'Server-Reset-Passphrase-1';

// Quickstart Q15 / US3 acceptance 7, FR-012.
describe('server-side Owner password reset', () => {
  it('sets the new password, ends every session and is audited as system:cli', async () => {
    const ctx = await createTestContext();
    const phone = await ctx.createOwner();

    await resetOwnerPassword(ctx.db, ctx.clock, RESET_PASSWORD);

    expect((await phone.get('/api/me')).status).toBe(401);
    const revoked = ctx.sqlite.prepare('select revoked_reason from sessions').all();
    expect(revoked).toEqual([{ revoked_reason: 'server_reset' }]);

    const old = await ctx.client().post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
    expect(old.status).toBe(401);
    const fresh = await ctx.client().post('/api/auth/sign-in', { username: OWNER.username, password: RESET_PASSWORD });
    expect(fresh.status).toBe(200);

    const entry = ctx.sqlite
      .prepare("select actor_user_id, actor_label from audit_entries where action = 'password.server_reset'")
      .get();
    expect(entry).toEqual({ actor_user_id: null, actor_label: 'system:cli' });
  });

  it('rejects a password that breaks the policy', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    await expect(resetOwnerPassword(ctx.db, ctx.clock, '1234567890')).rejects.toThrow(/password_too_common/);
  });

  it('fails when there is no Owner yet', async () => {
    const ctx = await createTestContext();
    await expect(resetOwnerPassword(ctx.db, ctx.clock, RESET_PASSWORD)).rejects.toThrow(/no owner/i);
  });
});
