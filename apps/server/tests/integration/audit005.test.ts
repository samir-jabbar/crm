import { describe, expect, it } from 'vitest';
import { createTestContext, seedCustomer, seedOrder } from '../helpers';

const access = (modules: Record<string, string[]>) => ({ permissions: { modules, hidden: [] }, orderScope: 'all', ownEntriesOnly: false, accessEndsOn: null });

// 005 quickstart W22 / FR-041: every registration, decision, access change and account action is audited.
describe('005 audit', () => {
  it('records each action with before and after values, filterable by person and type', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    await seedCustomer(owner, { name: 'Atlas' });
    const register = async (username: string) => {
      await ctx.client().post('/api/auth/register', { username, displayName: username, password: 'Pelle-Doosan-2026', language: 'en' });
      return (await owner.get('/api/users')).body.items.find((u: any) => u.username === username).id as string;
    };
    const kept = await register('kept1');
    const rejected = await register('rejected1');
    await owner.post(`/api/users/${kept}/approve`, { templateId: 'tpl-read_only' });
    await owner.post(`/api/users/${rejected}/reject`);
    await owner.put(`/api/users/${kept}/access`, access({ expenses: ['view'] }));
    await owner.put('/api/role-templates/tpl-accountant', { name: 'Comptable', permissions: { modules: { expenses: ['view'] }, hidden: [] }, orderScope: 'all', ownEntriesOnly: false });
    await owner.put(`/api/orders/${order.id}/assignees`, { userIds: [kept] });
    await owner.post(`/api/users/${kept}/suspend`);
    await owner.post(`/api/users/${kept}/reactivate`);
    await owner.post(`/api/users/${kept}/password`, { temporaryPassword: 'Temporaire-2026!' });
    await owner.post(`/api/users/${kept}/sign-out-everywhere`);
    await owner.patch('/api/settings', { registrationOpen: false });
    await owner.delete(`/api/users/${kept}`);

    const entries = (await owner.get('/api/audit?limit=100')).body.items as any[];
    const actions = entries.map((e) => e.action);
    for (const action of [
      'user.registered',
      'user.approved',
      'user.rejected',
      'user.access_changed',
      'template.updated',
      'order.assignees_changed',
      'user.suspended',
      'user.reactivated',
      'user.password_reset',
      'user.signed_out_everywhere',
      'settings.updated',
      'user.deleted',
    ]) {
      expect(actions, action).toContain(action);
    }
    const change = entries.find((e) => e.action === 'user.access_changed');
    expect(change.before.permissions.modules).toEqual({ orders: ['view'], customers: ['view'], suppliers: ['view'], expenses: ['view'], 'payments.bank': ['view'], shipments: ['view'], documents: ['view'], invoices: ['view'], dashboard: ['view'], rates: ['view'] });
    expect(change.after.permissions.modules).toEqual({ expenses: ['view'] });
    expect(entries.find((e) => e.action === 'settings.updated').after).toEqual({ registrationOpen: false });
    expect(JSON.stringify(entries)).not.toContain('Temporaire-2026!');

    const ownerId = (await owner.get('/api/me')).body.user.id;
    const byType = (await owner.get('/api/audit?action=user.suspended')).body.items;
    expect(byType).toHaveLength(1);
    expect(byType[0].actor.id).toBe(ownerId);
    expect((await owner.get(`/api/audit?actorId=${ownerId}&action=user.deleted`)).body.items).toHaveLength(1);
  });
});
