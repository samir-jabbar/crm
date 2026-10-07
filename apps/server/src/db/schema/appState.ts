import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Platform key/value state: setup_code_hash, setup_completed_at. */
export const appState = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
