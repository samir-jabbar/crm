import { CURRENCY_CODES } from '@hanjing/shared';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Reference data seeded by migration. Display names come from client translations. */
export const currencies = sqliteTable('currencies', {
  code: text('code', { enum: CURRENCY_CODES }).primaryKey(),
  symbol: text('symbol').notNull(),
  minorUnits: integer('minor_units').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export type CurrencyRow = typeof currencies.$inferSelect;
