import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { currencyApi, exchangeRateApiOpen, type FetchContext } from '../../src/rates/providers';
import { fakeRates } from '../helpers';

const config = loadConfig({ NODE_ENV: 'test' });

function context(http: typeof fetch, signal = new AbortController().signal): FetchContext {
  return { http, config, signal };
}

// 003 research R1/R2: the adapters, against fake HTTP responses (no network).
describe('Currency API adapter', () => {
  it('requests latest and dated rates from jsDelivr, then the pages.dev fallback', async () => {
    const rates = fakeRates({
      dates: { '2026-10-07': { USD: '7.1', MAD: '0.71', EUR: '7.8' }, '2026-09-01': { USD: '7.15', MAD: '0.72', EUR: '7.9' } },
    });
    const latest = await currencyApi.fetchLatest(context(rates.http));
    expect(rates.calls).toEqual(['https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json']);
    // Quoted "1 CNY = x", inverted once to "1 unit = X CNY" in micro-units.
    expect(latest).toEqual({ rateDate: '2026-10-07', rates: { USD: 7_100_000, MAD: 710_000, EUR: 7_800_000 } });

    rates.state.mode = 'primaryDown';
    rates.calls.length = 0;
    const dated = await currencyApi.fetchDate!(context(rates.http), '2026-09-01');
    expect(rates.calls).toEqual([
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-09-01/v1/currencies/cny.json',
      'https://2026-09-01.currency-api.pages.dev/v1/currencies/cny.json',
    ]);
    expect(dated).toEqual({ rateDate: '2026-09-01', rates: { USD: 7_150_000, MAD: 720_000, EUR: 7_900_000 } });
  });

  it('answers null for a date the provider does not publish', async () => {
    const rates = fakeRates();
    expect(await currencyApi.fetchDate!(context(rates.http), '2020-01-01')).toBeNull();
  });

  it('fails as rates_unavailable when the provider is down or answers nonsense', async () => {
    const down = fakeRates({ mode: 'down' });
    await expect(currencyApi.fetchLatest(context(down.http))).rejects.toMatchObject({ code: 'rates_unavailable' });
    expect(down.calls).toHaveLength(2); // both hosts tried

    const bad = (body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status: 200 });
    for (const body of [{ date: '2026-10-07', cny: { usd: 0, mad: 0.1, eur: 0.1 } }, { date: '2026-10-07', cny: { usd: 0.1 } }, { cny: {} }]) {
      await expect(currencyApi.fetchLatest(context(bad(body)))).rejects.toMatchObject({ code: 'rates_unavailable' });
    }
    const notJson: typeof fetch = async () => new Response('<html>', { status: 200 });
    await expect(currencyApi.fetchLatest(context(notJson))).rejects.toMatchObject({ code: 'rates_unavailable' });
  });

  it('passes the abort signal to every request', async () => {
    const controller = new AbortController();
    const seen: (AbortSignal | null | undefined)[] = [];
    const http: typeof fetch = async (_url, init) => {
      seen.push(init?.signal);
      throw new TypeError('fetch failed');
    };
    await expect(currencyApi.fetchLatest(context(http, controller.signal))).rejects.toMatchObject({ code: 'rates_unavailable' });
    expect(seen).toEqual([controller.signal, controller.signal]);
  });
});

describe('ExchangeRate-API open access adapter', () => {
  it('reads the latest rates with their publication date, and has no dated lookup', async () => {
    const rates = fakeRates();
    const latest = await exchangeRateApiOpen.fetchLatest(context(rates.http));
    expect(rates.calls).toEqual(['https://open.er-api.com/v6/latest/CNY']);
    expect(latest).toEqual({ rateDate: '2026-10-07', rates: { USD: 7_100_000, MAD: 710_000, EUR: 7_800_000 } });
    expect(exchangeRateApiOpen.fetchDate).toBeUndefined();
    expect(exchangeRateApiOpen.attribution).toEqual({ text: 'Rates By Exchange Rate API', url: 'https://www.exchangerate-api.com' });
  });

  it('fails on an error result, HTTP 429 and 500', async () => {
    const errorResult: typeof fetch = async () => new Response(JSON.stringify({ result: 'error', 'error-type': 'unsupported-code' }));
    await expect(exchangeRateApiOpen.fetchLatest(context(errorResult))).rejects.toMatchObject({ code: 'rates_unavailable' });
    for (const status of [429, 500]) {
      const rates = fakeRates({ status });
      await expect(exchangeRateApiOpen.fetchLatest(context(rates.http))).rejects.toMatchObject({ code: 'rates_unavailable' });
    }
  });
});
