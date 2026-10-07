import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../src/clock';
import { createTestContext } from '../helpers';

// Quickstart Q8, Q18 / US5, FR-035 – FR-037.
describe('company settings', () => {
  it('shows CNY as the fixed base currency, the four supported currencies and the default timeout', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const res = await owner.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      companyName: '',
      baseCurrency: 'CNY',
      currencies: [
        { code: 'CNY', symbol: '¥', minorUnits: 2 },
        { code: 'USD', symbol: '$', minorUnits: 2 },
        { code: 'MAD', symbol: 'DH', minorUnits: 2 },
        { code: 'EUR', symbol: '€', minorUnits: 2 },
      ],
      sessionIdleTimeoutMinutes: 720,
      // Added by 002 (order numbers).
      orderNumberPrefix: 'HJ',
      nextOrderNumber: 'HJ-2026-001',
    });
  });

  it('saves a mixed-script company name exactly and shows it to the signed-in user', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const name = '汉景机械 HANJING — شركة';
    const res = await owner.patch('/api/settings', { companyName: name });
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe(name);
    expect((await owner.get('/api/me')).body.company.name).toBe(name);
  });

  it('validates the timeout range and refuses to change the base currency', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    for (const value of [14, 10_081, 30.5]) {
      const res = await owner.patch('/api/settings', { sessionIdleTimeoutMinutes: value });
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields).toEqual({ sessionIdleTimeoutMinutes: 'timeout_out_of_range' });
    }
    const currency = await owner.patch('/api/settings', { baseCurrency: 'USD' });
    expect(currency.status).toBe(400);
    expect(currency.body.error.details.fields).toEqual({ baseCurrency: 'unknown_field' });
    expect((await owner.get('/api/settings')).body.baseCurrency).toBe('CNY');
  });

  it('applies a new idle timeout immediately', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    expect((await owner.patch('/api/settings', { sessionIdleTimeoutMinutes: 15 })).status).toBe(200);
    ctx.clock.advance(14 * MINUTE_MS);
    expect((await owner.get('/api/me')).status).toBe(200);
    ctx.clock.advance(16 * MINUTE_MS);
    expect((await owner.get('/api/me')).status).toBe(401);
  });

  it('audits only the changed fields', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    await owner.patch('/api/settings', { companyName: 'HANJING MACHINERY', sessionIdleTimeoutMinutes: 720 });
    const entry = ctx.sqlite
      .prepare("select before_json, after_json from audit_entries where action = 'settings.updated'")
      .get() as { before_json: string; after_json: string };
    expect(JSON.parse(entry.before_json)).toEqual({ companyName: '' });
    expect(JSON.parse(entry.after_json)).toEqual({ companyName: 'HANJING MACHINERY' });
  });

  it('is Owner-only', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const worker = await ctx.createWorker();
    expect((await worker.get('/api/settings')).status).toBe(403);
    expect((await worker.patch('/api/settings', { companyName: 'x' })).status).toBe(403);
  });
});
