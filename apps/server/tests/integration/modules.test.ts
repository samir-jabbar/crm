import { MODULE_ACTIONS, MODULES, type PermissionSet } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';
import { createTestContext, seedExpense, seedOrder, seedPayment } from '../helpers';

const expense = { name: 'Hotel Linyi', categoryId: 'cat-hotel_accommodation', amount: '1200', currency: 'CNY', expenseDate: '2026-10-07' };
const every: PermissionSet = { modules: Object.fromEntries(MODULES.map((m) => [m, [...MODULE_ACTIONS[m]]])), hidden: [] };

// 005 quickstart W5–W9 / US2, FR-007 – FR-014.
describe('modules and actions', () => {
  it('gives an Expenses View + Create worker the basic order view and the Expenses tab, nothing else (W5)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const existing = await seedExpense(owner, order.id, expense);
    const worker = await ctx.createWorker({ permissions: { modules: { expenses: ['create'] }, hidden: [] } });

    const list = await worker.get('/api/orders');
    expect(list.status).toBe(200);
    expect(list.body.items[0]).toEqual({
      id: order.id,
      number: order.number,
      title: order.title,
      customer: order.customer,
      status: 'draft',
      createdAt: order.createdAt,
      deletedAt: null,
    });
    const detail = await worker.get(`/api/orders/${order.id}`);
    expect(Object.keys(detail.body).sort()).toEqual(['createdAt', 'customer', 'deletedAt', 'id', 'number', 'status', 'title']);

    expect((await worker.get(`/api/orders/${order.id}/expenses`)).status).toBe(200);
    expect((await worker.post(`/api/orders/${order.id}/expenses`, expense)).status).toBe(201);
    expect((await worker.put(`/api/expenses/${existing.id}`, { ...expense, amount: '1' })).status).toBe(403);
    expect((await worker.delete(`/api/expenses/${existing.id}`)).status).toBe(403);
    for (const path of [`/api/orders/${order.id}/notes`, `/api/orders/${order.id}/payments`, '/api/customers', '/api/suppliers', '/api/settings', '/api/audit', '/api/orders/summary']) {
      expect({ path, status: (await worker.get(path)).status }).toEqual({ path, status: 403 });
    }
    expect((await worker.patch(`/api/orders/${order.id}/status`, { status: 'confirmed' })).status).toBe(403);
    expect((await worker.post('/api/orders', { title: 'x' })).status).toBe(403);
  });

  it('shows a Bank-only worker nothing about Direct payments (W7)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const direct = await seedPayment(owner, order.id, { channel: 'direct', type: 'deposit', amount: '57000' });
    await seedPayment(owner, order.id, { channel: 'bank', amount: '1000' });
    const worker = await ctx.createWorker({ permissions: { modules: { orders: ['view'], 'payments.bank': ['view'] }, hidden: [] } });

    const { items, summary } = (await worker.get(`/api/orders/${order.id}/payments`)).body;
    expect(items.map((p: any) => p.channel)).toEqual(['bank']);
    expect(summary.channels.map((c: any) => c.channel)).toEqual(['bank']);
    expect(summary.plan.map((s: any) => s.channel)).toEqual(['bank']);
    expect(summary.channels[0]).toMatchObject({ planned: '133000.00', received: '1000.00', remaining: '132000.00' });
    for (const key of ['received', 'remaining', 'overpaid', 'percentPaid', 'receivedTotals', 'averageRates', 'remainingCny', 'fxResultCny', 'warnings']) {
      expect(summary, key).not.toHaveProperty(key);
    }
    const financials = (await worker.get(`/api/orders/${order.id}`)).body.financials;
    for (const key of ['received', 'remaining', 'percentPaid', 'receivedCny', 'remainingCny', 'fxResultCny', 'profit', 'marginPercent', 'overpaid']) {
      expect(financials, key).not.toHaveProperty(key);
    }
    expect((await worker.get(`/api/payments/${direct.id}`)).status).toBe(403);
    expect(JSON.stringify((await worker.get(`/api/orders/${order.id}/payments`)).body)).not.toMatch(/direct|57000/);
  });

  it('applies a permission change at the next request, without signing out (W6)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const worker = await ctx.createWorker({ permissions: { modules: { expenses: ['create'] }, hidden: [] } });
    expect((await worker.post(`/api/orders/${order.id}/expenses`, expense)).status).toBe(201);

    const res = await owner.put(`/api/users/${worker.userId}/access`, {
      permissions: { modules: { expenses: ['view'] }, hidden: [] },
      orderScope: 'all',
      ownEntriesOnly: false,
      accessEndsOn: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.adjusted).toBe(true);
    expect((await worker.post(`/api/orders/${order.id}/expenses`, expense)).status).toBe(403);
    expect((await worker.get(`/api/orders/${order.id}/expenses`)).status).toBe(200);
    expect((await worker.get('/api/me')).body.access.modules).toEqual({ expenses: ['view'] });
  });

  it('never lets a worker reach user management, the audit log or the security settings (W9)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const worker = await ctx.createWorker({ permissions: every });
    for (const path of ['/api/users', '/api/role-templates', '/api/audit']) {
      expect({ path, status: (await worker.get(path)).status }).toEqual({ path, status: 403 });
    }
    const settings = await worker.get('/api/settings');
    expect(settings.status).toBe(200);
    expect(settings.body).not.toHaveProperty('sessionIdleTimeoutMinutes');
    expect(settings.body).not.toHaveProperty('registrationOpen');
    expect((await worker.patch('/api/settings', { sessionIdleTimeoutMinutes: 60 })).status).toBe(403);
    expect((await worker.patch('/api/settings', { registrationOpen: false })).status).toBe(403);
    expect((await worker.patch('/api/settings', { companyName: 'HANJING Machinery' })).status).toBe(200);
    expect((await owner.get('/api/settings')).body).toMatchObject({ companyName: 'HANJING Machinery', sessionIdleTimeoutMinutes: 720 });
  });

  it('opens each settings section only with its module (FR-009)', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const settingsOnly = await ctx.createWorker({ username: 'settingsonly', permissions: { modules: { settings: ['edit'] }, hidden: [] } });
    expect((await settingsOnly.patch('/api/settings', { orderNumberPrefix: 'HG' })).status).toBe(200);
    expect((await settingsOnly.post('/api/expense-categories', { name: 'Spare parts' })).status).toBe(403);
    expect((await settingsOnly.get('/api/settings/payments')).status).toBe(403);
    expect((await settingsOnly.get('/api/settings/exchange-rates')).status).toBe(403);

    const full = await ctx.createWorker({
      username: 'settingsfull',
      permissions: { modules: { settings: ['edit'], expenses: ['view'], 'payments.direct': ['view'], 'payments.bank': ['view'], rates: ['edit'] }, hidden: [] },
    });
    expect((await full.post('/api/expense-categories', { name: 'Spare parts' })).status).toBe(201);
    expect((await full.get('/api/settings/payments')).status).toBe(200);
    expect((await full.patch('/api/settings/payments', { channelNames: { direct: 'Cash' } })).status).toBe(200);
    expect((await full.get('/api/settings/exchange-rates')).status).toBe(200);
    // Refreshing rates is part of Exchange rates Edit (tests have no network, hence not 200).
    expect((await full.post('/api/rates/refresh')).status).not.toBe(403);
  });
});
