import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/clock';
import { createTestContext, seedCustomer, seedOrder, seedSupplier } from '../helpers';

const names = (res: { body: { items: { name: string }[] } }) => res.body.items.map((c) => c.name);

// 002 quickstart V9, V10 / US3, FR-001 – FR-007.
describe('address book', () => {
  it('lists customers by name with search over name, company, city and phone', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    await seedCustomer(owner, { name: 'Zahra Trading', city: 'Rabat', phone: '+212 600 111 222' });
    await seedCustomer(owner, { name: 'atlas Équipements', company: 'Groupe Atlas', city: 'Agadir' });
    await seedCustomer(owner, { name: 'شركة الدار البيضاء', city: 'Casablanca' });

    const all = await owner.get('/api/customers');
    expect(names(all)).toEqual(['atlas Équipements', 'Zahra Trading', 'شركة الدار البيضاء']);
    expect(names(await owner.get('/api/customers?q=equipements'))).toEqual(['atlas Équipements']);
    expect(names(await owner.get('/api/customers?q=groupe'))).toEqual(['atlas Équipements']);
    expect(names(await owner.get('/api/customers?q=rabat'))).toEqual(['Zahra Trading']);
    expect(names(await owner.get('/api/customers?q=111'))).toEqual(['Zahra Trading']);
    expect(names(await owner.get(`/api/customers?q=${encodeURIComponent('الدار')}`))).toEqual(['شركة الدار البيضاء']);
  });

  it('paginates with an offset cursor', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    for (const n of ['A', 'B', 'C']) await seedCustomer(owner, { name: n });
    const first = await owner.get('/api/customers?limit=2');
    expect(names(first)).toEqual(['A', 'B']);
    const second = await owner.get(`/api/customers?limit=2&cursor=${first.body.nextCursor}`);
    expect(names(second)).toEqual(['C']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('edits a customer and audits only the changed fields', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    const res = await owner.patch(`/api/customers/${customer.id}`, { phone: '+212 5 22 00 00 00', email: '' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'MJTR Gold', phone: '+212 5 22 00 00 00', email: null });
    const entry = ctx.sqlite
      .prepare("select before_json, after_json from audit_entries where action = 'record.updated' and target_type = 'customer'")
      .get() as { before_json: string; after_json: string };
    expect(JSON.parse(entry.before_json)).toEqual({ phone: null });
    expect(JSON.parse(entry.after_json)).toEqual({ phone: '+212 5 22 00 00 00' });
  });

  it("lists a customer's orders newest first, with the order count", async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    await seedOrder(owner, { customerId: customer.id, title: 'First' });
    ctx.clock.advance(MINUTE_MS);
    await seedOrder(owner, { customerId: customer.id, title: 'Second' });
    await seedOrder(owner, { title: 'Other customer' });
    const res = await owner.get(`/api/customers/${customer.id}/orders`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((o: any) => o.title)).toEqual(['Second', 'First']);
    expect((await owner.get(`/api/customers/${customer.id}`)).body.orderCount).toBe(2);
  });

  it("edits a supplier and lists the orders that use it", async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const supplier = await seedSupplier(owner);
    const item = { productName: 'Excavator', quantity: 1, unitPrice: '1', supplierId: supplier.id };
    await seedOrder(owner, { title: 'Uses supplier', items: [item, { ...item, productName: 'Spare' }] });
    await seedOrder(owner, { title: 'No supplier' });
    const patched = await owner.patch(`/api/suppliers/${supplier.id}`, { wechat: 'linyi_heavy', contactPerson: 'Mr. Wang' });
    expect(patched.body).toMatchObject({ wechat: 'linyi_heavy', contactPerson: 'Mr. Wang', orderCount: 1 });
    const orders = await owner.get(`/api/suppliers/${supplier.id}/orders`);
    expect(orders.body.items.map((o: any) => o.title)).toEqual(['Uses supplier']);
    expect(names(await owner.get('/api/suppliers?q=wang'))).toEqual([supplier.name]);
  });

  it('returns 404 for unknown records', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    expect((await owner.patch('/api/customers/nope', { name: 'x' })).status).toBe(404);
    expect((await owner.get('/api/suppliers/nope/orders')).status).toBe(404);
  });
});
