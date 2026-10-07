import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { auditColumns, softDeleteColumns } from './columns';

export const suppliers = sqliteTable(
  'suppliers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    company: text('company'),
    contactPerson: text('contact_person'),
    phone: text('phone'),
    wechat: text('wechat'),
    email: text('email'),
    city: text('city'),
    country: text('country'),
    notes: text('notes'),
    ...auditColumns(),
    ...softDeleteColumns(),
  },
  (t) => [index('suppliers_deleted_idx').on(t.deletedAt)],
);

export type SupplierRow = typeof suppliers.$inferSelect;
