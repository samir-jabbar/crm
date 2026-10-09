import type { ForeignCurrency } from '@hanjing/shared';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { exchangeRates } from '../db/schema';

/** Providers that publish rates (everything except `manual`). */
export type FetchingProvider = 'currency_api' | 'exchangerate_api_open';

export type RatesByCurrency = Record<ForeignCurrency, number>;

export interface CachedRate {
  rateDate: string;
  rateMicro: number;
  fetchedAt: number;
}

/** The cached rate of one currency on one published date (research R3). */
export function readRate(db: Executor, provider: FetchingProvider, date: string, currency: ForeignCurrency): CachedRate | undefined {
  return db
    .select({ rateDate: exchangeRates.rateDate, rateMicro: exchangeRates.rateMicro, fetchedAt: exchangeRates.fetchedAt })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.provider, provider), eq(exchangeRates.rateDate, date), eq(exchangeRates.currency, currency)))
    .get();
}

/**
 * What the provider's last "latest" call returned for a currency, with when it was fetched. Rows stored by a
 * back-dated lookup never count here, even when they were fetched today.
 */
export function latestCached(db: Executor, provider: FetchingProvider, currency: ForeignCurrency): CachedRate | undefined {
  return db
    .select({ rateDate: exchangeRates.rateDate, rateMicro: exchangeRates.rateMicro, fetchedAt: exchangeRates.fetchedAt })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.provider, provider), eq(exchangeRates.currency, currency), eq(exchangeRates.latest, true)))
    .orderBy(desc(exchangeRates.fetchedAt))
    .get();
}

/**
 * One provider call returns every currency: store them all, replacing an earlier fetch of the same date.
 * A "latest" call also moves the latest marker of this provider to these rows.
 */
export function writeRates(
  tx: Executor,
  provider: FetchingProvider,
  rateDate: string,
  rates: RatesByCurrency,
  fetchedAt: number,
  options: { latest: boolean },
): void {
  if (options.latest) tx.update(exchangeRates).set({ latest: false }).where(eq(exchangeRates.provider, provider)).run();
  for (const [currency, rateMicro] of Object.entries(rates) as [ForeignCurrency, number][]) {
    tx.insert(exchangeRates)
      .values({ provider, rateDate, currency, rateMicro, fetchedAt, latest: options.latest })
      .onConflictDoUpdate({
        target: [exchangeRates.provider, exchangeRates.rateDate, exchangeRates.currency],
        set: {
          rateMicro: sql`excluded.rate_micro`,
          fetchedAt: sql`excluded.fetched_at`,
          ...(options.latest ? { latest: true } : {}),
        },
      })
      .run();
  }
}

/**
 * USD→CNY and MAD→CNY for an expense date (research R4): the rates of that date, or of the nearest earlier
 * cached date. Reads the cache only and never calls a provider, so saving never depends on the rate service.
 */
export function snapshotFor(db: Executor, provider: FetchingProvider, date: string): { usdMicro: number | null; madMicro: number | null } {
  return {
    usdMicro: marketRateFor(db, provider, 'USD', date)?.rateMicro ?? null,
    madMicro: marketRateFor(db, provider, 'MAD', date)?.rateMicro ?? null,
  };
}

/**
 * The market rate of one currency on a date (004 research R3): that date's cached rate, or the nearest earlier
 * cached one, with the date it was published for. Reads the cache only; null when nothing is cached.
 */
export function marketRateFor(
  db: Executor,
  provider: FetchingProvider,
  currency: ForeignCurrency,
  date: string,
): { rateMicro: number; rateDate: string } | null {
  return (
    db
      .select({ rateMicro: exchangeRates.rateMicro, rateDate: exchangeRates.rateDate })
      .from(exchangeRates)
      .where(and(eq(exchangeRates.provider, provider), eq(exchangeRates.currency, currency), lte(exchangeRates.rateDate, date)))
      .orderBy(desc(exchangeRates.rateDate))
      .get() ?? null
  );
}
