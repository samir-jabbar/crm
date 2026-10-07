import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/** Single row (id = 1), seeded by the custom migration. */
export const companySettings = sqliteTable(
  'company_settings',
  {
    id: integer('id').primaryKey(),
    companyName: text('company_name').notNull().default(''),
    baseCurrency: text('base_currency', { enum: ['CNY'] })
      .notNull()
      .default('CNY'),
    sessionIdleTimeoutMinutes: integer('session_idle_timeout_minutes').notNull().default(720),
    /** 002: order numbers are `<prefix>-<year>-<counter>` (FR-022). */
    orderNumberPrefix: text('order_number_prefix').notNull().default('HJ'),
    updatedAt: integer('updated_at').notNull(),
    updatedBy: text('updated_by').references(() => users.id),
  },
  () => [
    check('company_settings_single_row', sql`id = 1`),
    check('company_settings_base_currency', sql`base_currency = 'CNY'`),
    check('company_settings_timeout_range', sql`session_idle_timeout_minutes BETWEEN 15 AND 10080`),
  ],
);

export type CompanySettingsRow = typeof companySettings.$inferSelect;
