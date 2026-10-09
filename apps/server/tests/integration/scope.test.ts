import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../src/clock';
import { createTestContext, OWNER, seedCustomer, seedExpense, seedOrder, seedPayment, seedSupplier, TINY_JPEG, type TestClient } from '../helpers';

const expense = (overrides: Record<string, unknown> = {}) => ({
  name: 'Hotel Linyi',
  categoryId: 'cat-hotel_accommodation',
  amount: '1200',
  currency: 'CNY',
  expenseDate: '2026-10-07',
  ...overrides,
});
const reader = { modules: { orders: ['view'], customers: ['view'], suppliers: ['view'], expenses: ['view'], 'payments.bank': ['view'] }, hidden: [] } as const;

/** Five orders for two customers; returns them and their customers. */
async function fiveOrders(owner: TestClient) {
  const atlas = await seedCustomer(owner, { name: 'Atlas Engins' });
  const sahara = await seedCustomer(owner, { name: 'Sahara BTP' });
  const supplier = await seedSupplier(owner, { name: 'Shandong Lingong' });
  const orders = [];
  for (let i = 0; i < 5; i++) {
    orders.push(
      await seedOrder(owner, {
        title: `Order ${i}`,
        customerId: i < 3 ? atlas.id : sahara.id,
        items: i === 1 ? [{ productName: 'Loader', quantity: 1, unitPrice: '1000', supplierId: supplier.id }] : [],
      }),
    );
  }
  return { atlas, sahara, supplier, orders };
}

