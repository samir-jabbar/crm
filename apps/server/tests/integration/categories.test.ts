import { DEFAULT_CATEGORY_KEYS } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';
import { createTestContext, seedExpense, seedOrder } from '../helpers';

// 003 quickstart X15 / US6, FR-021, FR-022, FR-024.
describe('expense categories', () => {
  it('starts with the 13 default categories in order, labelled by translation', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const res = await owner.get('/api/expense-categories');
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: any) => c.key)).toEqual([...DEFAULT_CATEGORY_KEYS]);
    expect(res.body.items[0]).toEqual({ id: 'cat-equipment_purchase', key: 'equipment_purchase', name: null, position: 0, hidden: false });
  });

  it('adds, renames, hides and shows categories, keeping them on existing expenses (X15)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const created = await owner.post('/api/expense-categories', { name: '  Spare parts ' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ key: null, name: 'Spare parts', position: 13, hidden: false });
    const arabic = await owner.post('/api/expense-categories', { name: 'قطع الغيار' });
    expect(arabic.body).toMatchObject({ name: 'قطع الغيار', position: 14 });

    const order = await seedOrder(owner);
    const expense = await seedExpense(owner, order.id, { categoryId: created.body.id, amount: '700' });
    expect(expense.category).toEqual({ id: created.body.id, key: null, name: 'Spare parts' });

    const renamed = await owner.patch(`/api/expense-categories/${created.body.id}`, { name: 'Spare parts (hydraulic)' });
    expect(renamed.body.name).toBe('Spare parts (hydraulic)');
    expect((await owner.get(`/api/expenses/${expense.id}`)).body.category.name).toBe('Spare parts (hydraulic)');
    // Renaming a default stores the typed name, which wins over the translation.
    expect((await owner.patch('/api/expense-categories/cat-labor', { name: 'Welders' })).body).toMatchObject({ key: 'labor', name: 'Welders' });

    expect((await owner.patch(`/api/expense-categories/${created.body.id}`, { hidden: true })).body.hidden).toBe(true);
    expect((await owner.get('/api/expense-categories')).body.items.map((c: any) => c.id)).not.toContain(created.body.id);
    const all = (await owner.get('/api/expense-categories?includeHidden=true')).body.items;
    expect(all.find((c: any) => c.id === created.body.id)).toMatchObject({ hidden: true });
    // Still on the expense and in the totals, but no longer offered for new expenses.
    const list = (await owner.get(`/api/orders/${order.id}/expenses`)).body;
    expect(list.totals.byCategory).toEqual([{ category: { id: created.body.id, key: null, name: 'Spare parts (hydraulic)' }, total: '700.00' }]);
    const refused = await owner.post(`/api/orders/${order.id}/expenses`, {
      name: 'Hose',
      categoryId: created.body.id,
      amount: '1',
      currency: 'CNY',
      expenseDate: '2026-10-07',
    });
    expect(refused.body.error.details.fields).toEqual({ categoryId: 'category_invalid' });

    expect((await owner.patch(`/api/expense-categories/${created.body.id}`, { hidden: false })).body.hidden).toBe(false);
  });

  it('validates names and has no deletion (FR-022)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    for (const name of ['', '   ', 'x'.repeat(61)]) {
      expect((await owner.post('/api/expense-categories', { name })).body.error.details.fields, name).toEqual({ name: 'name_invalid' });
    }
    expect((await owner.patch('/api/expense-categories/cat-labor', {})).status).toBe(400);
    expect((await owner.patch('/api/expense-categories/cat-nope', { hidden: true })).status).toBe(404);
    expect((await owner.delete('/api/expense-categories/cat-labor')).status).toBe(404);
  });

  it('audits every change with before and after (FR-024, SC-007)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const created = (await owner.post('/api/expense-categories', { name: 'Spare parts' })).body;
    await owner.patch(`/api/expense-categories/${created.id}`, { name: 'Parts' });
    await owner.patch(`/api/expense-categories/${created.id}`, { hidden: true });
    await owner.patch(`/api/expense-categories/${created.id}`, { hidden: true }); // no change, no entry
    const entries = (
      ctx.sqlite
        .prepare("select action, before_json, after_json from audit_entries where target_type = 'expense_category' order by rowid")
        .all() as { action: string; before_json: string | null; after_json: string | null }[]
    ).map((e) => [e.action, e.before_json && JSON.parse(e.before_json), e.after_json && JSON.parse(e.after_json)]);
    expect(entries).toEqual([
      ['record.created', null, { name: 'Spare parts', position: 13 }],
      ['record.updated', { name: 'Spare parts' }, { name: 'Parts' }],
      ['record.updated', { hidden: false }, { hidden: true }],
    ]);
  });
});
