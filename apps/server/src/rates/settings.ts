import { eq } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { rateSettings, type RateSettingsRow } from '../db/schema';
import type { FetchingProvider } from './cache';

/** The single exchange-rate settings row (seeded by migration 0004). */
export function readRateSettings(db: Executor): RateSettingsRow {
  const row = db.select().from(rateSettings).where(eq(rateSettings.id, 1)).get();
  if (!row) throw new Error('rate_settings row is missing: run the migrations');
  return row;
}

/** The provider whose cache feeds expense snapshots: the chosen one, or the default when rates are manual. */
export function snapshotProvider(row: RateSettingsRow): FetchingProvider {
  return row.provider === 'manual' ? 'currency_api' : row.provider;
}