// 005 quickstart W10–W13 / US3, FR-018 – FR-024.
describe('data scope', () => {
  it('limits an "assigned orders" worker to their orders, everywhere (W10)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const { atlas, sahara, supplier, orders } = await fiveOrders(owner);
    const hidden = orders[2]!;
    const exp = await seedExpense(owner, hidden.id, expense());
    const pay = await seedPayment(owner, hidden.id, { channel: 'bank', amount: '1000' });
    const worker = await ctx.createWorker({ permissions: reader as any, orderScope: 'assigned', assignedOrderIds: [orders[0]!.id, orders[1]!.id] });

    const list = (await worker.get('/api/orders')).body.items.map((o: any) => o.id).sort();
    expect(list).toEqual([orders[0]!.id, orders[1]!.id].sort());
    expect((await worker.get('/api/orders?q=Order')).body.items).toHaveLength(2);
    expect((await worker.get(`/api/orders?q=${encodeURIComponent(hidden.number)}`)).body.items).toHaveLength(0);
    expect((await worker.get('/api/orders/summary')).body.openTotal).toBe(2);

    for (const path of [
      `/api/orders/${hidden.id}`,
      `/api/orders/${hidden.id}/notes`,
      `/api/orders/${hidden.id}/expenses`,
      `/api/orders/${hidden.id}/payments`,
      `/api/expenses/${exp.id}`,
      `/api/payments/${pay.id}`,
      `/api/customers/${sahara.id}`,
    ]) {
      expect({ path, status: (await worker.get(path)).status }).toEqual({ path, status: 404 });
    }
    // Customers and suppliers: only those linked to their orders.
    expect((await worker.get('/api/customers')).body.items.map((c: any) => c.id)).toEqual([atlas.id]);
    expect((await worker.get('/api/suppliers')).body.items.map((s: any) => s.id)).toEqual([supplier.id]);
    expect((await worker.get(`/api/customers/${atlas.id}/orders`)).body.items).toHaveLength(2);
    expect((await worker.get('/api/expenses/reimbursements')).status).toBe(200);

    // Nothing out of scope can be attached (and then displayed) through an id.
    const other = await seedSupplier(owner, { name: 'Weichai' });
    const writer = await ctx.createWorker({
      username: 'writer',
      permissions: { modules: { expenses: ['create'] }, hidden: [] },
      orderScope: 'assigned',
      assignedOrderIds: [orders[0]!.id],
    });
    const attach = await writer.post(`/api/orders/${orders[0]!.id}/expenses`, expense({ paidToSupplierId: other.id }));
    expect(attach.status).toBe(400);
    expect(attach.body.error.details.fields).toEqual({ supplierId: 'supplier_invalid' });
  });

  it("reaches the selected customers' orders, including new ones (W11)", async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const { atlas, orders } = await fiveOrders(owner);
    const worker = await ctx.createWorker({ permissions: reader as any, orderScope: 'customers', customerIds: [atlas.id] });
    expect((await worker.get('/api/orders')).body.items).toHaveLength(3);
    const later = await seedOrder(owner, { customerId: atlas.id, title: 'Later' });
    expect((await worker.get('/api/orders')).body.items.map((o: any) => o.id)).toContain(later.id);
    expect((await worker.get(`/api/orders/${orders[4]!.id}`)).status).toBe(404);
  });

  it('assigns and unassigns orders, from the order and from the worker (FR-019)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const { orders } = await fiveOrders(owner);
    const worker = await ctx.createWorker({ permissions: reader as any, orderScope: 'assigned' });
    expect((await worker.get('/api/orders')).body.items).toHaveLength(0);

    const set = await owner.put(`/api/orders/${orders[3]!.id}/assignees`, { userIds: [worker.userId] });
    expect(set.status).toBe(200);
    expect(set.body).toEqual([{ userId: worker.userId, displayName: 'worker1' }]);
    expect((await worker.get(`/api/orders/${orders[3]!.id}`)).status).toBe(200);

    const byUser = await owner.put(`/api/users/${worker.userId}/orders`, { orderIds: [orders[0]!.id] });
    expect(byUser.body.assignedOrders.map((o: any) => o.id)).toEqual([orders[0]!.id]);
    // W7 of US3: unassigning applies at the next request.
    expect((await worker.get(`/api/orders/${orders[3]!.id}`)).status).toBe(404);
    expect((await owner.get(`/api/orders/${orders[0]!.id}/assignees`)).body).toEqual([{ userId: worker.userId, displayName: 'worker1' }]);
    expect((await worker.get(`/api/orders/${orders[0]!.id}/assignees`)).status).toBe(403);
    const audit = ctx.sqlite.prepare("select count(*) as n from audit_entries where action = 'order.assignees_changed'").get() as { n: number };
    expect(audit.n).toBe(3);
  });

  it('assigns orders a worker creates, and adds customers they create to their selection (FR-020)', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const creator = { modules: { orders: ['create', 'edit'], customers: ['create'] }, hidden: [] } as any;
    const assigned = await ctx.createWorker({ username: 'sales1', permissions: creator, orderScope: 'assigned' });
    const order = await seedOrder(assigned, { title: 'Mine' });
    expect((await assigned.get(`/api/orders/${order.id}`)).status).toBe(200);
    expect((await assigned.get('/api/orders')).body.items.map((o: any) => o.id)).toEqual([order.id]);

    const byCustomer = await ctx.createWorker({ username: 'sales2', permissions: creator, orderScope: 'customers', customerIds: [order.customer.id] });
    const fresh = await seedCustomer(byCustomer, { name: 'Nouveau client' });
    const second = await seedOrder(byCustomer, { customerId: fresh.id, title: 'For the new customer' });
    expect((await byCustomer.get(`/api/orders/${second.id}`)).status).toBe(200);
    expect((await byCustomer.get(`/api/customers/${fresh.id}`)).status).toBe(200);
  });

  it('shows only their own expenses and payments, with "your entries" totals (W12)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    await seedExpense(owner, order.id, expense({ name: 'Excavator', categoryId: 'cat-equipment_purchase', amount: '88888.88' }));
    await seedPayment(owner, order.id, { channel: 'bank', amount: '31415.92' });
    const worker = await ctx.createWorker({
      permissions: { modules: { orders: ['view'], expenses: ['create'], 'payments.bank': ['create'] }, hidden: [] },
      orderScope: 'assigned',
      ownEntriesOnly: true,
      assignedOrderIds: [order.id],
    });
    await worker.post(`/api/orders/${order.id}/expenses`, expense({ amount: '300' }));
    await worker.post(`/api/orders/${order.id}/expenses`, expense({ name: 'Truck', categoryId: 'cat-inland_transport_china', amount: '500' }));

    const res = (await worker.get(`/api/orders/${order.id}/expenses`)).body;
    expect(res.items.map((e: any) => e.amount).sort()).toEqual(['300.00', '500.00']);
    expect(res.yourEntries).toBe(true);
    expect(res.totals.grand).toBe('800.00');
    const text = JSON.stringify(res) + JSON.stringify((await worker.get(`/api/orders/${order.id}`)).body);
    expect(text).not.toMatch(/88888|31415/);

    const payments = (await worker.get(`/api/orders/${order.id}/payments`)).body;
    expect(payments.items).toEqual([]);
    expect(payments.summary.channels[0]).not.toHaveProperty('remaining');
    expect(payments.summary.channels[0].received).toBe('0.00');
  });

  it('ends access after the end date, China time, and restores it with a later date (W13)', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const today = new Date(ctx.clock.now() + 8 * 3600_000).toISOString().slice(0, 10);
    const worker = await ctx.createWorker({ permissions: reader as any, accessEndsOn: today });
    expect((await worker.get('/api/me')).status).toBe(200);

    ctx.clock.advance(DAY_MS);
    expect((await worker.get('/api/me')).status).toBe(401);
    const again = await ctx.client().post('/api/auth/sign-in', { username: 'worker1', password: OWNER.password });
    expect(again.status).toBe(403);
    expect(again.body.error).toEqual({ code: 'access_ended', details: { date: today } });
    // A day later the Owner's own session has timed out too: sign in again.
    const ownerAgain = ctx.client();
    await ownerAgain.post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
    const listed = (await ownerAgain.get('/api/users')).body.items.find((u: any) => u.id === worker.userId);
    expect(listed.accessEnded).toBe(true);

    const later = new Date(ctx.clock.now() + 8 * 3600_000 + 30 * DAY_MS).toISOString().slice(0, 10);
    await ownerAgain.put(`/api/users/${worker.userId}/access`, { permissions: reader, orderScope: 'all', ownEntriesOnly: false, accessEndsOn: later });
    expect((await ctx.client().post('/api/auth/sign-in', { username: 'worker1', password: OWNER.password })).status).toBe(200);
  });

  it('serves receipts and proofs only within scope (FR-024)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const upload = await owner.upload('/api/receipts', { bytes: TINY_JPEG, filename: 'r.jpg', type: 'image/jpeg' });
    const exp = await seedExpense(owner, order.id, expense({ receiptId: upload.body.id }));
    const outside = await ctx.createWorker({ permissions: reader as any, orderScope: 'assigned' });
    expect((await outside.get(`/api/expenses/${exp.id}/receipt`)).status).toBe(404);
    const inside = await ctx.createWorker({ username: 'inside', permissions: reader as any, orderScope: 'assigned', assignedOrderIds: [order.id] });
    expect((await inside.get(`/api/expenses/${exp.id}/receipt`)).status).toBe(200);
  });
});
