import { FOREIGN_CURRENCIES } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** Rate cache (003 R3): "1 unit = X CNY" in micro-units, per provider and published date. */
export const exchangeRates = sqliteTable(
  'exchange_rates',
  {
    provider: text('provider', { enum: ['currency_api', 'exchangerate_api_open'] }).notNull(),
    /** `YYYY-MM-DD`, as published by the provider. */
    rateDate: text('rate_date').notNull(),
    currency: text('currency', { enum: FOREIGN_CURRENCIES }).notNull(),
    rateMicro: integer('rate_micro').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
    /** True on the rows of the provider's most recent "latest" call (a dated lookup never sets it). */
    latest: integer('latest', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.rateDate, t.currency] }),
    check('exchange_rates_currency_check', sql`currency IN (${list(FOREIGN_CURRENCIES)})`),
    check('exchange_rates_rate_check', sql`rate_micro > 0`),
  ],
);

export type ExchangeRateRow = typeof exchangeRates.$inferSelect;
