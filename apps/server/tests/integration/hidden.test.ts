import type { PermissionSet } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';
import { createTestContext, seedCustomer, seedExpense, seedOrder, seedPayment, seedSupplier, TINY_JPEG, type TestContext, type TestClient } from '../helpers';

const SEES_ALL: PermissionSet['modules'] = {
  orders: ['view', 'edit'],
  customers: ['view', 'edit'],
  expenses: ['view', 'create', 'edit'],
  'payments.direct': ['view'],
  'payments.bank': ['view'],
};

/** The quickstart seed: sentinel values that must never leak (W14–W18). */
async function seed(ctx: TestContext, owner: TestClient) {
  const customer = await seedCustomer(owner, { name: 'Atlas Engins', phone: '+212 600 99 88 77', email: 'achat@atlas.ma', notes: 'WhatsApp only' });
  const supplier = await seedSupplier(owner, { name: 'Shandong Lingong' });
  const order = await seedOrder(owner, {
    customerId: customer.id,
    agreedPrice: '777123.45',
    budgetCny: '5500000',
    items: [{ productName: 'Excavator', quantity: 1, unitPrice: '654321.09', supplierId: supplier.id }],
  });
  const receipt = await owner.upload('/api/receipts', { bytes: TINY_JPEG, filename: 'r.jpg', type: 'image/jpeg' });
  const purchase = await seedExpense(owner, order.id, {
    name: 'Machine',
    categoryId: 'cat-equipment_purchase',
    amount: '88888.88',
    currency: 'CNY',
    paidToSupplierId: supplier.id,
    receiptId: receipt.body.id,
  });
  const receipt2 = await owner.upload('/api/receipts', { bytes: TINY_JPEG, filename: 'h.jpg', type: 'image/jpeg' });
  const hotel = await seedExpense(owner, order.id, { name: 'Hotel', categoryId: 'cat-hotel_accommodation', amount: '1200', currency: 'CNY', receiptId: receipt2.body.id });
  const proof = await owner.upload('/api/payment-proofs', { bytes: TINY_JPEG, filename: 'p.jpg', type: 'image/jpeg' });
  const bank = await seedPayment(owner, order.id, {
    channel: 'bank',
    amount: '31415.92',
    bank: { rate: '7.05', name: 'Bank of China', rateType: 'buying', at: '2026-10-07T02:30:00.000Z' },
    proofId: proof.body.id,
  });
  void ctx;
  return { customer, supplier, order, purchase, hotel, bank };
}

/** Every GET this viewer can make about the seeded order, as one string. */
async function everything(worker: TestClient, s: Awaited<ReturnType<typeof seed>>) {
  const paths = [
    '/api/orders',
    `/api/orders/${s.order.id}`,
    `/api/orders/${s.order.id}/expenses`,
    `/api/orders/${s.order.id}/payments`,
    `/api/customers`,
    `/api/customers/${s.customer.id}`,
    `/api/customers/${s.customer.id}/orders`,
    `/api/expenses/${s.purchase.id}`,
    `/api/expenses/${s.hotel.id}`,
    `/api/payments/${s.bank.id}`,
    '/api/expenses/reimbursements',
  ];
  let text = '';
  for (const path of paths) text += JSON.stringify((await worker.get(path)).body);
  return text;
}

