import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/** Payment settings (004 FR-027): a single row, id = 1. A null channel name means the translated default. */
export const paymentSettings = sqliteTable(
  'payment_settings',
  {
    id: integer('id').primaryKey(),
    directChannelName: text('direct_channel_name'),
    bankChannelName: text('bank_channel_name'),
    updatedAt: integer('updated_at').notNull(),
    updatedBy: text('updated_by').references(() => users.id),
  },
  () => [check('payment_settings_single_row', sql`id = 1`)],
);

export type PaymentSettingsRow = typeof paymentSettings.$inferSelect;
