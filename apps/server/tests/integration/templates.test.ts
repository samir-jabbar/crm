import { describe, expect, it } from 'vitest';
import { auditActions, createTestContext } from '../helpers';

const template = (modules: Record<string, string[]>, extra: Record<string, unknown> = {}) => ({
  permissions: { modules, hidden: [] },
  orderScope: 'all',
  ownEntriesOnly: false,
  ...extra,
});
const access = (modules: Record<string, string[]>, extra: Record<string, unknown> = {}) => template(modules, { accessEndsOn: null, ...extra });

// 005 quickstart W8 / US2, FR-015 – FR-017.
describe('role templates', () => {
  it('lists the five defaults with translated names, and lets the Owner add, rename and delete templates', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const list = (await owner.get('/api/role-templates')).body;
    expect(list.map((t: any) => t.defaultKey)).toEqual(['logistics', 'site_assistant', 'accountant', 'sales_assistant', 'read_only']);
    expect(list.every((t: any) => t.name === null && t.usedBy === 0)).toBe(true);

    const created = await owner.post('/api/role-templates', { name: 'Driver', ...template({ expenses: ['create'] }, { orderScope: 'assigned', ownEntriesOnly: true }) });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Driver', defaultKey: null, permissions: { modules: { expenses: ['view', 'create'] } }, orderScope: 'assigned' });
    expect((await owner.post('/api/role-templates', { name: 'driver ', ...template({}) })).body.error.details.fields).toEqual({ name: 'name_invalid' });

    const renamed = await owner.put('/api/role-templates/tpl-accountant', { name: 'Expert-comptable', ...template({ expenses: ['view'] }) });
    expect(renamed.body.name).toBe('Expert-comptable');
    const restored = await owner.put('/api/role-templates/tpl-accountant', { name: null, ...template({ expenses: ['view'] }) });
    expect(restored.body.name).toBeNull();
    expect((await owner.put(`/api/role-templates/${created.body.id}`, { name: null, ...template({}) })).body.error.details.fields).toEqual({ name: 'name_invalid' });

    const conflict = await owner.post('/api/role-templates', { name: 'Bad', ...template({ suppliers: ['view'] }), permissions: { modules: { suppliers: ['view'] }, hidden: ['supplierIdentity'] } });
    expect(conflict.body.error).toEqual({ code: 'permission_conflict', details: { reason: 'suppliers_need_identity' } });

    expect((await owner.delete(`/api/role-templates/${created.body.id}`)).status).toBe(204);
    expect((await owner.get('/api/role-templates')).body).toHaveLength(5);
    expect((await owner.delete(`/api/role-templates/${created.body.id}`)).status).toBe(404);
    expect(auditActions(ctx)).toEqual(expect.arrayContaining(['template.created', 'template.updated', 'template.deleted']));
  });

  it('never changes workers already set up, until the template is applied again (W8)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const register = async (username: string) => {
      await ctx.client().post('/api/auth/register', { username, displayName: username, password: 'Pelle-Doosan-2026', language: 'en' });
      return (await owner.get('/api/users')).body.items.find((u: any) => u.username === username).id as string;
    };
    const older = await register('accountant1');
    await owner.post(`/api/users/${older}/approve`, { templateId: 'tpl-accountant' });

    await owner.put('/api/role-templates/tpl-accountant', { name: null, ...template({ expenses: ['view', 'edit'] }) });
    const newer = await register('accountant2');
    const approved = await owner.post(`/api/users/${newer}/approve`, { templateId: 'tpl-accountant' });
    expect(approved.body.permissions.modules).toEqual({ expenses: ['view', 'edit'] });
    expect((await owner.get(`/api/users/${older}`)).body.permissions.modules).toMatchObject({ 'payments.bank': ['view', 'export'] });
    expect((await owner.get('/api/role-templates')).body.find((t: any) => t.id === 'tpl-accountant').usedBy).toBe(2);

    const applied = await owner.post(`/api/users/${older}/apply-template`, { templateId: 'tpl-accountant' });
    expect(applied.body).toMatchObject({ permissions: { modules: { expenses: ['view', 'edit'] } }, adjusted: false });
    const adjusted = await owner.put(`/api/users/${older}/access`, access({ expenses: ['view'] }));
    expect(adjusted.body.adjusted).toBe(true);

    await owner.delete('/api/role-templates/tpl-accountant');
    const after = (await owner.get(`/api/users/${older}`)).body;
    expect(after.template).toEqual({ id: 'tpl-accountant', defaultKey: 'accountant', name: null, deleted: true });
    expect(after.permissions.modules).toEqual({ expenses: ['view'] });
    expect((await owner.post(`/api/users/${older}/apply-template`, { templateId: 'tpl-accountant' })).body.error.details.fields).toEqual({
      templateId: 'template_invalid',
    });
  });

  it('checks the scope: selected customers need at least one, and the end date cannot be in the past', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const worker = await ctx.createWorker({ permissions: { modules: { orders: ['view'] }, hidden: [] } });
    expect((await owner.put(`/api/users/${worker.userId}/access`, access({ orders: ['view'] }, { orderScope: 'customers' }))).body.error.details.fields).toEqual({
      customerIds: 'scope_customers_required',
    });
    expect((await owner.put(`/api/users/${worker.userId}/access`, access({ orders: ['view'] }, { accessEndsOn: '2020-01-01' }))).body.error.details.fields).toEqual({
      accessEndsOn: 'date_invalid',
    });
    // The Owner cannot be a target.
    const ownerId = (await owner.get('/api/me')).body.user.id;
    expect((await owner.put(`/api/users/${ownerId}/access`, access({}))).status).toBe(403);
    expect((await owner.get(`/api/users/${ownerId}`)).status).toBe(404);
  });
});
