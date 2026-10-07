import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { auditColumns, softDeleteColumns } from './columns';

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    company: text('company'),
    city: text('city'),
    country: text('country'),
    phone: text('phone'),
    email: text('email'),
    notes: text('notes'),
    ...auditColumns(),
    ...softDeleteColumns(),
  },
  (t) => [index('customers_deleted_idx').on(t.deletedAt)],
);

export type CustomerRow = typeof customers.$inferSelect;
