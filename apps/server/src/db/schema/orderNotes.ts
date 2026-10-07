import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { softDeleteColumns } from './columns';
import { orders } from './orders';
import { users } from './users';

/** Timestamped notes on an order; immutable (add or delete only). */
export const orderNotes = sqliteTable(
  'order_notes',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    body: text('body').notNull(),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
    ...softDeleteColumns(),
  },
  (t) => [index('order_notes_order_idx').on(t.orderId, t.createdAt)],
);

export type OrderNoteRow = typeof orderNotes.$inferSelect;
