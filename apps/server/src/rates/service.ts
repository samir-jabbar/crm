import {
  FOREIGN_CURRENCIES,
  formatRate,
  RATE_PROVIDERS,
  type ForeignCurrency,
  type RateConfig,
  type RateQuote,
  type RateSettings,
  type RateSettingsPatch,
  type RefreshResult,
} from '@hanjing/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import { rateSettings, type RateSettingsRow, type UserRow } from '../db/schema';
import type { Deps } from '../deps';
import type { RequestCtx } from '../lib/requestContext';
import { latestCached, readRate, writeRates, type CachedRate, type FetchingProvider } from './cache';
import { PROVIDERS, ratesUnavailable, type ProviderRates, type RateProvider } from './providers';
import { readRateSettings } from './settings';

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** Lookups in progress, per database: concurrent requests for the same rates share one provider call (R3). */
const inFlight = new WeakMap<object, Map<string, Promise<ProviderRates | null>>>();

function activeProvider(row: RateSettingsRow): RateProvider {
  if (row.provider === 'manual') throw ratesUnavailable();
  return PROVIDERS[row.provider];
}

/**
 * One provider call under the configured timeout. Every currency it returns goes into the cache, and the settings
 * status records the outcome (FR-014). Saving an expense never comes here (research R4).
 */
async function callProvider(
  deps: Deps,
  provider: RateProvider,
  key: string,
  lookup: (provider: RateProvider) => Promise<ProviderRates | null>,
  latest: boolean,
): Promise<ProviderRates | null> {
  let calls = inFlight.get(deps.db);
  if (!calls) inFlight.set(deps.db, (calls = new Map()));
  const pending = calls.get(key);
  if (pending) return pending;

  const run = (async () => {
    const { db, clock } = deps;
    try {
      const result = await lookup(provider);
      const now = clock.now();
      db.transaction((tx) => {
        if (result) writeRates(tx, provider.id, result.rateDate, result.rates, now, { latest });
        tx.update(rateSettings).set({ lastFetchAt: now, lastError: null, lastErrorAt: null }).where(eq(rateSettings.id, 1)).run();
      });
      return result;
    } catch (error) {
      db.update(rateSettings).set({ lastError: 'rates_unavailable', lastErrorAt: clock.now() }).where(eq(rateSettings.id, 1)).run();
      deps.log.warn(`[rates] ${provider.id} unavailable: ${error instanceof Error ? error.message : String(error)}`);
      throw ratesUnavailable();
    } finally {
      calls.delete(key);
    }
  })();
  calls.set(key, run);
  return run;
}

const context = (deps: Deps) => ({ http: deps.http, config: deps.config, signal: AbortSignal.timeout(deps.config.rateFetchTimeoutMs) });

async function fetchLatest(deps: Deps, provider: RateProvider): Promise<ProviderRates> {
  return (await callProvider(deps, provider, `${provider.id}:latest`, (p) => p.fetchLatest(context(deps)), true))!;
}

function quote(currency: ForeignCurrency, provider: FetchingProvider, rate: Pick<CachedRate, 'rateDate' | 'rateMicro'>, exact: boolean): RateQuote {
  return { currency, rate: formatRate(rate.rateMicro), rateDate: rate.rateDate, provider, exact };
}

/** The latest rate: from the cache when the provider was asked today (UTC), otherwise one call (FR-016). */
async function latestRate(deps: Deps, provider: RateProvider, currency: ForeignCurrency, requested?: string): Promise<RateQuote> {
  const cached = latestCached(deps.db, provider.id, currency);
  if (cached && utcDate(cached.fetchedAt) === utcDate(deps.clock.now())) {
    return quote(currency, provider.id, cached, !requested || cached.rateDate === requested);
  }
  const result = await fetchLatest(deps, provider);
  return quote(currency, provider.id, { rateDate: result.rateDate, rateMicro: result.rates[currency] }, !requested || result.rateDate === requested);
}

