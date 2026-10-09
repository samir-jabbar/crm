import { convertToCnyMinor, formatAmount, parseAmount, parseRate } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';
import { createTestContext, fakeRates, seedExpense, seedOrder, seedSupplier } from '../helpers';

const sum = (values: string[]) => formatAmount(values.reduce((total, v) => total + BigInt(parseAmount(v)), 0n));
const expected = (amount: string, rate: string) => formatAmount(convertToCnyMinor(parseAmount(amount), parseRate(rate)));

// 003 quickstart X1, X2, X4, X17 / US1, FR-001 – FR-004, FR-009, FR-025.
describe('create expense', () => {
  it('stores a CNY expense at rate 1, whatever rate is sent', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const expense = await seedExpense(owner, order.id, { rate: '7', rateSource: 'auto' });
    expect(expense).toMatchObject({
      orderId: order.id,
      name: 'Trucking Linyi to Qingdao port',
      category: { id: 'cat-inland_transport_china', key: 'inland_transport_china', name: null },
      amount: '3500.00',
      currency: 'CNY',
      rate: '1.000000',
      rateSource: 'manual',
      cnyAmount: '3500.00',
      expenseDate: '2026-10-07',
      paidTo: null,
      paymentMethod: 'cash',
      advancedBy: null,
      reimbursed: false,
      status: 'paid',
      dueDate: null,
      hasReceipt: false,
      receiptId: null,
      receiptMime: null,
      notes: null,
      createdBy: 'hicham',
      updatedBy: 'hicham',
      deletedAt: null,
    });
  });

  it('converts a foreign amount at the typed rate (X2)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const expense = await seedExpense(owner, order.id, { amount: '1200', currency: 'USD', rate: '7.1', rateSource: 'auto_edited' });
    expect(expense).toMatchObject({ amount: '1200.00', currency: 'USD', rate: '7.100000', rateSource: 'auto_edited', cnyAmount: '8520.00' });

    const fetched = await owner.get(`/api/expenses/${expense.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(expense);
  });

  it('lists 10 mixed-currency expenses with totals equal to the sum of the lines (X1, SC-002)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const lines = [
      { name: 'Trucking Linyi to Qingdao port', categoryId: 'cat-inland_transport_china', amount: '3500', currency: 'CNY', expenseDate: '2026-10-01' },
      { name: 'Crane at the yard', categoryId: 'cat-inland_transport_china', amount: '1200', currency: 'USD', rate: '7.1', expenseDate: '2026-10-02' },
      { name: 'Duties Casablanca', categoryId: 'cat-customs_duties_morocco', amount: '15000', currency: 'MAD', rate: '0.71', expenseDate: '2026-10-03' },
      { name: 'Freight CIF', categoryId: 'cat-sea_freight', amount: '2500.55', currency: 'EUR', rate: '7.8123', expenseDate: '2026-10-04' },
      { name: 'Hotel Linyi', categoryId: 'cat-hotel_accommodation', amount: '800', currency: 'CNY', expenseDate: '2026-10-05', status: 'to_pay' },
      { name: 'Wire fee', categoryId: 'cat-bank_fees', amount: '99.99', currency: 'USD', rate: '7.123456', expenseDate: '2026-10-05' },
      { name: 'Welders', categoryId: 'cat-labor', amount: '12000', currency: 'CNY', expenseDate: '2026-10-06', status: 'to_pay', dueDate: '2026-11-15' },
      { name: 'Taxi Casablanca', categoryId: 'cat-local_travel', amount: '333.33', currency: 'MAD', rate: '0.7', expenseDate: '2026-10-06' },
      { name: 'Cargo insurance', categoryId: 'cat-insurance', amount: '10', currency: 'EUR', rate: '7.85', expenseDate: '2026-10-07' },
      { name: 'Misc', categoryId: 'cat-other', amount: '1234.56', currency: 'CNY', expenseDate: '2026-10-07' },
    ];
    for (const line of lines) await seedExpense(owner, order.id, line);

    const res = await owner.get(`/api/orders/${order.id}/expenses`);
    expect(res.status).toBe(200);
    const { items, totals } = res.body;
    expect(items).toHaveLength(10);
    // Each line is tied to the order, listed by name, and converted exactly.
    for (const line of lines) {
      const item = items.find((i: any) => i.name === line.name);
      expect(item, line.name).toMatchObject({ orderId: order.id, cnyAmount: expected(line.amount, line.rate ?? '1') });
    }
    // Newest date first; same date → newest first.
    expect(items.map((i: any) => i.name).slice(0, 4)).toEqual(['Misc', 'Cargo insurance', 'Taxi Casablanca', 'Welders']);
    // Totals are sums of the stored line amounts, so they always match what is shown.
    expect(totals.grand).toBe(sum(items.map((i: any) => i.cnyAmount)));
    expect(totals.unpaid).toBe(sum(items.filter((i: any) => i.status === 'to_pay').map((i: any) => i.cnyAmount)));
    expect(totals.unpaid).toBe('12800.00');
    expect(totals.byCategory.map((c: any) => c.category.key)).toEqual([
      'inland_transport_china',
      'sea_freight',
      'insurance',
      'customs_duties_morocco',
      'labor',
      'hotel_accommodation',
      'local_travel',
      'bank_fees',
      'other',
    ]);
    for (const { category, total } of totals.byCategory) {
      expect(total, category.key).toBe(sum(items.filter((i: any) => i.category.id === category.id).map((i: any) => i.cnyAmount)));
    }
    expect(totals.byAdvancedBy).toEqual([]);
  });

  it('returns every missing or invalid field at once, as translatable codes (X4)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const empty = await owner.post(`/api/orders/${order.id}/expenses`, { currency: 'USD' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.details.fields).toEqual({
      name: 'name_invalid',
      categoryId: 'category_invalid',
      amount: 'amount_invalid',
      expenseDate: 'date_invalid',
      rate: 'rate_required',
    });

    const base = { name: 'Fuel', categoryId: 'cat-other', amount: '10', currency: 'CNY', expenseDate: '2026-10-07' };
    const cases: [Record<string, unknown>, string, string][] = [
      [{ currency: 'USD', rate: '7.1234567' }, 'rate', 'rate_invalid'],
      [{ currency: 'USD', rate: '0' }, 'rate', 'rate_invalid'],
      [{ amount: '0' }, 'amount', 'amount_invalid'],
      [{ amount: '1.234' }, 'amount', 'amount_invalid'],
      [{ currency: 'GBP' }, 'currency', 'currency_invalid'],
      [{ expenseDate: '2026-02-30' }, 'expenseDate', 'date_invalid'],
      [{ status: 'later' }, 'status', 'invalid_value'],
      [{ paymentMethod: 'card' }, 'paymentMethod', 'invalid_value'],
      [{ paidToSupplierId: 'x', paidToName: 'Driver Li' }, 'paidToName', 'invalid_value'],
      [{ advancedBy: 'x'.repeat(81) }, 'advancedBy', 'text_too_long'],
      [{ categoryId: 'cat-nope' }, 'categoryId', 'category_invalid'],
      [{ paidToSupplierId: 'missing' }, 'paidToSupplierId', 'supplier_invalid'],
      [{ receiptId: 'missing' }, 'receiptId', 'receipt_invalid'],
      // amount × rate beyond what can be stored
      [{ amount: '999999999999.99', currency: 'USD', rate: '9999999' }, 'amount', 'amount_invalid'],
    ];
    for (const [patch, field, code] of cases) {
      const res = await owner.post(`/api/orders/${order.id}/expenses`, { ...base, ...patch });
      expect({ patch, status: res.status, error: res.body.error?.details?.fields?.[field] }).toEqual({ patch, status: 400, error: code });
    }
  });

  it('refuses hidden categories and deleted suppliers', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    ctx.sqlite.prepare("update expense_categories set hidden = 1 where id = 'cat-labor'").run();
    const hidden = await owner.post(`/api/orders/${order.id}/expenses`, {
      name: 'Welders',
      categoryId: 'cat-labor',
      amount: '10',
      currency: 'CNY',
      expenseDate: '2026-10-07',
    });
    expect(hidden.body.error.details.fields).toEqual({ categoryId: 'category_invalid' });

    const supplier = await seedSupplier(owner, { name: 'Gone Ltd' });
    expect((await owner.delete(`/api/suppliers/${supplier.id}`)).status).toBe(204);
    const res = await owner.post(`/api/orders/${order.id}/expenses`, {
      name: 'Parts',
      categoryId: 'cat-other',
      amount: '10',
      currency: 'CNY',
      expenseDate: '2026-10-07',
      paidToSupplierId: supplier.id,
    });
    expect(res.body.error.details.fields).toEqual({ paidToSupplierId: 'supplier_invalid' });
  });

  it('records who was paid, how, and who advanced the money', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const supplier = await seedSupplier(owner);
    const toSupplier = await seedExpense(owner, order.id, { paidToSupplierId: supplier.id, paymentMethod: 'bank' });
    expect(toSupplier).toMatchObject({ paidTo: { supplier: { id: supplier.id, name: supplier.name } }, paymentMethod: 'bank' });
    const toName = await seedExpense(owner, order.id, { paidToName: ' Driver Li ', advancedBy: 'Ahmed', reimbursed: false });
    expect(toName).toMatchObject({ paidTo: { name: 'Driver Li' }, advancedBy: 'Ahmed', reimbursed: false });
    // "Reimbursed" only means something when someone advanced the money.
    const nobody = await seedExpense(owner, order.id, { reimbursed: true });
    expect(nobody).toMatchObject({ advancedBy: null, reimbursed: false });
  });

  it('fills USD and MAD snapshots from the cache only, never calling the provider (R4)', async () => {
    const rates = fakeRates();
    const ctx = await createTestContext({}, { http: rates.http });
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const insert = ctx.sqlite.prepare(
      "insert into exchange_rates (provider, rate_date, currency, rate_micro, fetched_at) values ('currency_api', ?, ?, ?, 0)",
    );
    insert.run('2026-10-05', 'USD', 7_050_000);
    insert.run('2026-10-05', 'MAD', 700_000);
    insert.run('2026-10-09', 'USD', 7_300_000);

    const snapshot = (id: string) =>
      ctx.sqlite.prepare('select usd_cny_micro as usd, mad_cny_micro as mad from expenses where id = ?').get(id);
    const onDate = await seedExpense(owner, order.id, { expenseDate: '2026-10-07' });
    expect(snapshot(onDate.id)).toEqual({ usd: 7_050_000, mad: 700_000 }); // nearest earlier cached date
    const before = await seedExpense(owner, order.id, { expenseDate: '2026-10-04' });
    expect(snapshot(before.id)).toEqual({ usd: null, mad: null });
    expect(rates.calls).toEqual([]);
  });

  it('refuses unknown and deleted orders, and audits every creation (FR-009)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const expense = await seedExpense(owner, order.id, { amount: '1200', currency: 'USD', rate: '7.1' });
    const entry = ctx.sqlite
      .prepare("select action, actor_label, after_json from audit_entries where target_type = 'expense' and target_id = ?")
      .get(expense.id) as { action: string; actor_label: string; after_json: string };
    expect(entry.action).toBe('record.created');
    expect(entry.actor_label).toBe('hicham');
    expect(JSON.parse(entry.after_json)).toMatchObject({
      orderId: order.id,
      name: 'Trucking Linyi to Qingdao port',
      amount: '1200.00',
      currency: 'USD',
      rate: '7.100000',
      cnyAmount: '8520.00',
    });

    expect((await owner.post('/api/orders/00000000-0000-7000-8000-000000000000/expenses', {})).status).toBe(404);
    expect((await owner.get('/api/orders/00000000-0000-7000-8000-000000000000/expenses')).status).toBe(404);
    expect((await owner.delete(`/api/orders/${order.id}`)).status).toBe(204);
    expect((await owner.get(`/api/orders/${order.id}/expenses`)).status).toBe(404);
    const res = await owner.post(`/api/orders/${order.id}/expenses`, {
      name: 'Late',
      categoryId: 'cat-other',
      amount: '1',
      currency: 'CNY',
      expenseDate: '2026-10-07',
    });
    expect(res.status).toBe(404);
  });

  it('keeps a supplier that is "paid to" on an expense from being deleted (X17, FR-025)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const supplier = await seedSupplier(owner, { name: 'Qingdao Port Services' });
    const expense = await seedExpense(owner, order.id, { paidToSupplierId: supplier.id });

    const refused = await owner.delete(`/api/suppliers/${supplier.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toEqual({ code: 'in_use', details: { count: 1 } });
    // The supplier page still counts orders only.
    expect((await owner.get(`/api/suppliers/${supplier.id}`)).body.orderCount).toBe(0);

    ctx.sqlite.prepare('update expenses set deleted_at = 1 where id = ?').run(expense.id);
    expect((await owner.delete(`/api/suppliers/${supplier.id}`)).status).toBe(204);
  });
});
