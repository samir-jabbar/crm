import { describe, expect, it } from 'vitest';
import { createTestContext, seedCustomer, seedOrder } from '../helpers';

// 002 quickstart V15 / US6, FR-022.
describe('order-number prefix', () => {
  it('previews the next number without reserving it', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    expect((await owner.get('/api/settings')).body).toMatchObject({ orderNumberPrefix: 'HJ', nextOrderNumber: 'HJ-2026-001' });
    expect((await owner.get('/api/settings')).body.nextOrderNumber).toBe('HJ-2026-001'); // still free
    const customer = await seedCustomer(owner);
    await seedOrder(owner, { customerId: customer.id });
    await seedOrder(owner, { customerId: customer.id });
    expect((await owner.get('/api/settings')).body.nextOrderNumber).toBe('HJ-2026-003');
  });

  it('uses a new prefix for new orders only, continuing the counter', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const customer = await seedCustomer(owner);
    const first = await seedOrder(owner, { customerId: customer.id });
    await seedOrder(owner, { customerId: customer.id });

    const res = await owner.patch('/api/settings', { orderNumberPrefix: 'HJM' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ orderNumberPrefix: 'HJM', nextOrderNumber: 'HJM-2026-003' });
    expect((await seedOrder(owner, { customerId: customer.id })).number).toBe('HJM-2026-003');
    expect((await owner.get(`/api/orders/${first.id}`)).body.number).toBe('HJ-2026-001');

    const entry = ctx.sqlite
      .prepare("select before_json, after_json from audit_entries where action = 'settings.updated'")
      .get() as { before_json: string; after_json: string };
    expect(JSON.parse(entry.before_json)).toEqual({ orderNumberPrefix: 'HJ' });
    expect(JSON.parse(entry.after_json)).toEqual({ orderNumberPrefix: 'HJM' });
  });

  it('rejects prefixes with spaces, symbols or more than 10 characters', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    for (const bad of ['H J', 'TOOLONGPREFIX1', '', 'HJ/2']) {
      const res = await owner.patch('/api/settings', { orderNumberPrefix: bad });
      expect(res.status, bad).toBe(400);
      expect(res.body.error.details.fields).toEqual({ orderNumberPrefix: 'prefix_invalid' });
    }
  });
});
