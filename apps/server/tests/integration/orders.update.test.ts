import { describe, expect, it } from 'vitest';
import { createTestContext, seedOrder, seedSupplier } from '../helpers';

function auditFor(ctx: Awaited<ReturnType<typeof createTestContext>>, orderId: string) {
  return (
    ctx.sqlite
      .prepare("select before_json, after_json from audit_entries where action = 'record.updated' and target_id = ? order by rowid")
      .all(orderId) as { before_json: string; after_json: string }[]
  ).map((r) => ({ before: JSON.parse(r.before_json), after: JSON.parse(r.after_json) }));
}

// 002 quickstart V7 / US2, FR-010, FR-013.
describe('edit order and change status', () => {
  it('changes the status and audits before/after', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner, { status: 'confirmed' });
    const res = await owner.patch(`/api/orders/${order.id}/status`, { status: 'purchased' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('purchased');
    expect(auditFor(ctx, order.id)).toEqual([{ before: { status: 'confirmed' }, after: { status: 'purchased' } }]);
    const bad = await owner.patch(`/api/orders/${order.id}/status`, { status: 'shipped' });
    expect(bad.body.error.details.fields).toEqual({ status: 'status_invalid' });
  });

  it('replaces fields and items in one save, keeping the number', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const supplier = await seedSupplier(owner);
    const order = await seedOrder(owner);
    const [excavator, hammer] = order.items;

    const res = await owner.request('PUT', `/api/orders/${order.id}`, {
      title: '2 Doosan excavators + bucket',
      customerId: order.customer.id,
      agreedPrice: '195000',
      currency: 'USD',
      incoterm: 'CIF',
      destinationPort: 'Casablanca',
      items: [
        // reordered: a new line first, then the excavator with a new quantity; the hammer is removed
        { productName: 'Bucket', quantity: 1, unitPrice: '4000', supplierId: supplier.id },
        { id: excavator.id, productName: 'Excavator', brandModel: 'Doosan DX225LC', year: 2021, quantity: 3, unitPrice: '85000' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.number).toBe(order.number);
    expect(res.body).toMatchObject({ title: '2 Doosan excavators + bucket', agreedPrice: '195000.00', itemsTotal: '259000.00' });
    expect(res.body.items.map((i: any) => [i.position, i.productName, i.quantity])).toEqual([
      [0, 'Bucket', 1],
      [1, 'Excavator', 3],
    ]);
    expect(res.body.items[1].id).toBe(excavator.id); // updated in place
    expect(res.body.items.find((i: any) => i.id === hammer.id)).toBeUndefined();

    const [entry] = auditFor(ctx, order.id);
    expect(entry!.before).toMatchObject({ title: '2 Doosan excavators', agreedPrice: '190000.00' });
    expect(entry!.after).toMatchObject({ title: '2 Doosan excavators + bucket', agreedPrice: '195000.00' });
    expect(entry!.before.items).toHaveLength(2);
    expect(entry!.after.items).toHaveLength(2);
  });

  it('ignores item ids that belong to another order', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const one = await seedOrder(owner);
    const two = await seedOrder(owner);
    const stolenId = one.items[0].id;
    const res = await owner.request('PUT', `/api/orders/${two.id}`, {
      title: 'x',
      customerId: two.customer.id,
      agreedPrice: '1',
      currency: 'USD',
      items: [{ id: stolenId, productName: 'Hijack', quantity: 1, unitPrice: '1' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.items[0].id).not.toBe(stolenId);
    const original = await owner.get(`/api/orders/${one.id}`);
    expect(original.body.items[0].productName).toBe('Excavator');
  });

  it('does not audit a save that changes nothing', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    await owner.request('PUT', `/api/orders/${order.id}`, {
      title: order.title,
      customerId: order.customer.id,
      agreedPrice: '190000',
      currency: 'USD',
      incoterm: 'CIF',
      destinationPort: 'Casablanca',
      items: order.items.map((i: any) => ({
        id: i.id,
        productName: i.productName,
        brandModel: i.brandModel,
        year: i.year,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
    });
    expect(auditFor(ctx, order.id)).toEqual([]);
  });

  it('returns 404 for unknown orders', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    expect((await owner.patch('/api/orders/nope/status', { status: 'confirmed' })).status).toBe(404);
  });
});