/**
 * FR-015: the rate to CNY for a date when the provider publishes it, otherwise the latest, labelled with its own
 * date (`exact: false`). Answers `rates_unavailable` within the timeout when the provider fails or is `manual`.
 */
export async function getRate(deps: Deps, currency: ForeignCurrency, date?: string): Promise<RateQuote> {
  const provider = activeProvider(readRateSettings(deps.db));
  if (!date || date >= utcDate(deps.clock.now())) return latestRate(deps, provider, currency, date);

  const cached = readRate(deps.db, provider.id, date, currency);
  if (cached) return quote(currency, provider.id, cached, true);
  if (provider.fetchDate) {
    const result = await callProvider(deps, provider, `${provider.id}:${date}`, (p) => p.fetchDate!(context(deps), date), false);
    if (result) return quote(currency, provider.id, { rateDate: result.rateDate, rateMicro: result.rates[currency] }, result.rateDate === date);
  }
  return latestRate(deps, provider, currency, date);
}

/** "Refresh rates" (FR-016): always asks the provider for the latest rates. */
export async function refreshLatest(deps: Deps): Promise<RefreshResult> {
  const provider = activeProvider(readRateSettings(deps.db));
  const result = await fetchLatest(deps, provider);
  return {
    rates: FOREIGN_CURRENCIES.map((currency) => ({ currency, rate: formatRate(result.rates[currency]), rateDate: result.rateDate })),
    fetchedAt: new Date(deps.clock.now()).toISOString(),
  };
}

// ── Settings (FR-014, FR-024) ──────────────────────────────────────────────

export function getRateConfig(deps: Deps): RateConfig {
  const row = readRateSettings(deps.db);
  return {
    provider: row.provider,
    autoFill: row.autoFill,
    attribution: row.provider === 'manual' ? null : PROVIDERS[row.provider].attribution,
  };
}

/** The key is never returned: only whether one is set and its last 4 characters. */
export function getRateSettings(deps: Deps): RateSettings {
  const row = readRateSettings(deps.db);
  return {
    ...getRateConfig(deps),
    providers: [...RATE_PROVIDERS],
    apiKeySet: row.apiKey !== null,
    apiKeyLast4: row.apiKey ? row.apiKey.slice(-4) : null,
    lastFetchAt: iso(row.lastFetchAt),
    lastError: row.lastError,
    lastErrorAt: iso(row.lastErrorAt),
  };
}

/** What the audit log shows: the key only as set / replaced / removed, never any of its characters. */
const auditView = (row: Pick<RateSettingsRow, 'provider' | 'autoFill'>, accessKey: 'set' | 'replaced' | null) => ({
  provider: row.provider,
  autoFill: row.autoFill,
  accessKey,
});

export function updateRateSettings(deps: Deps, patch: RateSettingsPatch, actor: UserRow, ctx: RequestCtx): RateSettings {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const before = readRateSettings(tx);
    const next = {
      provider: patch.provider ?? before.provider,
      autoFill: patch.autoFill ?? before.autoFill,
      apiKey: patch.apiKey === undefined ? before.apiKey : patch.apiKey,
    };
    const keyState = (key: string | null) => (key === null ? null : key === before.apiKey ? 'set' : before.apiKey ? 'replaced' : 'set');
    const beforeView = auditView(before, before.apiKey ? 'set' : null);
    const afterView = auditView(next, keyState(next.apiKey));
    if (JSON.stringify(beforeView) === JSON.stringify(afterView)) return;

    tx.update(rateSettings)
      .set({ ...next, updatedAt: clock.now(), updatedBy: actor.id })
      .where(eq(rateSettings.id, 1))
      .run();
    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'settings.updated',
      targetType: 'rate_settings',
      targetId: '1',
      ctx,
      before: beforeView,
      after: afterView,
    });
  });
  return getRateSettings(deps);
}
