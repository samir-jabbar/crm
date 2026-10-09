import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../src/clock';
import { createTestContext, fakeRates, OWNER, seedExpense, seedOrder, type TestContext } from '../helpers';

async function signInAgain(ctx: TestContext) {
  const client = ctx.client();
  expect((await client.post('/api/auth/sign-in', { username: OWNER.username, password: OWNER.password })).status).toBe(200);
  return client;
}

const twoDates = {
  '2026-10-07': { USD: '7.1', MAD: '0.71', EUR: '7.8' },
  '2026-09-01': { USD: '7.15', MAD: '0.72', EUR: '7.9' },
};

// 003 quickstart X8–X12, X16 / US3, FR-014 – FR-018, research R3.
describe('exchange rates', () => {
  it('fetches once per day from the cache, and again on refresh or the next day (X8, SC-005)', async () => {
    const rates = fakeRates();
    const ctx = await createTestContext({}, { http: rates.http });
    const owner = await ctx.createOwner();

    const first = await owner.get('/api/rates?currency=USD');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ currency: 'USD', rate: '7.100000', rateDate: '2026-10-07', provider: 'currency_api', exact: true });
    // MAD and EUR came with the same call.
    expect((await owner.get('/api/rates?currency=MAD')).body.rate).toBe('0.710000');
    expect((await owner.get('/api/rates?currency=USD')).body.rate).toBe('7.100000');
    expect(rates.calls).toHaveLength(1);

    const refreshed = await owner.post('/api/rates/refresh');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toEqual({
      rates: [
        { currency: 'USD', rate: '7.100000', rateDate: '2026-10-07' },
        { currency: 'MAD', rate: '0.710000', rateDate: '2026-10-07' },
        { currency: 'EUR', rate: '7.800000', rateDate: '2026-10-07' },
      ],
      fetchedAt: new Date(ctx.clock.now()).toISOString(),
    });
    expect(rates.calls).toHaveLength(2);

    ctx.clock.advance(DAY_MS);
    const nextDay = await signInAgain(ctx);
    await nextDay.get('/api/rates?currency=EUR');
    expect(rates.calls).toHaveLength(3);
  });

  it('answers a back-dated request with that date, or the latest labelled with its own date (X9, FR-015)', async () => {
    const rates = fakeRates({ dates: twoDates });
    const ctx = await createTestContext({}, { http: rates.http });
    const owner = await ctx.createOwner();

    const dated = await owner.get('/api/rates?currency=USD&date=2026-09-01');
    expect(dated.body).toEqual({ currency: 'USD', rate: '7.150000', rateDate: '2026-09-01', provider: 'currency_api', exact: true });
    await owner.get('/api/rates?currency=MAD&date=2026-09-01');
    expect(rates.calls).toHaveLength(1);

    // Not published for that day (e.g. a holiday): the latest, with its own date.
    const missing = await owner.get('/api/rates?currency=USD&date=2026-08-15');
    expect(missing.body).toMatchObject({ rate: '7.100000', rateDate: '2026-10-07', exact: false });

    // The open-access provider has no dated rates.
    expect((await owner.patch('/api/settings/exchange-rates', { provider: 'exchangerate_api_open' })).status).toBe(200);
    const open = await owner.get('/api/rates?currency=USD&date=2026-09-01');
    expect(open.body).toEqual({ currency: 'USD', rate: '7.100000', rateDate: '2026-10-07', provider: 'exchangerate_api_open', exact: false });
  });

  it('says rates are unavailable within the timeout, and expenses still save with a typed rate (X10, FR-018, SC-004)', async () => {
    const rates = fakeRates({ mode: 'hang' });
    const ctx = await createTestContext({ RATE_FETCH_TIMEOUT_MS: '100' }, { http: rates.http });
    const owner = await ctx.createOwner();

    const started = Date.now();
    const hung = await owner.get('/api/rates?currency=USD');
    expect(Date.now() - started).toBeLessThan(1000);
    expect([hung.status, hung.body.error.code]).toEqual([503, 'rates_unavailable']);

    rates.state.mode = 'down';
    expect((await owner.get('/api/rates?currency=EUR')).status).toBe(503);
    const settings = (await owner.get('/api/settings/exchange-rates')).body;
    expect(settings).toMatchObject({ lastFetchAt: null, lastError: 'rates_unavailable', lastErrorAt: new Date(ctx.clock.now()).toISOString() });
    expect((await owner.post('/api/rates/refresh')).status).toBe(503);

    const order = await seedOrder(owner);
    const expense = await seedExpense(owner, order.id, { amount: '1200', currency: 'USD', rate: '7.1' });
    expect(expense.cnyAmount).toBe('8520.00');
  });

  it('never calls a provider in manual mode', async () => {
    const rates = fakeRates();
    const ctx = await createTestContext({}, { http: rates.http });
    const owner = await ctx.createOwner();
    await owner.patch('/api/settings/exchange-rates', { provider: 'manual' });
    const res = await owner.get('/api/rates?currency=USD');
    expect([res.status, res.body.error.code]).toEqual([503, 'rates_unavailable']);
    expect((await owner.post('/api/rates/refresh')).status).toBe(503);
    expect(rates.calls).toEqual([]);
  });

  it('validates the currency and is open to every signed-in user', async () => {
    const rates = fakeRates();
    const ctx = await createTestContext({}, { http: rates.http });
    const owner = await ctx.createOwner();
    for (const q of ['currency=CNY', 'currency=GBP', '']) {
      const res = await owner.get(`/api/rates?${q}`);
      expect(res.body.error.details.fields, q).toEqual({ currency: 'currency_invalid' });
    }
    expect((await owner.get('/api/rates?currency=USD&date=2026-13-01')).body.error.details.fields).toEqual({ date: 'date_invalid' });

    const worker = await ctx.createWorker();
    expect((await worker.get('/api/rates?currency=USD')).status).toBe(200);
    expect((await worker.get('/api/rates/config')).body).toEqual({ provider: 'currency_api', autoFill: true, attribution: null });
    expect((await worker.get('/api/settings/exchange-rates')).status).toBe(403);
    expect((await ctx.client().get('/api/rates?currency=USD')).status).toBe(401);
    expect((await ctx.client().get('/api/rates/config')).status).toBe(401);
  });

  it('keeps saved expenses at their own rate when market rates move (X12, SC-003)', async () => {
    const rates = fakeRates();
    const ctx = await createTestContext({}, { http: rates.http });
    const owner = await ctx.createOwner();
    const order = await seedOrder(owner);
    const expense = await seedExpense(owner, order.id, { amount: '1200', currency: 'USD', rate: '7.1', rateSource: 'auto' });

    rates.state.dates['2026-10-07'] = { USD: '7.25', MAD: '0.73', EUR: '7.9' };
    expect((await owner.post('/api/rates/refresh')).body.rates[0].rate).toBe('7.250000');
    const after = (await owner.get(`/api/expenses/${expense.id}`)).body;
    expect(after).toMatchObject({ rate: '7.100000', cnyAmount: '8520.00', rateSource: 'auto' });
  });

  it('manages provider, key and auto-fill, never revealing or auditing the key (X16, FR-014, FR-024)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    expect((await owner.get('/api/settings/exchange-rates')).body).toEqual({
      provider: 'currency_api',
      providers: ['currency_api', 'exchangerate_api_open', 'manual'],
      apiKeySet: false,
      apiKeyLast4: null,
      autoFill: true,
      lastFetchAt: null,
      lastError: null,
      lastErrorAt: null,
      attribution: null,
    });

    const secret = 'sk-live-ABCD1234wxyz';
    const updated = await owner.patch('/api/settings/exchange-rates', { provider: 'exchangerate_api_open', apiKey: secret, autoFill: false });
    expect(updated.body).toMatchObject({
      provider: 'exchangerate_api_open',
      apiKeySet: true,
      apiKeyLast4: 'wxyz',
      autoFill: false,
      attribution: { text: 'Rates By Exchange Rate API', url: 'https://www.exchangerate-api.com' },
    });
    expect(JSON.stringify(updated.body)).not.toContain(secret);
    expect((await owner.get('/api/rates/config')).body).toEqual({
      provider: 'exchangerate_api_open',
      autoFill: false,
      attribution: { text: 'Rates By Exchange Rate API', url: 'https://www.exchangerate-api.com' },
    });

    const entries = ctx.sqlite
      .prepare("select action, target_type, before_json, after_json from audit_entries where target_type = 'rate_settings'")
      .all() as { action: string; before_json: string; after_json: string }[];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('settings.updated');
    expect(JSON.parse(entries[0]!.before_json)).toEqual({ provider: 'currency_api', autoFill: true, accessKey: null });
    expect(JSON.parse(entries[0]!.after_json)).toEqual({ provider: 'exchangerate_api_open', autoFill: false, accessKey: 'set' });
    const everything = JSON.stringify(ctx.sqlite.prepare('select * from audit_entries').all());
    expect(everything).not.toContain(secret);
    expect(everything).not.toContain('wxyz');

    // Replacing and removing the key are audited without it; an unchanged save is not audited.
    await owner.patch('/api/settings/exchange-rates', { apiKey: 'another-key-9876' });
    await owner.patch('/api/settings/exchange-rates', { autoFill: false });
    const removed = await owner.patch('/api/settings/exchange-rates', { apiKey: null });
    expect(removed.body).toMatchObject({ apiKeySet: false, apiKeyLast4: null });
    const afters = (
      ctx.sqlite.prepare("select after_json from audit_entries where target_type = 'rate_settings' order by rowid").all() as { after_json: string }[]
    ).map((r) => JSON.parse(r.after_json));
    expect(afters.slice(1)).toEqual([{ accessKey: 'replaced' }, { accessKey: null }]);

    const bad = await owner.patch('/api/settings/exchange-rates', { provider: 'yahoo' });
    expect(bad.body.error.details.fields).toEqual({ provider: 'invalid_value' });
  });
});
