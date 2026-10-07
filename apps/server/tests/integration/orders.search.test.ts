import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/clock';
import { createTestContext, seedCustomer, seedOrder } from '../helpers';

async function withOrders() {
  const ctx = await createTestContext();
  const owner = await ctx.createOwner();
  const eloise = await seedCustomer(owner, { name: 'Éloïse Diallo' });
  const dar = await seedCustomer(owner, { name: 'شَرِكَة الدار البيضاء' });
  const hanjing = await seedCustomer(owner, { name: '汉景机械贸易' });
  const at = (minutes: number) => ctx.clock.advance(minutes * MINUTE_MS);
  const a = await seedOrder(owner, { title: 'Two excavators', customerId: eloise.id }); // items: Doosan DX225LC
  at(1);
  const b = await seedOrder(owner, {
    title: 'Concrete pump truck',
    customerId: dar.id,
    status: 'confirmed',
    items: [{ productName: 'Pump truck', brandModel: 'SANY SY5419', quantity: 1, unitPrice: '300000' }],
  });
  at(1);
  const c = await seedOrder(owner, {
    title: 'Forklifts 50% deposit',
    customerId: hanjing.id,
    status: 'on_vessel',
    items: [{ productName: 'Forklift', brandModel: 'Heli CPCD30', quantity: 3, unitPrice: '9000' }],
  });
  return { ctx, owner, eloise, dar, hanjing, a, b, c };
}

const titles = (res: { body: { items: { title: string }[] } }) => res.body.items.map((o) => o.title);

// 002 quickstart V5, V6 / US2, FR-014, SC-006.
describe('order list: search and filters', () => {
  it('lists newest first', async () => {
    const { owner } = await withOrders();
    const res = await owner.get('/api/orders');
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Forklifts 50% deposit', 'Concrete pump truck', 'Two excavators']);
    expect(res.body.items[0]).toMatchObject({ customer: { name: '汉景机械贸易' }, status: 'on_vessel', currency: 'USD' });
  });

  it('searches title, number, customer and item model across scripts', async () => {
    const { owner, a } = await withOrders();
    expect(titles(await owner.get('/api/orders?q=doosan'))).toEqual(['Two excavators']); // item model, any case
    expect(titles(await owner.get('/api/orders?q=eloise'))).toEqual(['Two excavators']); // accents ignored
    expect(titles(await owner.get(`/api/orders?q=${encodeURIComponent('شركة الدار')}`))).toEqual(['Concrete pump truck']);
    expect(titles(await owner.get(`/api/orders?q=${encodeURIComponent('汉景')}`))).toEqual(['Forklifts 50% deposit']);
    expect(titles(await owner.get('/api/orders?q=sany'))).toEqual(['Concrete pump truck']);
    expect(titles(await owner.get(`/api/orders?q=${a.number}`))).toEqual(['Two excavators']);
    expect(titles(await owner.get(`/api/orders?q=${encodeURIComponent('50%')}`))).toEqual(['Forklifts 50% deposit']);
  });

  it('filters by status list, customer and creation dates', async () => {
    const { owner, dar, b, c } = await withOrders();
    expect(titles(await owner.get('/api/orders?status=confirmed,on_vessel'))).toEqual([
      'Forklifts 50% deposit',
      'Concrete pump truck',
    ]);
    expect(titles(await owner.get(`/api/orders?status=confirmed,on_vessel&customerId=${dar.id}`))).toEqual([
      'Concrete pump truck',
    ]);
    const from = encodeURIComponent(b.createdAt);
    const to = encodeURIComponent(b.createdAt);
    expect(titles(await owner.get(`/api/orders?from=${from}&to=${to}`))).toEqual(['Concrete pump truck']);
    expect(titles(await owner.get(`/api/orders?from=${encodeURIComponent(c.createdAt)}`))).toEqual(['Forklifts 50% deposit']);
    const bad = await owner.get('/api/orders?status=shipped');
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields).toEqual({ status: 'status_invalid' });
  });

  it('paginates with a cursor', async () => {
    const { owner } = await withOrders();
    const first = await owner.get('/api/orders?limit=2');
    expect(first.body.items).toHaveLength(2);
    const second = await owner.get(`/api/orders?limit=2&cursor=${first.body.nextCursor}`);
    expect(titles(second)).toEqual(['Two excavators']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('counts open orders per status for the dashboard (FR-026)', async () => {
    const { owner, a } = await withOrders();
    await owner.patch(`/api/orders/${a.id}/status`, { status: 'delivered' });
    const res = await owner.get('/api/orders/summary');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ openByStatus: { confirmed: 1, on_vessel: 1 }, openTotal: 2 });
  });
});
