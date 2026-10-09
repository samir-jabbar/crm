import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/clock';
import { auditActions, createTestContext, OWNER, seedOrder } from '../helpers';

const YOUSSEF = { username: 'youssef', displayName: 'Youssef', password: 'Pelle-Doosan-2026', language: 'fr' };

// 005 quickstart W1–W4 / US1, FR-001 – FR-006.
describe('registration and approval', () => {
  it('creates a pending account that cannot sign in until approved (W1)', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const visitor = ctx.client('198.51.100.7');

    expect((await visitor.get('/api/auth/registration')).body).toEqual({ open: true });
    const res = await visitor.post('/api/auth/register', YOUSSEF);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ status: 'pending' });

    const right = await visitor.post('/api/auth/sign-in', { username: 'Youssef ', password: YOUSSEF.password });
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe('account_pending');
    const wrong = await visitor.post('/api/auth/sign-in', { username: 'youssef', password: 'not-the-password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('invalid_credentials');
    expect(ctx.sqlite.prepare("select reason from sign_in_attempts where username_normalized = 'youssef' order by rowid").all()).toEqual([
      { reason: 'account_pending' },
      { reason: 'invalid_credentials' },
    ]);
    expect(auditActions(ctx)).toContain('user.registered');

    // A correct password on a pending account is not a guess: it never triggers the brute-force block.
    for (let i = 0; i < 6; i++) {
      expect((await visitor.post('/api/auth/sign-in', { username: 'youssef', password: YOUSSEF.password })).status).toBe(403);
    }
  });

  it('validates like setup and refuses a taken username, whatever its state', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const visitor = ctx.client();
    const bad = await visitor.post('/api/auth/register', { ...YOUSSEF, username: 'yo', password: 'short' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields).toMatchObject({ username: 'username_invalid', password: 'password_too_short' });
    expect((await visitor.post('/api/auth/register', { ...YOUSSEF, username: OWNER.username })).body.error.details.fields).toEqual({
      username: 'username_taken',
    });
    await visitor.post('/api/auth/register', YOUSSEF);
    expect((await visitor.post('/api/auth/register', { ...YOUSSEF, username: 'YOUSSEF' })).body.error.details.fields).toEqual({
      username: 'username_taken',
    });
  });

  it('lets the Owner see pending registrations and approve one with a template (W2)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const phone = ctx.client('198.51.100.7', 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36');
    await phone.post('/api/auth/register', YOUSSEF);

    const list = await owner.get('/api/users');
    expect(list.status).toBe(200);
    expect(list.body.pendingCount).toBe(1);
    const pending = list.body.items.find((u: any) => u.username === 'youssef');
    expect(pending).toMatchObject({ displayName: 'Youssef', language: 'fr', status: 'pending', template: null });
    expect(pending.registration.deviceLabel).toMatch(/Android/);

    const approved = await owner.post(`/api/users/${pending.id}/approve`, { templateId: 'tpl-read_only' });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({
      status: 'active',
      orderScope: 'all',
      ownEntriesOnly: false,
      template: { id: 'tpl-read_only', defaultKey: 'read_only', deleted: false },
      adjusted: false,
    });
    expect(approved.body.permissions.modules.orders).toEqual(['view']);
    expect((await owner.get('/api/users')).body.pendingCount).toBe(0);
    expect((await owner.post(`/api/users/${pending.id}/approve`, { templateId: 'tpl-read_only' })).body.error.code).toBe('already_decided');

    // The worker signs in in French and can look but not change anything.
    const signIn = await phone.post('/api/auth/sign-in', { username: 'youssef', password: YOUSSEF.password });
    expect(signIn.status).toBe(200);
    expect(signIn.body.user.language).toBe('fr');
    expect(signIn.body.access).toMatchObject({ owner: false, orderScope: 'all', basicOrdersOnly: false });
    expect((await phone.get(`/api/orders/${order.id}`)).status).toBe(200);
    expect((await phone.patch(`/api/orders/${order.id}/status`, { status: 'confirmed' })).status).toBe(403);
    expect(auditActions(ctx)).toContain('user.approved');
  });

  it('can adjust the access while approving, and refuses combinations that cannot work', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    await ctx.client().post('/api/auth/register', YOUSSEF);
    const id = (await owner.get('/api/users')).body.items.find((u: any) => u.status === 'pending').id;
    const conflict = await owner.post(`/api/users/${id}/approve`, {
      templateId: 'tpl-read_only',
      access: { permissions: { modules: { orders: ['create'], customers: ['view'] }, hidden: ['sellingPrice'] }, orderScope: 'all', ownEntriesOnly: false, accessEndsOn: null },
    });
    expect(conflict.status).toBe(400);
    expect(conflict.body.error).toEqual({ code: 'permission_conflict', details: { reason: 'orders_create_needs_prices' } });
    const ok = await owner.post(`/api/users/${id}/approve`, {
      templateId: 'tpl-read_only',
      access: { permissions: { modules: { expenses: ['create'] }, hidden: [] }, orderScope: 'all', ownEntriesOnly: true, accessEndsOn: null },
    });
    expect(ok.body).toMatchObject({ permissions: { modules: { expenses: ['view', 'create'] } }, ownEntriesOnly: true, adjusted: true });
  });

  it('frees the username of a rejected registration (W3)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const visitor = ctx.client();
    await visitor.post('/api/auth/register', { ...YOUSSEF, username: 'test1' });
    const id = (await owner.get('/api/users')).body.items[0]?.id ?? (await owner.get('/api/users?status=pending')).body.items[0].id;
    expect((await owner.post(`/api/users/${id}/reject`)).status).toBe(204);
    expect((await owner.post(`/api/users/${id}/reject`)).body.error.code).toBe('already_decided');
    expect((await visitor.post('/api/auth/sign-in', { username: 'test1', password: YOUSSEF.password })).status).toBe(401);
    expect((await visitor.post('/api/auth/register', { ...YOUSSEF, username: 'test1' })).status).toBe(201);
    expect((await owner.get('/api/users?deleted=true')).body.items.map((u: any) => u.id)).not.toContain(id);
    expect(auditActions(ctx)).toContain('user.rejected');
  });

  it('can be closed by the Owner, and is limited per network origin (W4)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    expect((await owner.patch('/api/settings', { registrationOpen: false })).status).toBe(200);
    const visitor = ctx.client('198.51.100.9');
    expect((await visitor.get('/api/auth/registration')).body).toEqual({ open: false });
    expect((await visitor.post('/api/auth/register', YOUSSEF)).body.error.code).toBe('registration_closed');
    await owner.patch('/api/settings', { registrationOpen: true });

    for (let i = 1; i <= 5; i++) {
      expect((await visitor.post('/api/auth/register', { ...YOUSSEF, username: `worker${i}` })).status).toBe(201);
    }
    const sixth = await visitor.post('/api/auth/register', { ...YOUSSEF, username: 'worker6' });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('too_many_attempts');
    // Another network origin is not affected, and the limit lifts after an hour.
    expect((await ctx.client('198.51.100.10').post('/api/auth/register', { ...YOUSSEF, username: 'worker7' })).status).toBe(201);
    ctx.clock.advance(61 * MINUTE_MS);
    expect((await visitor.post('/api/auth/register', { ...YOUSSEF, username: 'worker6' })).status).toBe(201);
  });

  it('keeps every user-management route for the Owner only', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const worker = await ctx.createWorker({ permissions: { modules: { settings: ['edit'], orders: ['view'] }, hidden: [] } });
    expect((await worker.get('/api/users')).status).toBe(403);
    expect((await worker.post('/api/users/x/approve', { templateId: 'tpl-read_only' })).status).toBe(403);
    expect((await worker.patch('/api/settings', { registrationOpen: false })).status).toBe(403);
  });
});
