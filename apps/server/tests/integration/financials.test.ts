import { describe, expect, it } from 'vitest';
import { createTestContext, seedExpense, seedOrder } from '../helpers';

const auditOf = (ctx: Awaited<ReturnType<typeof createTestContext>>, orderId: string) =>
  (
    ctx.sqlite
      .prepare("select before_json, after_json from audit_entries where action = 'record.updated' and target_id = ? order by rowid")
      .all(orderId) as { before_json: string; after_json: string }[]
  ).map((r) => ({ before: JSON.parse(r.before_json), after: JSON.parse(r.after_json) }));

/** The order as a full PUT body (every field resent), with some fields changed. */
const orderBody = (order: any, patch: Record<string, unknown> = {}) => ({
  title: order.title,
  customerId: order.customer.id,
  deliveryCity: order.deliveryCity,
  agreedPrice: order.agreedPrice,
  currency: order.currency,
  agreedRate: order.agreedRate,
  incoterm: order.incoterm,
  destinationPort: order.destinationPort,
  expectedDeliveryDate: order.expectedDeliveryDate,
  budgetCny: order.budgetCny,
  items: order.items.map((i: any) => ({
    id: i.id,
    productName: i.productName,
    brandModel: i.brandModel,
    year: i.year,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    hsCode: i.hsCode,
    specs: i.specs,
    supplierId: i.supplier?.id ?? null,
  })),
  ...patch,
});

// 003 quickstart X5–X7 / US2, FR-011 – FR-013, research R5/R6.
describe('order profit in CNY', () => {
  it('converts the agreed price at the agreed rate and subtracts expenses (X5)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner, { agreedPrice: '190000', currency: 'USD', agreedRate: '7.1' });
    expect(order.agreedRate).toBe('7.100000');
    expect(order.financials).toEqual({
      agreedPriceCny: '1349000.00',
      expensesTotal: '0.00',
      unpaid: '0.00',
      profit: '1349000.00',
      marginPercent: '100.0',
      budgetUsedPercent: null,
      profitUnavailableReason: null,
      // 004: nothing received yet, so everything remains at the agreed rate.
      received: '0.00',
      remaining: '190000.00',
      overpaid: '0.00',
      percentPaid: '0.0',
      receivedCny: '0.00',
      remainingCny: '1349000.00',
      fxResultCny: '0.00',
    });

    await seedExpense(owner, order.id, { amount: '1000000', categoryId: 'cat-equipment_purchase' });
    await seedExpense(owner, order.id, { amount: '203500', categoryId: 'cat-sea_freight' });
    const res = await owner.get(`/api/orders/${order.id}`);
    expect(res.body.financials).toMatchObject({
      agreedPriceCny: '1349000.00',
      expensesTotal: '1203500.00',
      profit: '145500.00',
      marginPercent: '10.8',
    });
  });

  it('counts unpaid expenses in costs, and shows budget used (X7)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner, { agreedRate: '7.1', budgetCny: '1200000' });
    await seedExpense(owner, order.id, { amount: '1163500' });
    await seedExpense(owner, order.id, { amount: '40000', status: 'to_pay', dueDate: '2026-11-15' });
    const { financials } = (await owner.get(`/api/orders/${order.id}`)).body;
    expect(financials).toMatchObject({
      expensesTotal: '1203500.00',
      unpaid: '40000.00',
      profit: '145500.00',
      budgetUsedPercent: '100.3',
    });
  });

  it('needs no rate for CNY orders and ignores one sent', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner, { agreedPrice: '500000', currency: 'CNY', agreedRate: '7.1', items: [] });
    expect(order.agreedRate).toBeNull();
    await seedExpense(owner, order.id, { amount: '525000' });
    const { financials } = (await owner.get(`/api/orders/${order.id}`)).body;
    expect(financials).toMatchObject({ agreedPriceCny: '500000.00', profit: '-25000.00', marginPercent: '-5.0' });
  });

  it('requires a valid agreed rate for orders not priced in CNY', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = (await seedOrder(owner)).customer;
    const base = { title: 'Loader', customerId: customer.id, agreedPrice: '1000', currency: 'MAD', items: [] };
    const missing = await owner.post('/api/orders', base);
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.fields).toEqual({ agreedRate: 'rate_required' });
    // Reported together with other field errors.
    const both = await owner.post('/api/orders', { ...base, title: '' });
    expect(both.body.error.details.fields).toEqual({ title: 'title_invalid', agreedRate: 'rate_required' });
    for (const bad of ['0', '7.1234567', '-1', 'abc']) {
      const res = await owner.post('/api/orders', { ...base, agreedRate: bad });
      expect(res.body.error.details.fields, bad).toEqual({ agreedRate: 'rate_invalid' });
    }
  });

  it('shows expenses but no profit for an older order without a rate, until it is edited (X6)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    await seedExpense(owner, order.id, { amount: '3500' });
    // An order created before 003 has no agreed rate.
    ctx.sqlite.prepare('update orders set agreed_rate_micro = null where id = ?').run(order.id);

    const legacy = (await owner.get(`/api/orders/${order.id}`)).body;
    expect(legacy.agreedRate).toBeNull();
    expect(legacy.financials).toEqual({
      agreedPriceCny: null,
      expensesTotal: '3500.00',
      unpaid: '0.00',
      profit: null,
      marginPercent: null,
      budgetUsedPercent: null,
      profitUnavailableReason: 'agreed_rate_missing',
      received: '0.00',
      remaining: '190000.00',
      overpaid: '0.00',
      percentPaid: '0.0',
      receivedCny: '0.00',
      remainingCny: null,
      fxResultCny: null,
    });

    const withoutRate = await owner.put(`/api/orders/${order.id}`, orderBody(legacy, { agreedRate: undefined }));
    expect(withoutRate.body.error.details.fields).toEqual({ agreedRate: 'rate_required' });
    const fixed = await owner.put(`/api/orders/${order.id}`, orderBody(legacy, { agreedRate: '7.1' }));
    expect(fixed.status).toBe(200);
    expect(fixed.body.financials).toMatchObject({ agreedPriceCny: '1349000.00', profit: '1345500.00', profitUnavailableReason: null });
  });

  it('follows a changed agreed rate, audits it, and copies it on duplicate', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner, { agreedRate: '7.1' });
    const changed = await owner.put(`/api/orders/${order.id}`, orderBody(order, { agreedRate: '7.2' }));
    expect(changed.body.financials.agreedPriceCny).toBe('1368000.00');
    expect(auditOf(ctx, order.id)).toEqual([{ before: { agreedRate: '7.100000' }, after: { agreedRate: '7.200000' } }]);

    const copy = await owner.post(`/api/orders/${order.id}/duplicate`, { titleSuffix: ' (copy)' });
    expect(copy.body.agreedRate).toBe('7.200000');
  });

  it('handles a zero price, no budget, and leaves deleted expenses out', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner, { agreedPrice: '0', agreedRate: '7.1', items: [] });
    const expense = await seedExpense(owner, order.id, { amount: '100' });
    expect((await owner.get(`/api/orders/${order.id}`)).body.financials).toMatchObject({
      agreedPriceCny: '0.00',
      profit: '-100.00',
      marginPercent: null,
      budgetUsedPercent: null,
    });
    ctx.sqlite.prepare('update expenses set deleted_at = 1 where id = ?').run(expense.id);
    expect((await owner.get(`/api/orders/${order.id}`)).body.financials).toMatchObject({ expensesTotal: '0.00', profit: '0.00' });
  });
});
