import { describe, expect, it } from 'vitest';
import { auditActions, createTestContext, seedCustomer, seedOrder, seedSupplier } from '../helpers';

// 002 quickstart V1–V4 / US1, FR-008 – FR-012.
describe('create order', () => {
  it('numbers orders HJ-<year>-001, -002 … and computes totals from items', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const supplier = await seedSupplier(owner);
    const first = await seedOrder(owner, {
      items: [
        { productName: 'Excavator', brandModel: 'Doosan DX225LC', year: 2021, quantity: 2, unitPrice: '85000', supplierId: supplier.id },
        { productName: 'Breaker hammer', quantity: 1, unitPrice: '12500', hsCode: '8431.49' },
      ],
    });
    expect(first.number).toBe('HJ-2026-001');
    expect(first).toMatchObject({
      status: 'draft',
      agreedPrice: '190000.00',
      currency: 'USD',
      incoterm: 'CIF',
      itemsTotal: '182500.00',
      priceDifference: '7500.00',
    });
    expect(first.items[0]).toMatchObject({ position: 0, lineTotal: '170000.00', supplier: { id: supplier.id, name: supplier.name } });
    expect(first.items[1]).toMatchObject({ position: 1, hsCode: '8431.49', supplier: null });
    expect((await seedOrder(owner)).number).toBe('HJ-2026-002');

    const fetched = await owner.get(`/api/orders/${first.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(first);
  });

  it('allows an agreed price different from the items, and an order without items', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner, { agreedPrice: '150000.5', items: [] });
    expect(order).toMatchObject({ agreedPrice: '150000.50', itemsTotal: '0.00', priceDifference: '150000.50' });
  });

  it('returns translatable field errors, including per item', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    const res = await owner.post('/api/orders', {
      title: ' ',
      customerId: customer.id,
      agreedPrice: '1.234',
      currency: 'XYZ',
      items: [{ productName: '', quantity: 0, unitPrice: '10' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toMatchObject({
      title: 'title_invalid',
      agreedPrice: 'amount_invalid',
      currency: 'currency_invalid',
      'items.0.productName': 'product_name_invalid',
      'items.0.quantity': 'quantity_invalid',
    });
  });

  it('rejects unknown customers and suppliers', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const badCustomer = await owner.post('/api/orders', {
      title: 'x',
      customerId: 'nope',
      agreedPrice: '1',
      currency: 'USD',
    });
    expect(badCustomer.body.error.details.fields).toEqual({ customerId: 'customer_invalid' });
    const customer = await seedCustomer(owner);
    const badSupplier = await owner.post('/api/orders', {
      title: 'x',
      customerId: customer.id,
      agreedPrice: '1',
      currency: 'USD',
      items: [{ productName: 'A', quantity: 1, unitPrice: '1', supplierId: 'nope' }],
    });
    expect(badSupplier.body.error.details.fields).toEqual({ 'items.0.supplierId': 'supplier_invalid' });
  });

  it('rejects a manufacturing year after next year', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    const res = await owner.post('/api/orders', {
      title: 'x',
      customerId: customer.id,
      agreedPrice: '1',
      currency: 'USD',
      items: [{ productName: 'A', quantity: 1, unitPrice: '1', year: 2030 }],
    });
    expect(res.body.error.details.fields).toEqual({ 'items.0.year': 'year_invalid' });
  });

  it('gives unique consecutive numbers to orders created at the same moment (SC-003)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    const created = await Promise.all(Array.from({ length: 50 }, () => seedOrder(owner, { customerId: customer.id })));
    const numbers = created.map((o) => o.number).sort();
    expect(new Set(numbers).size).toBe(50);
    expect(numbers[0]).toBe('HJ-2026-001');
    expect(numbers[49]).toBe('HJ-2026-050');
  });

  it('restarts the counter in January, China time', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    expect((await seedOrder(owner, { customerId: customer.id })).number).toBe('HJ-2026-001');
    ctx.clock.set(Date.parse('2026-12-31T16:05:00Z')); // 00:05 on 1 Jan 2027 in Shanghai
    const fresh = ctx.client();
    await fresh.post('/api/auth/sign-in', { username: 'hicham', password: 'Correct-Horse-Battery-9' });
    expect((await seedOrder(fresh, { customerId: customer.id })).number).toBe('HJ-2027-001');
  });

  it('audits each creation', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const entry = ctx.sqlite
      .prepare("select after_json from audit_entries where action = 'record.created' and target_type = 'order'")
      .get() as { after_json: string };
    expect(JSON.parse(entry.after_json)).toMatchObject({ number: order.number, agreedPrice: '190000.00', itemCount: 2 });
    expect(auditActions(ctx).filter((a) => a === 'record.created')).toHaveLength(2); // customer + order
  });
});
