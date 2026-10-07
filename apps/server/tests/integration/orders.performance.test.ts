import { describe, expect, it } from 'vitest';
import { newId } from '../../src/lib/ids';
import { createTestContext, seedCustomer, seedSupplier } from '../helpers';

// 002 quickstart V18 / SC-002: search and filters stay under 1 second with 5,000 orders.
describe('order list performance', () => {
  it('searches and filters 5,000 orders (15,000 items) in under a second', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customers = await Promise.all(
      ['Éloïse Diallo', 'شركة الدار البيضاء', '汉景机械贸易', 'Atlas Mining', 'Sahara Build'].map((name) => seedCustomer(owner, { name })),
    );
    const supplier = await seedSupplier(owner);
    const ownerId = (await owner.get('/api/me')).body.user.id as string;
    const statuses = ['draft', 'confirmed', 'purchased', 'on_vessel', 'delivered'];
    const models = ['Doosan DX225LC', 'SANY SY5419', 'Heli CPCD30', 'XCMG XE215', 'Komatsu PC200'];

    // Bulk insert directly (one transaction) — the API path is covered by other tests.
    const insertOrder = ctx.sqlite.prepare(
      `insert into orders (id, number, number_year, number_seq, title, customer_id, status, agreed_price_minor, currency,
        created_at, updated_at, created_by) values (?, ?, 2026, ?, ?, ?, ?, ?, 'USD', ?, ?, ?)`,
    );
    const insertItem = ctx.sqlite.prepare(
      `insert into order_items (id, order_id, position, product_name, brand_model, quantity, unit_price_minor, supplier_id)
       values (?, ?, ?, ?, ?, 1, 1000000, ?)`,
    );
    const start = ctx.clock.now();
    ctx.sqlite.transaction(() => {
      for (let n = 1; n <= 5000; n++) {
        const id = newId();
        insertOrder.run(id, `HJ-2026-${String(n).padStart(4, '0')}`, n, `Order ${n} ${models[n % 5]}`, customers[n % 5].id,
          statuses[n % 5], n * 100, start + n, start + n, ownerId);
        for (let p = 0; p < 3; p++) insertItem.run(newId(), id, p, `Machine ${p}`, models[(n + p) % 5], supplier.id);
      }
    })();

    const timed = async (path: string) => {
      const t0 = performance.now();
      const res = await owner.get(path);
      const ms = performance.now() - t0;
      expect(res.status, path).toBe(200);
      return { ms, res };
    };

    const first = await timed('/api/orders?limit=20');
    expect(first.res.body.items).toHaveLength(20);
    const search = await timed('/api/orders?q=komatsu&limit=20');
    expect(search.res.body.items.length).toBeGreaterThan(0);
    const arabic = await timed(`/api/orders?q=${encodeURIComponent('الدار')}&limit=20`);
    expect(arabic.res.body.items.length).toBeGreaterThan(0);
    const filtered = await timed('/api/orders?status=on_vessel,confirmed&limit=20');
    expect(filtered.res.body.items.length).toBe(20);
    const noMatch = await timed('/api/orders?q=nothing-matches-this&limit=20'); // full scan worst case
    expect(noMatch.res.body.items).toEqual([]);

    for (const { ms } of [first, search, arabic, filtered, noMatch]) expect(ms).toBeLessThan(1000);
  }, 60_000);
});
