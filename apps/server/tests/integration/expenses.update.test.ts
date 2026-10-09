import { describe, expect, it } from 'vitest';
import { DAY_MS, MINUTE_MS } from '../../src/clock';
import { createTestContext, OWNER, seedExpense, seedOrder, TINY_JPEG, type TestContext } from '../helpers';

const updatesOf = (ctx: TestContext, id: string) =>
  (
    ctx.sqlite
      .prepare("select action, before_json, after_json from audit_entries where target_type = 'expense' and target_id = ? order by rowid")
      .all(id) as { action: string; before_json: string | null; after_json: string | null }[]
  ).map((r) => ({ action: r.action, before: r.before_json && JSON.parse(r.before_json), after: r.after_json && JSON.parse(r.after_json) }));

/** The expense as a full PUT body, with some fields changed. */
const body = (e: any, patch: Record<string, unknown> = {}) => ({
  name: e.name,
  categoryId: e.category.id,
  amount: e.amount,
  currency: e.currency,
  rate: e.currency === 'CNY' ? null : e.rate,
  rateSource: e.rateSource,
  expenseDate: e.expenseDate,
  paidToSupplierId: e.paidTo?.supplier?.id ?? null,
  paidToName: e.paidTo?.name ?? null,
  paymentMethod: e.paymentMethod,
  advancedBy: e.advancedBy,
  reimbursed: e.reimbursed,
  status: e.status,
  dueDate: e.dueDate,
  receiptId: e.receiptId,
  notes: e.notes,
  ...patch,
});

