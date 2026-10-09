import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Expense categories (003 R8): 13 seeded defaults with a stable `key` (label from translations),
 * plus user-added ones with a typed `name`. Never deleted, only hidden (FR-022).
 */
export const expenseCategories = sqliteTable(
  'expense_categories',
  {
    id: text('id').primaryKey(),
    key: text('key'),
    /** Typed or renamed label; wins over the translation of `key`. */
    name: text('name'),
    position: integer('position').notNull(),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('expense_categories_key_unique').on(t.key),
    check('expense_categories_label_check', sql`key IS NOT NULL OR name IS NOT NULL`),
  ],
);

export type ExpenseCategoryRow = typeof expenseCategories.$inferSelect;
