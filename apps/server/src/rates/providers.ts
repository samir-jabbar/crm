import { FOREIGN_CURRENCIES, RATE_SCALE, type ForeignCurrency, type RateAttribution } from '@hanjing/shared';
import type { Config } from '../config';
import { AppError } from '../lib/errors';
import type { FetchingProvider, RatesByCurrency } from './cache';

export interface FetchContext {
  http: typeof fetch;
  config: Config;
  /** Aborts every request of the lookup together (research R3: answer within 5 s). */
  signal: AbortSignal;
}

export interface ProviderRates {
  /** The date the provider published these rates for. */
  rateDate: string;
  /** "1 unit = X CNY" in micro-units. */
  rates: RatesByCurrency;
}

/** A rate source (research R1). Providers quote "1 CNY = x foreign"; adapters invert once, here. */
export interface RateProvider {
  id: FetchingProvider;
  attribution: RateAttribution | null;
  fetchLatest(ctx: FetchContext): Promise<ProviderRates>;
  /** Rates published for one past date, or null when the provider has none for it. Absent: latest only. */
  fetchDate?(ctx: FetchContext, date: string): Promise<ProviderRates | null>;
}

export const ratesUnavailable = () => new AppError(503, 'rates_unavailable');

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "1 CNY = x foreign" → "1 foreign = X CNY" in micro-units. The only floating-point step in the app, and it only
 * produces a suggestion that the user can change (research R2).
 */
function invert(quoted: unknown): number {
  if (typeof quoted !== 'number' || !Number.isFinite(quoted) || quoted <= 0) throw ratesUnavailable();
  const micro = Math.round(RATE_SCALE / quoted);
  if (!Number.isSafeInteger(micro) || micro <= 0) throw ratesUnavailable();
  return micro;
}

function toRates(quotes: Record<string, unknown>, key: (currency: ForeignCurrency) => string): RatesByCurrency {
  const rates = {} as RatesByCurrency;
  for (const currency of FOREIGN_CURRENCIES) rates[currency] = invert(quotes[key(currency)]);
  return rates;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw ratesUnavailable();
  }
}

/**
 * Currency API (`@fawazahmed0/currency-api`, CC0, no key): jsDelivr first, then the pages.dev mirror, as its
 * README asks. Dated rates are served at the date in the URL; a date it does not publish answers 404.
 */
async function currencyApiFetch(ctx: FetchContext, date: string): Promise<ProviderRates | null> {
  let notFound = 0;
  for (const template of ctx.config.currencyApiUrls) {
    let res: Response;
    try {
      res = await ctx.http(template.replaceAll('{date}', date), { signal: ctx.signal, headers: { accept: 'application/json' } });
    } catch {
      if (ctx.signal.aborted) break;
      continue;
    }
    if (res.status === 404) {
      notFound += 1;
      continue;
    }
    if (!res.ok) continue;
    const body = (await readJson(res)) as { date?: unknown; cny?: Record<string, unknown> } | null;
    if (!body || typeof body.date !== 'string' || !DATE.test(body.date) || !body.cny) throw ratesUnavailable();
    return { rateDate: body.date, rates: toRates(body.cny, (c) => c.toLowerCase()) };
  }
  if (notFound === ctx.config.currencyApiUrls.length && date !== 'latest') return null;
  throw ratesUnavailable();
}

export const currencyApi: RateProvider = {
  id: 'currency_api',
  attribution: null,
  fetchLatest: async (ctx) => (await currencyApiFetch(ctx, 'latest')) ?? Promise.reject(ratesUnavailable()),
  fetchDate: (ctx, date) => currencyApiFetch(ctx, date),
};

/** ExchangeRate-API open access (no key, latest only). Its terms require the attribution wherever rates show. */
export const exchangeRateApiOpen: RateProvider = {
  id: 'exchangerate_api_open',
  attribution: { text: 'Rates By Exchange Rate API', url: 'https://www.exchangerate-api.com' },
  async fetchLatest(ctx) {
    let res: Response;
    try {
      res = await ctx.http(ctx.config.exchangeRateApiUrl, { signal: ctx.signal, headers: { accept: 'application/json' } });
    } catch {
      throw ratesUnavailable();
    }
    if (!res.ok) throw ratesUnavailable();
    const body = (await readJson(res)) as { result?: unknown; time_last_update_unix?: unknown; rates?: Record<string, unknown> } | null;
    if (!body || body.result !== 'success' || typeof body.time_last_update_unix !== 'number' || !body.rates) throw ratesUnavailable();
    const rateDate = new Date(body.time_last_update_unix * 1000).toISOString().slice(0, 10);
    return { rateDate, rates: toRates(body.rates, (c) => c) };
  },
};

export const PROVIDERS: Record<FetchingProvider, RateProvider> = {
  currency_api: currencyApi,
  exchangerate_api_open: exchangeRateApiOpen,
};
