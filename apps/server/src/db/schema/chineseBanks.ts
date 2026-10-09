import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * The banks offered in a payment's bank-rate field (004 FR-027), editable in Settings. Payments store the bank's
 * name as text, so removing a bank here never changes past payments.
 */
export const chineseBanks = sqliteTable(
  'chinese_banks',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('chinese_banks_name_unique').on(t.name)],
);

export type ChineseBankRow = typeof chineseBanks.$inferSelect;
