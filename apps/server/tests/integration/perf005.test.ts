import { describe, expect, it } from 'vitest';
import { newId } from '../../src/lib/ids';
import { createTestContext, seedCustomer } from '../helpers';

// 005 SC-007 / research R13: scope filters are indexed lookups, so a worker's lists stay fast.
describe('scope performance', () => {
  it('serves an assigned-scope worker their list and an order quickly among 1,000 orders', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner, { name: 'Atlas' });
    const ownerId = (await owner.get('/api/me')).body.user.id as string;
    const insertOrder = ctx.sqlite.prepare(
      `insert into orders (id, number, number_year, number_seq, title, customer_id, status, agreed_price_minor, currency,
        created_at, updated_at, created_by) values (?, ?, 2026, ?, ?, ?, 'confirmed', ?, 'CNY', ?, ?, ?)`,
    );
    const ids: string[] = [];
    const start = ctx.clock.now();
    ctx.sqlite.transaction(() => {
      for (let n = 1; n <= 1000; n++) {
        const id = newId();
        ids.push(id);
        insertOrder.run(id, `HJ-2026-${String(n).padStart(4, '0')}`, n, `Order ${n}`, customer.id, n * 100, start + n, start + n, ownerId);
      }
    })();
    const worker = await ctx.createWorker({
      permissions: { modules: { orders: ['view'], expenses: ['view'] }, hidden: ['sellingPrice'] },
      orderScope: 'assigned',
      assignedOrderIds: ids.filter((_, i) => i % 3 === 0).slice(0, 300),
    });

    const timed = async (path: string) => {
      const t0 = performance.now();
      const res = await worker.get(path);
      expect(res.status, path).toBe(200);
      return performance.now() - t0;
    };
    await timed('/api/orders'); // warm-up
    expect(await timed('/api/orders')).toBeLessThan(300);
    expect(await timed('/api/orders?q=Order%2099')).toBeLessThan(300);
    expect(await timed(`/api/orders/${ids[0]}`)).toBeLessThan(300);

    // The scope subquery uses the (user_id, order_id) index.
    const plan = ctx.sqlite
      .prepare('explain query plan select order_id from order_assignments where user_id = ?')
      .all(worker.userId) as { detail: string }[];
    expect(plan.map((p) => p.detail).join(' ')).toMatch(/USING (COVERING )?INDEX (order_assignments_user_idx|sqlite_autoindex)/);
  });
});
