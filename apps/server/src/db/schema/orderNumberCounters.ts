import { integer, sqliteTable } from 'drizzle-orm/sqlite-core';

/** Last order-number counter used per calendar year (China time). Never decremented (research R2). */
export const orderNumberCounters = sqliteTable('order_number_counters', {
  year: integer('year').primaryKey(),
  lastValue: integer('last_value').notNull(),
});