// 005 quickstart W14–W18 / US4, FR-025 – FR-033.
describe('hidden values', () => {
  it('hides the selling price and everything computed from it (W14)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const s = await seed(ctx, owner);
    const worker = await ctx.createWorker({ permissions: { modules: SEES_ALL, hidden: ['sellingPrice'] } });

    const order = (await worker.get(`/api/orders/${s.order.id}`)).body;
    for (const key of ['agreedPrice', 'agreedRate', 'budgetCny', 'itemsTotal', 'priceDifference']) expect(order, key).not.toHaveProperty(key);
    expect(order.items[0]).not.toHaveProperty('unitPrice');
    expect(order.items[0]).not.toHaveProperty('lineTotal');
    expect(order.items[0].productName).toBe('Excavator');
    for (const key of ['agreedPriceCny', 'profit', 'marginPercent', 'budgetUsedPercent', 'remaining', 'percentPaid', 'remainingCny', 'fxResultCny']) {
      expect(order.financials, key).not.toHaveProperty(key);
    }
    expect(order.financials).toMatchObject({ expensesTotal: '90088.88', received: '31415.92' });
    const summary = (await worker.get(`/api/orders/${s.order.id}/payments`)).body.summary;
    expect(summary).not.toHaveProperty('agreedPrice');
    expect(summary).not.toHaveProperty('warnings');
    const bankChannel = summary.channels.find((c: any) => c.channel === 'bank');
    expect(bankChannel).not.toHaveProperty('planned');
    expect(bankChannel).not.toHaveProperty('remaining');
    expect(bankChannel.received).toBe('31415.92');
    expect(summary.plan[0]).not.toHaveProperty('amount');
    const text = await everything(worker, s);
    expect(text).not.toMatch(/777123|654321|5500000/);
  });

  it('hides payment amounts, rates and proofs (W15)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const s = await seed(ctx, owner);
    const worker = await ctx.createWorker({ permissions: { modules: SEES_ALL, hidden: ['paymentAmounts'] } });
    const payment = (await worker.get(`/api/payments/${s.bank.id}`)).body;
    expect(payment).toMatchObject({ channel: 'bank', type: 'balance', paymentDate: '2026-10-07' });
    for (const key of ['amount', 'rates', 'marketRate', 'cnyAmount', 'countsAs', 'usdAmount', 'madAmount', 'gap', 'proofId', 'hasProof']) {
      expect(payment, key).not.toHaveProperty(key);
    }
    expect(payment.bank).toEqual({ name: 'Bank of China', rateType: 'buying', at: '2026-10-07T02:30:00.000Z' });
    expect((await worker.get(`/api/payments/${s.bank.id}/proof`)).status).toBe(404);
    const text = await everything(worker, s);
    expect(text).not.toMatch(/31415|7\.05|221482/);
  });

  it('hides customer contact details, also from search (W16)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const s = await seed(ctx, owner);
    const worker = await ctx.createWorker({ permissions: { modules: SEES_ALL, hidden: ['customerContacts'] } });
    const customer = (await worker.get(`/api/customers/${s.customer.id}`)).body;
    expect(customer.name).toBe('Atlas Engins');
    for (const key of ['phone', 'email', 'notes']) expect(customer, key).not.toHaveProperty(key);
    expect((await worker.get('/api/customers?q=600%2099%2088')).body.items).toEqual([]);
    expect((await worker.get('/api/customers?q=atlas')).body.items).toHaveLength(1);
    expect(await everything(worker, s)).not.toMatch(/600 99|atlas\.ma|WhatsApp/);

    // Saving the customer keeps what the worker cannot see (FR-031).
    expect((await worker.patch(`/api/customers/${s.customer.id}`, { city: 'Rabat' })).status).toBe(200);
    expect((await owner.get(`/api/customers/${s.customer.id}`)).body).toMatchObject({ city: 'Rabat', phone: '+212 600 99 88 77', notes: 'WhatsApp only' });
  });

  it('hides supplier purchase prices and the totals that include them (W17)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const s = await seed(ctx, owner);
    const worker = await ctx.createWorker({ permissions: { modules: SEES_ALL, hidden: ['supplierPrices'] } });
    const { items, totals } = (await worker.get(`/api/orders/${s.order.id}/expenses`)).body;
    const machine = items.find((e: any) => e.id === s.purchase.id);
    expect(machine.name).toBe('Machine');
    for (const key of ['amount', 'rate', 'cnyAmount', 'receiptId', 'hasReceipt']) expect(machine, key).not.toHaveProperty(key);
    expect(items.find((e: any) => e.id === s.hotel.id)).toMatchObject({ amount: '1200.00', hasReceipt: true });
    expect(totals).not.toHaveProperty('grand');
    expect(totals).not.toHaveProperty('unpaid');
    expect(totals).not.toHaveProperty('byAdvancedBy');
    expect(totals.byCategory.map((c: any) => c.category.id)).toEqual(['cat-hotel_accommodation']);
    expect((await worker.get(`/api/expenses/${s.purchase.id}/receipt`)).status).toBe(404);
    expect((await worker.get(`/api/expenses/${s.hotel.id}/receipt`)).status).toBe(200);
    const financials = (await worker.get(`/api/orders/${s.order.id}`)).body.financials;
    for (const key of ['expensesTotal', 'unpaid', 'profit', 'marginPercent', 'budgetUsedPercent']) expect(financials, key).not.toHaveProperty(key);
    expect(await everything(worker, s)).not.toMatch(/88888|90088/);

    // Purchases cannot be recorded or changed by this worker.
    const create = await worker.post(`/api/orders/${s.order.id}/expenses`, { name: 'Engine', categoryId: 'cat-equipment_purchase', amount: '1', currency: 'CNY', expenseDate: '2026-10-07' });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('purchase_hidden');
    expect((await worker.patch(`/api/expenses/${s.purchase.id}/status`, { status: 'paid' })).status).toBe(403);
  });

  it('hides supplier identity and the bank named on payments', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const s = await seed(ctx, owner);
    const worker = await ctx.createWorker({ permissions: { modules: SEES_ALL, hidden: ['supplierIdentity', 'bankDetails'] } });
    const order = (await worker.get(`/api/orders/${s.order.id}`)).body;
    expect(order.items[0]).not.toHaveProperty('supplier');
    expect((await worker.get(`/api/expenses/${s.purchase.id}`)).body).not.toHaveProperty('paidTo');
    expect((await worker.get(`/api/payments/${s.bank.id}`)).body.bank).toEqual({ rate: '7.050000', rateType: 'buying', at: '2026-10-07T02:30:00.000Z' });
    expect(await everything(worker, s)).not.toMatch(/Lingong|Bank of China/);
  });

  it('keeps hidden values on save, makes items read-only and refuses closing (W18)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const s = await seed(ctx, owner);
    const worker = await ctx.createWorker({ permissions: { modules: SEES_ALL, hidden: ['sellingPrice'] } });
    const res = await worker.put(`/api/orders/${s.order.id}`, {
      title: 'Renamed by the worker',
      customerId: s.customer.id,
      currency: 'USD',
      expectedDeliveryDate: '2026-12-01',
      items: [{ productName: 'Changed', quantity: 9 }],
    });
    expect(res.status).toBe(200);
    const after = (await owner.get(`/api/orders/${s.order.id}`)).body;
    expect(after).toMatchObject({ title: 'Renamed by the worker', expectedDeliveryDate: '2026-12-01', agreedPrice: '777123.45', agreedRate: '7.100000', budgetCny: '5500000.00' });
    expect(after.items).toHaveLength(1);
    expect(after.items[0]).toMatchObject({ productName: 'Excavator', quantity: 1, unitPrice: '654321.09' });

    const close = await worker.patch(`/api/orders/${s.order.id}/status`, { status: 'closed', confirmOutstanding: true });
    expect(close.status).toBe(403);
    expect((await worker.patch(`/api/orders/${s.order.id}/status`, { status: 'confirmed' })).status).toBe(200);
  });
});
