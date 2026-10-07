import { describe, expect, it } from 'vitest';
import { auditActions, createTestContext, OWNER } from '../helpers';

const LAPTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

async function twoDevices() {
  const ctx = await createTestContext();
  const phone = await ctx.createOwner();
  const laptop = ctx.client('198.51.100.7', LAPTOP_UA);
  await laptop.post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
  return { ctx, phone, laptop };
}

// Quickstart Q12 / US3 acceptance 1–3, SC-009.
describe('signed-in devices', () => {
  it('lists active sessions with device details and marks the current one', async () => {
    const { phone } = await twoDevices();
    const res = await phone.get('/api/me/sessions');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const current = res.body.items.filter((s: any) => s.current);
    expect(current).toHaveLength(1);
    expect(current[0].deviceLabel).toBe('iPhone · Safari');
    const other = res.body.items.find((s: any) => !s.current);
    expect(other).toMatchObject({ deviceLabel: 'Windows · Chrome', ip: '198.51.100.7' });
    expect(other).not.toHaveProperty('tokenHash');
  });

  it('signs out another device remotely', async () => {
    const { ctx, phone, laptop } = await twoDevices();
    const list = await phone.get('/api/me/sessions');
    const laptopSession = list.body.items.find((s: any) => !s.current);
    expect((await phone.delete(`/api/me/sessions/${laptopSession.id}`)).status).toBe(204);
    expect((await laptop.get('/api/me')).status).toBe(401);
    expect((await phone.get('/api/me')).status).toBe(200);
    expect(auditActions(ctx)).toContain('session.revoked');
  });

  it("returns 404 for unknown sessions and for other users' sessions", async () => {
    const { ctx, phone } = await twoDevices();
    expect((await phone.delete('/api/me/sessions/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    const worker = await ctx.createWorker();
    const workerSessionId = (await worker.get('/api/me')).body.session.id;
    expect((await phone.delete(`/api/me/sessions/${workerSessionId}`)).status).toBe(404);
    expect((await worker.get('/api/me')).status).toBe(200);
  });

  it('"Log out all devices" ends every session, including the current one', async () => {
    const { ctx, phone, laptop } = await twoDevices();
    expect((await phone.post('/api/me/sessions/revoke-all')).status).toBe(204);
    expect((await phone.get('/api/me')).status).toBe(401);
    expect((await laptop.get('/api/me')).status).toBe(401);
    expect(auditActions(ctx)).toContain('session.revoked_all');
  });
});