// 003 quickstart X13 / US4, FR-007 – FR-009.
describe('edit, pay, delete and restore expenses', () => {
  it('recomputes the CNY amount on edit and audits only what changed (X13)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const expense = await seedExpense(owner, order.id, { amount: '1200', currency: 'USD', rate: '7.1' });
    const profitBefore = (await owner.get(`/api/orders/${order.id}`)).body.financials.profit;

    ctx.clock.advance(MINUTE_MS);
    const res = await owner.put(`/api/expenses/${expense.id}`, body(expense, { amount: '1250' }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ amount: '1250.00', cnyAmount: '8875.00', updatedBy: 'hicham' });
    expect(res.body.updatedAt).not.toBe(expense.updatedAt);
    const profitAfter = (await owner.get(`/api/orders/${order.id}`)).body.financials.profit;
    expect(Number(profitBefore) - Number(profitAfter)).toBeCloseTo(355, 2);

    expect(updatesOf(ctx, expense.id).at(-1)).toEqual({
      action: 'record.updated',
      before: { amount: '1200.00', cnyAmount: '8520.00' },
      after: { amount: '1250.00', cnyAmount: '8875.00' },
    });
    // Saving with nothing changed writes nothing.
    await owner.put(`/api/expenses/${expense.id}`, body(res.body));
    expect(updatesOf(ctx, expense.id)).toHaveLength(2);
  });

  it('refreshes USD/MAD snapshots only when the date changes', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const insert = ctx.sqlite.prepare(
      "insert into exchange_rates (provider, rate_date, currency, rate_micro, fetched_at) values ('currency_api', ?, ?, ?, 0)",
    );
    insert.run('2026-10-01', 'USD', 7_000_000);
    const expense = await seedExpense(owner, order.id, { expenseDate: '2026-10-02' });
    const usd = () => (ctx.sqlite.prepare('select usd_cny_micro as v from expenses where id = ?').get(expense.id) as { v: number | null }).v;
    expect(usd()).toBe(7_000_000);

    insert.run('2026-10-03', 'USD', 7_200_000);
    await owner.put(`/api/expenses/${expense.id}`, body(expense, { name: 'Renamed' }));
    expect(usd()).toBe(7_000_000);
    await owner.put(`/api/expenses/${expense.id}`, body(expense, { expenseDate: '2026-10-04' }));
    expect(usd()).toBe(7_200_000);
  });

  it('switches between paid and to pay, and the unpaid total follows (US4 scenario 2)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const expense = await seedExpense(owner, order.id, { amount: '40000', status: 'to_pay', dueDate: '2026-11-15' });
    expect((await owner.get(`/api/orders/${order.id}`)).body.financials.unpaid).toBe('40000.00');

    const paid = await owner.patch(`/api/expenses/${expense.id}/status`, { status: 'paid' });
    expect(paid.body).toMatchObject({ status: 'paid' });
    expect((await owner.get(`/api/orders/${order.id}`)).body.financials.unpaid).toBe('0.00');
    expect((await owner.get(`/api/orders/${order.id}/expenses`)).body.totals.unpaid).toBe('0.00');
    expect(updatesOf(ctx, expense.id).at(-1)).toEqual({ action: 'record.updated', before: { status: 'to_pay' }, after: { status: 'paid' } });

    expect((await owner.patch(`/api/expenses/${expense.id}/status`, {})).status).toBe(400);
    expect((await owner.patch(`/api/expenses/${expense.id}/status`, { status: 'later' })).status).toBe(400);
  });

  it('deletes recoverably and restores unchanged (US4 scenario 3)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const keep = await seedExpense(owner, order.id, { amount: '100' });
    const twice = await seedExpense(owner, order.id, { amount: '3500' });

    expect((await owner.delete(`/api/expenses/${twice.id}`)).status).toBe(204);
    expect((await owner.delete(`/api/expenses/${twice.id}`)).status).toBe(404); // already deleted
    expect((await owner.get(`/api/expenses/${twice.id}`)).status).toBe(404);
    const list = (await owner.get(`/api/orders/${order.id}/expenses`)).body;
    expect(list.items.map((i: any) => i.id)).toEqual([keep.id]);
    expect(list.totals.grand).toBe('100.00');
    expect((await owner.get(`/api/orders/${order.id}`)).body.financials.expensesTotal).toBe('100.00');

    const deleted = (await owner.get(`/api/orders/${order.id}/expenses?deleted=true`)).body;
    expect(deleted.items.map((i: any) => i.id)).toEqual([twice.id]);
    expect(deleted.items[0].deletedAt).not.toBeNull();
    expect(deleted.totals.grand).toBe('100.00'); // totals always cover the live expenses

    const restored = await owner.post(`/api/expenses/${twice.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body).toEqual({ ...twice, deletedAt: null });
    expect((await owner.get(`/api/orders/${order.id}/expenses`)).body.totals.grand).toBe('3600.00');
    expect(updatesOf(ctx, twice.id).map((u) => u.action)).toEqual(['record.created', 'record.deleted', 'record.restored']);

    expect((await owner.post(`/api/expenses/${keep.id}/restore`)).status).toBe(404); // not deleted
  });

  it('unlinks a receipt on edit and the file is cleaned up later', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const upload = await owner.upload('/api/receipts', { bytes: TINY_JPEG, filename: 'r.jpg', type: 'image/jpeg' });
    const expense = await seedExpense(owner, order.id, { receiptId: upload.body.id });
    // Keeping the receipt: its id is sent back unchanged.
    expect((await owner.put(`/api/expenses/${expense.id}`, body(expense, { notes: 'kept' }))).body.hasReceipt).toBe(true);
    const unlinked = await owner.put(`/api/expenses/${expense.id}`, body(expense, { receiptId: null }));
    expect(unlinked.body).toMatchObject({ hasReceipt: false, receiptId: null });

    ctx.clock.advance(DAY_MS + MINUTE_MS);
    const later = ctx.client();
    await later.post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password });
    await later.upload('/api/receipts', { bytes: TINY_JPEG, filename: 'r2.jpg', type: 'image/jpeg' });
    expect(ctx.sqlite.prepare('select count(*) as n from files where id = ?').get(upload.body.id)).toEqual({ n: 0 });
  });

  it('keeps a category hidden since, but refuses switching to a hidden one', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const expense = await seedExpense(owner, order.id, { categoryId: 'cat-labor' });
    ctx.sqlite.prepare("update expense_categories set hidden = 1 where id in ('cat-labor', 'cat-commission')").run();
    expect((await owner.put(`/api/expenses/${expense.id}`, body(expense, { amount: '10' }))).status).toBe(200);
    const switched = await owner.put(`/api/expenses/${expense.id}`, body(expense, { categoryId: 'cat-commission' }));
    expect(switched.body.error.details.fields).toEqual({ categoryId: 'category_invalid' });
  });

  it('hides the expenses of a deleted order and brings them back with it', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const expense = await seedExpense(owner, order.id);
    expect((await owner.delete(`/api/orders/${order.id}`)).status).toBe(204);
    expect((await owner.get(`/api/expenses/${expense.id}`)).status).toBe(404);
    expect((await owner.put(`/api/expenses/${expense.id}`, body(expense, { amount: '1' }))).status).toBe(404);
    expect((await owner.patch(`/api/expenses/${expense.id}/status`, { status: 'to_pay' })).status).toBe(404);
    expect((await owner.delete(`/api/expenses/${expense.id}`)).status).toBe(404);

    expect((await owner.post(`/api/orders/${order.id}/restore`)).status).toBe(200);
    expect((await owner.get(`/api/expenses/${expense.id}`)).body).toEqual(expense);
  });
});
