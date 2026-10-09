import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/clock';
import { createTestContext, seedExpense, seedOrder } from '../helpers';

// 003 quickstart X14 / US5, FR-019, FR-020, research R9.
describe('reimbursements', () => {
  async function setup() {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const orderA = await seedOrder(owner, { title: 'Order A' });
    const orderB = await seedOrder(owner, { title: 'Order B' });
    const ahmedA = await seedExpense(owner, orderA.id, { name: 'Hotel Linyi', amount: '2000', advancedBy: 'ahmed ' });
    ctx.clock.advance(MINUTE_MS);
    const ahmedB = await seedExpense(owner, orderB.id, { name: 'Taxi', amount: '1500', advancedBy: 'Ahmed' });
    ctx.clock.advance(MINUTE_MS);
    const li = await seedExpense(owner, orderB.id, { name: 'Diesel', amount: '800', advancedBy: 'Driver Li' });
    await seedExpense(owner, orderB.id, { name: 'Paid by the company', amount: '999' });
    return { ctx, owner, orderA, orderB, ahmedA, ahmedB, li };
  }

  it('totals what is owed per person across orders, largest first (X14)', async () => {
    const { owner } = await setup();
    const res = await owner.get('/api/expenses/reimbursements');
    expect(res.status).toBe(200);
    // One person whatever the spelling; labelled with the most recent one.
    expect(res.body.items).toEqual([
      { name: 'Ahmed', toReimburse: '3500.00', expenseCount: 2 },
      { name: 'Driver Li', toReimburse: '800.00', expenseCount: 1 },
    ]);
  });

  it('drops what was reimbursed, and people owed nothing (US5 scenario 2)', async () => {
    const { ctx, owner, ahmedA, li } = await setup();
    const marked = await owner.patch(`/api/expenses/${ahmedA.id}/status`, { reimbursed: true });
    expect(marked.body).toMatchObject({ reimbursed: true, status: 'paid' });
    await owner.patch(`/api/expenses/${li.id}/status`, { reimbursed: true });
    expect((await owner.get('/api/expenses/reimbursements')).body.items).toEqual([
      { name: 'Ahmed', toReimburse: '1500.00', expenseCount: 1 },
    ]);
    const audit = ctx.sqlite
      .prepare("select before_json, after_json from audit_entries where target_id = ? and action = 'record.updated'")
      .get(ahmedA.id) as { before_json: string; after_json: string };
    expect([JSON.parse(audit.before_json), JSON.parse(audit.after_json)]).toEqual([{ reimbursed: false }, { reimbursed: true }]);
  });

  it('leaves out deleted expenses and deleted orders, until restored', async () => {
    const { owner, orderA, ahmedB } = await setup();
    await owner.delete(`/api/expenses/${ahmedB.id}`);
    await owner.delete(`/api/orders/${orderA.id}`);
    expect((await owner.get('/api/expenses/reimbursements')).body.items).toEqual([
      { name: 'Driver Li', toReimburse: '800.00', expenseCount: 1 },
    ]);
    await owner.post(`/api/orders/${orderA.id}/restore`);
    expect((await owner.get('/api/expenses/reimbursements')).body.items[0]).toEqual({
      name: 'ahmed',
      toReimburse: '2000.00',
      expenseCount: 1,
    });
  });

  it('lists the open expenses of one person, with their order (FR-020)', async () => {
    const { owner, orderA, orderB, ahmedA, ahmedB } = await setup();
    const res = await owner.get(`/api/expenses/to-reimburse?person=${encodeURIComponent(' AHMED')}`);
    expect(res.status).toBe(200);
    expect(res.body.person).toBe('Ahmed');
    expect(res.body.total).toBe('3500.00');
    expect(res.body.items.map((i: any) => [i.id, i.order])).toEqual([
      [ahmedB.id, { id: orderB.id, number: orderB.number, title: 'Order B' }],
      [ahmedA.id, { id: orderA.id, number: orderA.number, title: 'Order A' }],
    ]);
    expect((await owner.get('/api/expenses/to-reimburse?person=Nobody')).body).toEqual({ person: 'Nobody', total: '0.00', items: [] });
    expect((await owner.get('/api/expenses/to-reimburse')).status).toBe(400);
  });

  it('suggests names already used, once each, in any script (US5 scenario 3)', async () => {
    const { owner, orderA } = await setup();
    await seedExpense(owner, orderA.id, { advancedBy: 'مُحَمَّد' });
    expect((await owner.get('/api/expenses/advanced-by?q=ah')).body.items).toEqual(['Ahmed']);
    expect((await owner.get('/api/expenses/advanced-by?q=li')).body.items).toEqual(['Driver Li']);
    expect((await owner.get('/api/expenses/advanced-by?q=محمد')).body.items).toEqual(['مُحَمَّد']);
    expect((await owner.get('/api/expenses/advanced-by?q=%')).body.items).toEqual([]);
    expect((await owner.get('/api/expenses/advanced-by')).body.items).toEqual(['مُحَمَّد', 'Driver Li', 'Ahmed']);
  });

  it('shows per-person totals on the order (FR-010)', async () => {
    const { owner, orderB, ahmedB } = await setup();
    await owner.patch(`/api/expenses/${ahmedB.id}/status`, { reimbursed: true });
    const { totals } = (await owner.get(`/api/orders/${orderB.id}/expenses`)).body;
    expect(totals.byAdvancedBy).toEqual([
      { name: 'Ahmed', total: '1500.00', toReimburse: '0.00' },
      { name: 'Driver Li', total: '800.00', toReimburse: '800.00' },
    ]);
  });

  it('ignores "reimbursed" when nobody advanced the money', async () => {
    const { owner, orderA } = await setup();
    const plain = await seedExpense(owner, orderA.id, { name: 'Company card' });
    const res = await owner.patch(`/api/expenses/${plain.id}/status`, { reimbursed: true });
    expect(res.body.reimbursed).toBe(false);
  });
});
