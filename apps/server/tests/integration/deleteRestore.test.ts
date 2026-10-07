import { describe, expect, it } from 'vitest';
import { auditActions, createTestContext, seedCustomer, seedOrder, seedSupplier } from '../helpers';

// 002 quickstart V13, V14 / US5, FR-019 – FR-021, SC-008.
describe('delete and restore', () => {
  it('hides a deleted order everywhere and restores it intact', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    const order = await seedOrder(owner, { customerId: customer.id, status: 'confirmed' });
    await owner.post(`/api/orders/${order.id}/notes`, { body: 'Keep me' });

    expect((await owner.delete(`/api/orders/${order.id}`)).status).toBe(204);
    expect((await owner.get('/api/orders')).body.items).toEqual([]);
    expect((await owner.get('/api/orders?q=doosan')).body.items).toEqual([]);
    expect((await owner.get(`/api/customers/${customer.id}/orders`)).body.items).toEqual([]);
    expect((await owner.get('/api/orders/summary')).body.openTotal).toBe(0);
    expect((await owner.get(`/api/orders/${order.id}`)).status).toBe(404);
    expect((await owner.delete(`/api/orders/${order.id}`)).status).toBe(404);

    const deleted = await owner.get('/api/orders?deleted=true');
    expect(deleted.body.items.map((o: any) => o.id)).toEqual([order.id]);
    expect(deleted.body.items[0].deletedAt).not.toBeNull();
    expect((await owner.get(`/api/orders/${order.id}?deleted=true`)).status).toBe(200);

    const restored = await owner.post(`/api/orders/${order.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body).toEqual({ ...order, updatedAt: restored.body.updatedAt, status: 'confirmed' });
    expect((await owner.get(`/api/orders/${order.id}/notes`)).body.items).toHaveLength(1);
    expect((await owner.post(`/api/orders/${order.id}/restore`)).status).toBe(404);
    expect(auditActions(ctx)).toEqual(expect.arrayContaining(['record.deleted', 'record.restored']));
  });

  it('never reuses the number of a deleted order', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const first = await seedOrder(owner);
    await owner.delete(`/api/orders/${first.id}`);
    expect((await seedOrder(owner)).number).toBe('HJ-2026-002');
  });

  it('refuses to delete a customer or supplier that orders still use', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    const supplier = await seedSupplier(owner);
    const item = { productName: 'Excavator', quantity: 1, unitPrice: '1', supplierId: supplier.id };
    await seedOrder(owner, { customerId: customer.id, items: [item] });
    const second = await seedOrder(owner, { customerId: customer.id, items: [item] });

    const res = await owner.delete(`/api/customers/${customer.id}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'in_use', details: { count: 2 } } });
    expect((await owner.delete(`/api/suppliers/${supplier.id}`)).body).toEqual({ error: { code: 'in_use', details: { count: 2 } } });

    // Deleted orders don't count.
    await owner.delete(`/api/orders/${second.id}`);
    expect((await owner.delete(`/api/customers/${customer.id}`)).body.error.details).toEqual({ count: 1 });
  });

  it('deletes and restores an unused customer and supplier', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner, { name: 'Unused customer' });
    const supplier = await seedSupplier(owner, { name: 'Unused supplier' });

    expect((await owner.delete(`/api/customers/${customer.id}`)).status).toBe(204);
    expect((await owner.delete(`/api/suppliers/${supplier.id}`)).status).toBe(204);
    expect((await owner.get('/api/customers?q=unused')).body.items).toEqual([]);
    expect((await owner.get('/api/suppliers?q=unused')).body.items).toEqual([]);
    expect((await owner.get('/api/customers?deleted=true')).body.items.map((c: any) => c.name)).toEqual(['Unused customer']);

    expect((await owner.post(`/api/customers/${customer.id}/restore`)).status).toBe(200);
    expect((await owner.post(`/api/suppliers/${supplier.id}/restore`)).status).toBe(200);
    expect((await owner.get('/api/customers?q=unused')).body.items).toHaveLength(1);
  });

  it("refuses to restore an order whose customer is deleted", async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    const order = await seedOrder(owner, { customerId: customer.id });
    await owner.delete(`/api/orders/${order.id}`);
    await owner.delete(`/api/customers/${customer.id}`);
    const res = await owner.post(`/api/orders/${order.id}/restore`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'customer_deleted' } });
    await owner.post(`/api/customers/${customer.id}/restore`);
    expect((await owner.post(`/api/orders/${order.id}/restore`)).status).toBe(200);
  });

  it('a deleted customer cannot be used for a new order', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    await owner.delete(`/api/customers/${customer.id}`);
    const res = await owner.post('/api/orders', { title: 'x', customerId: customer.id, agreedPrice: '1', currency: 'USD' });
    expect(res.body.error.details.fields).toEqual({ customerId: 'customer_invalid' });
  });
});
