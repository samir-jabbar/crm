import { RATE_PROVIDERS } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** Exchange-rate settings (003 FR-014): a single row, id = 1, seeded by migration. */
export const rateSettings = sqliteTable(
  'rate_settings',
  {
    id: integer('id').primaryKey(),
    provider: text('provider', { enum: RATE_PROVIDERS }).notNull().default('currency_api'),
    /** Secret: never returned in full, never audited. */
    apiKey: text('api_key'),
    autoFill: integer('auto_fill', { mode: 'boolean' }).notNull().default(true),
    lastFetchAt: integer('last_fetch_at'),
    lastError: text('last_error'),
    lastErrorAt: integer('last_error_at'),
    updatedAt: integer('updated_at').notNull(),
    updatedBy: text('updated_by').references(() => users.id),
  },
  () => [
    check('rate_settings_single_row', sql`id = 1`),
    check('rate_settings_provider_check', sql`provider IN (${list(RATE_PROVIDERS)})`),
  ],
);

export type RateSettingsRow = typeof rateSettings.$inferSelect;
