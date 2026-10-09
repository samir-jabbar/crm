import { describe, expect, it } from 'vitest';
import { createTestContext, seedOrder, seedPayment, type TestContext, type TestClient } from '../helpers';

const PASSWORD = 'Pelle-Doosan-2026';

/** A worker created exactly as in real use: registered, then approved by the Owner with a default template. */
async function fromTemplate(ctx: TestContext, owner: TestClient, username: string, templateId: string, orderIds: string[] = []) {
  const device = ctx.client(`198.51.100.${30 + username.length}`);
  expect((await device.post('/api/auth/register', { username, displayName: username, password: PASSWORD, language: 'fr' })).status).toBe(201);
  const id = (await owner.get('/api/users')).body.items.find((u: any) => u.username === username).id as string;
  expect((await owner.post(`/api/users/${id}/approve`, { templateId })).status).toBe(200);
  if (orderIds.length) expect((await owner.put(`/api/users/${id}/orders`, { orderIds })).status).toBe(200);
  expect((await device.post('/api/auth/sign-in', { username, password: PASSWORD })).status).toBe(200);
  return device;
}

const expense = (name: string, categoryId: string, amount: string) => ({ name, categoryId, amount, currency: 'CNY', expenseDate: '2026-10-07' });

// 005 quickstart W20 / US5: the brief's §4.9 example workers, from the default templates.
describe('the brief’s example workers', () => {
  it('a logistics worker sees only assigned orders, without prices, payments, expenses or profit', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const a = await seedOrder(owner, { title: 'Order A' });
    const b = await seedOrder(owner, { title: 'Order B' });
    const other = await seedOrder(owner, { title: 'Order C' });
    await seedPayment(owner, a.id, { channel: 'bank', amount: '31415.92' });
    const worker = await fromTemplate(ctx, owner, 'logistics1', 'tpl-logistics', [a.id, b.id]);

    expect((await worker.get('/api/orders')).body.items.map((o: any) => o.title).sort()).toEqual(['Order A', 'Order B']);
    const order = (await worker.get(`/api/orders/${a.id}`)).body;
    expect(order.items[0]).toMatchObject({ productName: 'Excavator', quantity: 2 });
    expect(order.items[0]).not.toHaveProperty('unitPrice');
    expect(order).not.toHaveProperty('agreedPrice');
    expect(order.financials).toEqual({});
    expect((await worker.get(`/api/orders/${a.id}/payments`)).status).toBe(403);
    expect((await worker.get(`/api/orders/${a.id}/expenses`)).status).toBe(403);
    expect((await worker.get(`/api/orders/${other.id}`)).status).toBe(404);
    expect((await worker.get('/api/me')).body.access.modules).toMatchObject({ shipments: ['view', 'create', 'edit'], documents: ['view', 'create'] });
  });

  it('a site/trip assistant adds expenses to the assigned order and sees only their own, and no payment', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const other = await seedOrder(owner, { title: 'Other' });
    await owner.post(`/api/orders/${order.id}/expenses`, expense('Machine', 'cat-equipment_purchase', '88888.88'));
    const worker = await fromTemplate(ctx, owner, 'site1', 'tpl-site_assistant', [order.id]);

    for (const [name, category] of [
      ['Hôtel Linyi', 'cat-hotel_accommodation'],
      ['Camion vers Qingdao', 'cat-inland_transport_china'],
      ['Manutention', 'cat-labor'],
    ] as const) {
      expect((await worker.post(`/api/orders/${order.id}/expenses`, expense(name, category, '500'))).status).toBe(201);
    }
    const list = (await worker.get(`/api/orders/${order.id}/expenses`)).body;
    expect(list.items).toHaveLength(3);
    expect(list.yourEntries).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/Machine|88888/);
    expect((await worker.get(`/api/orders/${order.id}/payments`)).status).toBe(403);
    expect((await worker.post(`/api/orders/${other.id}/expenses`, expense('Taxi', 'cat-local_travel', '50'))).status).toBe(404);
    // A purchase is not something this template may record.
    expect((await worker.post(`/api/orders/${order.id}/expenses`, expense('Pump', 'cat-equipment_purchase', '1'))).body.error.code).toBe('purchase_hidden');
  });

  it('an accountant reads expenses, Bank payments and the dashboard for all orders, and changes nothing', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const second = await seedOrder(owner, { title: 'Second' });
    await owner.post(`/api/orders/${second.id}/expenses`, expense('Hôtel', 'cat-hotel_accommodation', '1200'));
    await seedPayment(owner, order.id, { channel: 'direct', type: 'deposit', amount: '57000' });
    const bank = await seedPayment(owner, order.id, { channel: 'bank', amount: '1000' });
    const worker = await fromTemplate(ctx, owner, 'accountant1', 'tpl-accountant');

    expect((await worker.get('/api/orders')).body.items).toHaveLength(2);
    expect((await worker.get(`/api/orders/${second.id}/expenses`)).body.totals.grand).toBe('1200.00');
    const payments = (await worker.get(`/api/orders/${order.id}/payments`)).body;
    expect(payments.items.map((p: any) => p.id)).toEqual([bank.id]);
    expect(JSON.stringify(payments)).not.toMatch(/57000|direct/);
    expect((await worker.get('/api/expenses/reimbursements')).status).toBe(200);

    expect((await worker.post(`/api/orders/${order.id}/expenses`, expense('X', 'cat-other', '1'))).status).toBe(403);
    expect((await worker.put(`/api/payments/${bank.id}`, {})).status).toBe(403);
    expect((await worker.patch(`/api/orders/${order.id}/status`, { status: 'confirmed' })).status).toBe(403);
    expect((await worker.get('/api/settings')).status).toBe(403);
    expect((await worker.get('/api/me')).body.access.modules).toMatchObject({ shipments: ['view'], expenses: ['view', 'export'] });
  });
});
