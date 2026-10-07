import { describe, expect, it } from 'vitest';
import { auditActions, createTestContext } from '../helpers';

// 002 US1 inline creation + FR-001, FR-002, FR-005.
describe('create customers and suppliers', () => {
  it('stores an Arabic customer exactly as typed', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const name = 'شركة الدار البيضاء للمعدات';
    const res = await owner.post('/api/customers', { name, city: 'Casablanca', country: 'Morocco', phone: '+212 6 12 34 56 78' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name, city: 'Casablanca', orderCount: 0, email: null, deletedAt: null });
    expect((await owner.get(`/api/customers/${res.body.id}`)).body.name).toBe(name);
  });

  it('warns about a duplicate name and saves when confirmed', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const first = await owner.post('/api/customers', { name: 'MJTR Gold' });
    const dup = await owner.post('/api/customers', { name: '  mjtr gold ' });
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({ error: { code: 'customer_name_exists', details: { existingId: first.body.id } } });
    const confirmed = await owner.post('/api/customers', { name: '  mjtr gold ', confirmDuplicate: true });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.name).toBe('mjtr gold');
  });

  it('validates fields', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const res = await owner.post('/api/customers', { name: '', email: 'not-an-email', notes: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toEqual({
      name: 'name_invalid',
      email: 'email_invalid',
      notes: 'text_too_long',
    });
  });

  it('creates a supplier with China as the default country', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const res = await owner.post('/api/suppliers', { name: '临沂重工', contactPerson: 'Mr. Wang', wechat: 'wang_linyi' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: '临沂重工', country: 'China', wechat: 'wang_linyi', orderCount: 0 });
  });

  it('audits every creation', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    await owner.post('/api/customers', { name: 'A' });
    await owner.post('/api/suppliers', { name: 'B' });
    const targets = ctx.sqlite
      .prepare("select target_type from audit_entries where action = 'record.created' order by rowid")
      .all();
    expect(targets).toEqual([{ target_type: 'customer' }, { target_type: 'supplier' }]);
    expect(auditActions(ctx)).toContain('record.created');
  });
});
