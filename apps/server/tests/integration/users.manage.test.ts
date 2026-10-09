import { describe, expect, it } from 'vitest';
import { auditActions, createTestContext, OWNER, seedExpense, seedOrder } from '../helpers';

const reader = { modules: { orders: ['view'], expenses: ['create'] }, hidden: [] } as any;

// 005 quickstart W21 / US6, FR-034 – FR-040.
describe('managing worker accounts', () => {
  it('forces a logout on every device (FR-038)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const phone = await ctx.createWorker({ permissions: reader });
    const laptop = ctx.client('198.51.100.21');
    await laptop.post('/api/auth/sign-in', { username: 'worker1', password: OWNER.password });
    expect((await owner.get(`/api/users/${phone.userId}/sessions`)).body).toHaveLength(2);

    expect((await owner.post(`/api/users/${phone.userId}/sign-out-everywhere`)).status).toBe(204);
    expect((await phone.get('/api/me')).status).toBe(401);
    expect((await laptop.get('/api/me')).status).toBe(401);
    expect(auditActions(ctx)).toContain('user.signed_out_everywhere');
  });

  it('suspends and reactivates, keeping the same permissions (FR-036)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const worker = await ctx.createWorker({ permissions: reader });
    const suspended = await owner.post(`/api/users/${worker.userId}/suspend`);
    expect(suspended.body.status).toBe('suspended');
    expect((await worker.get('/api/me')).status).toBe(401);
    const again = await ctx.client().post('/api/auth/sign-in', { username: 'worker1', password: OWNER.password });
    expect(again.body.error.code).toBe('account_suspended');

    const reactivated = await owner.post(`/api/users/${worker.userId}/reactivate`);
    expect(reactivated.body).toMatchObject({ status: 'active', permissions: { modules: { orders: ['view'], expenses: ['view', 'create'] } } });
    expect((await ctx.client().post('/api/auth/sign-in', { username: 'worker1', password: OWNER.password })).status).toBe(200);
    expect(auditActions(ctx)).toEqual(expect.arrayContaining(['user.suspended', 'user.reactivated']));
  });

  it('resets a password: sessions end, and a new password comes first (FR-037)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const worker = await ctx.createWorker({ permissions: reader });
    expect((await owner.post(`/api/users/${worker.userId}/password`, { temporaryPassword: 'short' })).status).toBe(400);
    expect((await owner.post(`/api/users/${worker.userId}/password`, { temporaryPassword: 'Temporaire-2026!' })).status).toBe(204);
    expect((await worker.get('/api/me')).status).toBe(401);

    const device = ctx.client();
    expect((await device.post('/api/auth/sign-in', { username: 'worker1', password: OWNER.password })).status).toBe(401);
    const signIn = await device.post('/api/auth/sign-in', { username: 'worker1', password: 'Temporaire-2026!' });
    expect(signIn.body.user.mustChangePassword).toBe(true);
    expect((await device.get('/api/orders')).body.error.code).toBe('password_change_required');
    expect((await device.get('/api/me')).status).toBe(200);
    expect((await device.post('/api/me/password', { currentPassword: 'Temporaire-2026!', newPassword: 'Mon-Nouveau-Mot-2026' })).status).toBe(204);
    expect((await device.get('/api/orders')).status).toBe(200);
    expect((await device.get('/api/me')).body.user.mustChangePassword).toBe(false);
    expect(auditActions(ctx)).toContain('user.password_reset');
  });

  it('deletes a worker for good, keeping their name on their records (FR-039)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const worker = await ctx.createWorker({ permissions: reader, orderScope: 'assigned', assignedOrderIds: [order.id] });
    const exp = await seedExpense(worker, order.id, { name: 'Taxi', categoryId: 'cat-local_travel', amount: '80', currency: 'CNY' });

    expect((await owner.delete(`/api/users/${worker.userId}`)).status).toBe(204);
    expect((await worker.get('/api/me')).status).toBe(401);
    expect((await ctx.client().post('/api/auth/sign-in', { username: 'worker1', password: OWNER.password })).status).toBe(401);
    expect((await owner.get(`/api/expenses/${exp.id}`)).body.createdBy).toBe('worker1');
    expect((await owner.get(`/api/orders/${order.id}/assignees`)).body).toEqual([]);
    expect((await owner.get('/api/users')).body.items).toEqual([]);
    expect((await owner.get('/api/users?deleted=true')).body.items.map((u: any) => u.username)).toEqual(['worker1']);
    const reuse = await ctx.client().post('/api/auth/register', { username: 'worker1', displayName: 'W', password: 'Pelle-Doosan-2026', language: 'en' });
    expect(reuse.body.error.details.fields).toEqual({ username: 'username_taken' });
    expect((await owner.post(`/api/users/${worker.userId}/reactivate`)).status).toBe(404);
    expect(auditActions(ctx)).toContain('user.deleted');
  });

  it('edits the display name and language, and shows the sign-in history (FR-035)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const worker = await ctx.createWorker({ permissions: reader });
    const edited = await owner.patch(`/api/users/${worker.userId}`, { displayName: 'Youssef Benali', language: 'ar' });
    expect(edited.body).toMatchObject({ displayName: 'Youssef Benali', language: 'ar' });
    const history = (await owner.get(`/api/users/${worker.userId}/sign-in-history`)).body;
    expect(history.items[0]).toMatchObject({ outcome: 'success' });
    expect(auditActions(ctx)).toContain('user.updated');
  });

  it('never acts on the Owner (FR-040)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const ownerId = (await owner.get('/api/me')).body.user.id;
    for (const [method, path, body] of [
      ['POST', `/api/users/${ownerId}/suspend`, undefined],
      ['POST', `/api/users/${ownerId}/password`, { temporaryPassword: 'Temporaire-2026!' }],
      ['POST', `/api/users/${ownerId}/sign-out-everywhere`, undefined],
      ['DELETE', `/api/users/${ownerId}`, undefined],
      ['PATCH', `/api/users/${ownerId}`, { displayName: 'X' }],
    ] as const) {
      expect({ path, status: (await owner.request(method, path, body)).status }).toEqual({ path, status: 403 });
    }
  });
});
