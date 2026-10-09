import { describe, expect, it } from 'vitest';
import { createTestContext, seedOrder, seedPayment } from '../helpers';

const orderBody = (order: any, patch: Record<string, unknown> = {}) => ({
  title: order.title,
  customerId: order.customer.id,
  agreedPrice: order.agreedPrice,
  currency: order.currency,
  agreedRate: order.agreedRate,
  incoterm: order.incoterm,
  destinationPort: order.destinationPort,
  items: order.items.map((i: any) => ({ id: i.id, productName: i.productName, brandModel: i.brandModel, year: i.year, quantity: i.quantity, unitPrice: i.unitPrice })),
  ...patch,
});

// 004 quickstart P15–P17 / US5, FR-021 – FR-023, D3.
describe('warnings, closing with a balance, and the currency lock', () => {
  it('warns about overpayment and bank payments above the invoice, without blocking (P15)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner); // 190,000 USD
    await seedPayment(owner, order.id, { channel: 'bank', amount: '190000' });
    const extra = await owner.post(`/api/orders/${order.id}/payments`, {
      channel: 'bank',
      type: 'other',
      amount: '1000',
      currency: 'USD',
      paymentDate: '2026-10-07',
      rates: { USD: '7.1', MAD: '0.71' },
    });
    expect(extra.status).toBe(201);
    const { summary } = (await owner.get(`/api/orders/${order.id}/payments`)).body;
    expect(summary).toMatchObject({
      received: '191000.00',
      remaining: '0.00',
      overpaid: '1000.00',
      warnings: { overpaid: '1000.00', bankOverInvoice: '1000.00' },
    });

    // A Direct overpayment warns about the total, not about the invoice.
    const other = await seedOrder(owner);
    await seedPayment(owner, other.id, { channel: 'direct', amount: '191000' });
    expect((await owner.get(`/api/orders/${other.id}/payments`)).body.summary.warnings).toEqual({ overpaid: '1000.00', bankOverInvoice: null });
  });

  it('asks for confirmation before closing an order that is still owed money (P16, FR-022)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    await seedPayment(owner, order.id, { channel: 'direct', amount: '57000' });

    const refused = await owner.patch(`/api/orders/${order.id}/status`, { status: 'closed' });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toEqual({ code: 'balance_outstanding', details: { remaining: '133000.00', currency: 'USD' } });
    expect((await owner.get(`/api/orders/${order.id}`)).body.status).toBe('draft');

    const closed = await owner.patch(`/api/orders/${order.id}/status`, { status: 'closed', confirmOutstanding: true });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('closed');
    const entry = ctx.sqlite
      .prepare("select after_json from audit_entries where action = 'record.updated' and target_id = ? order by rowid desc")
      .get(order.id) as { after_json: string };
    expect(JSON.parse(entry.after_json)).toEqual({ status: 'closed', outstanding: '133000.00 USD' });

    // Cancelled never asks; reopening and closing a fully paid order never asks.
    const cancelled = await seedOrder(owner);
    expect((await owner.patch(`/api/orders/${cancelled.id}/status`, { status: 'cancelled' })).status).toBe(200);
    const paid = await seedOrder(owner);
    await seedPayment(owner, paid.id, { amount: '190000' });
    expect((await owner.patch(`/api/orders/${paid.id}/status`, { status: 'closed' })).status).toBe(200);
  });

  it('applies the same rule when the order form closes the order', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const refused = await owner.put(`/api/orders/${order.id}`, orderBody(order, { status: 'closed' }));
    expect([refused.status, refused.body.error.code, refused.body.error.details.remaining]).toEqual([409, 'balance_outstanding', '190000.00']);
    const closed = await owner.put(`/api/orders/${order.id}`, orderBody(order, { status: 'closed', confirmOutstanding: true }));
    expect([closed.status, closed.body.status]).toEqual([200, 'closed']);
    // Saving an order that is already closed does not ask again.
    expect((await owner.put(`/api/orders/${order.id}`, orderBody(closed.body, { title: 'Renamed' }))).status).toBe(200);
  });

  it('locks the currency once payments exist (P17, FR-023)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const free = await owner.put(`/api/orders/${order.id}`, orderBody(order, { currency: 'EUR', agreedRate: '7.8' }));
    expect([free.status, free.body.currency]).toEqual([200, 'EUR']);

    const payment = await seedPayment(owner, order.id, { currency: 'EUR', amount: '100', rates: { USD: '7.1', MAD: '0.71', EUR: '7.8' } });
    const locked = await owner.put(`/api/orders/${order.id}`, orderBody(free.body, { currency: 'USD', agreedRate: '7.1' }));
    expect(locked.body.error.details.fields).toEqual({ currency: 'currency_locked' });

    // Only non-deleted payments lock it.
    ctx.sqlite.prepare('update payments set deleted_at = 1 where id = ?').run(payment.id);
    expect((await owner.put(`/api/orders/${order.id}`, orderBody(free.body, { currency: 'USD', agreedRate: '7.1' }))).status).toBe(200);
  });
});
