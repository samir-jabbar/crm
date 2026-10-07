import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/clock';
import { auditActions, createTestContext, seedOrder, seedSupplier } from '../helpers';

// 002 quickstart V11, V12 / US4, FR-016 – FR-018.
describe('duplicate order', () => {
  it('copies the deal and its items into a new Draft order with the next number', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const supplier = await seedSupplier(owner);
    const original = await seedOrder(owner, {
      status: 'on_vessel',
      deliveryCity: 'Settat',
      budgetCny: '1200000',
      expectedDeliveryDate: '2026-12-15',
      items: [
        { productName: 'Excavator', brandModel: 'Doosan DX225LC', year: 2021, quantity: 2, unitPrice: '85000', supplierId: supplier.id },
        { productName: 'Hammer', quantity: 1, unitPrice: '12500', hsCode: '8431.49', specs: 'Heavy duty' },
        { productName: 'Bucket', quantity: 1, unitPrice: '4000' },
      ],
    });
    await owner.post(`/api/orders/${original.id}/notes`, { body: 'Only on the original' });

    const res = await owner.post(`/api/orders/${original.id}/duplicate`, { titleSuffix: ' (copy)' });
    expect(res.status).toBe(201);
    const copy = res.body;
    expect(copy.id).not.toBe(original.id);
    expect(copy.number).toBe('HJ-2026-002');
    expect(copy).toMatchObject({
      title: '2 Doosan excavators (copy)',
      status: 'draft',
      customer: original.customer,
      deliveryCity: 'Settat',
      agreedPrice: original.agreedPrice,
      currency: 'USD',
      incoterm: 'CIF',
      destinationPort: 'Casablanca',
      budgetCny: '1200000.00',
      expectedDeliveryDate: null,
      itemsTotal: original.itemsTotal,
    });
    const strip = (items: any[]) => items.map(({ id: _id, ...rest }) => rest);
    expect(strip(copy.items)).toEqual(strip(original.items));
    expect(copy.items.every((i: any) => !original.items.some((o: any) => o.id === i.id))).toBe(true);
    expect((await owner.get(`/api/orders/${copy.id}/notes`)).body.items).toEqual([]);

    const entry = ctx.sqlite
      .prepare("select after_json from audit_entries where action = 'record.created' and target_id = ?")
      .get(copy.id) as { after_json: string };
    expect(JSON.parse(entry.after_json)).toMatchObject({ duplicatedFrom: original.number });
  });

  it('returns 404 for unknown orders', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    expect((await owner.post('/api/orders/nope/duplicate', {})).status).toBe(404);
  });
});

describe('order notes', () => {
  it('adds notes with author and time, newest first, and deletes them recoverably', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const first = await owner.post(`/api/orders/${order.id}/notes`, { body: 'Customer asked for an extra bucket' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ body: 'Customer asked for an extra bucket', author: { label: 'hicham' } });
    ctx.clock.advance(MINUTE_MS);
    await owner.post(`/api/orders/${order.id}/notes`, { body: 'العميل يريد التسليم قبل رمضان' });

    const list = await owner.get(`/api/orders/${order.id}/notes`);
    expect(list.body.items.map((n: any) => n.body)).toEqual(['العميل يريد التسليم قبل رمضان', 'Customer asked for an extra bucket']);

    expect((await owner.delete(`/api/orders/${order.id}/notes/${first.body.id}`)).status).toBe(204);
    expect((await owner.get(`/api/orders/${order.id}/notes`)).body.items).toHaveLength(1);
    expect((await owner.delete(`/api/orders/${order.id}/notes/${first.body.id}`)).status).toBe(404);
    const deleted = ctx.sqlite.prepare('select deleted_at from order_notes where id = ?').get(first.body.id) as { deleted_at: number };
    expect(deleted.deleted_at).not.toBeNull();
    expect(auditActions(ctx)).toEqual(expect.arrayContaining(['record.created', 'record.deleted']));
  });

  it('validates the note body', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    for (const body of ['   ', 'x'.repeat(2001)]) {
      const res = await owner.post(`/api/orders/${order.id}/notes`, { body });
      expect(res.body.error.details.fields).toEqual({ body: 'note_invalid' });
    }
  });

  it('refuses notes on unknown or deleted orders', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    expect((await owner.post('/api/orders/nope/notes', { body: 'x' })).status).toBe(404);
    expect((await owner.get('/api/orders/nope/notes')).status).toBe(404);
  });
});
