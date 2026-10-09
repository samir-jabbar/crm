import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { customers } from './customers';
import { orders } from './orders';
import { users } from './users';

/** Workers assigned to an order, for the "assigned orders" scope (005 FR-019). Kept when the order is deleted. */
export const orderAssignments = sqliteTable(
  'order_assignments',
  {
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    assignedAt: integer('assigned_at').notNull(),
    assignedBy: text('assigned_by').references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.userId] }), index('order_assignments_user_idx').on(t.userId, t.orderId)],
);

/** The customers whose orders a worker with the "selected customers" scope can reach (005 FR-018). */
export const userCustomers = sqliteTable(
  'user_customers',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.customerId] }), index('user_customers_user_idx').on(t.userId, t.customerId)],
);

/** Where and when an account registered (005 FR-003); also counts registrations per network origin (FR-006). */
export const registrations = sqliteTable(
  'registrations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    ip: text('ip'),
    userAgent: text('user_agent'),
    deviceLabel: text('device_label'),
    location: text('location'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('registrations_ip_idx').on(t.ip, t.createdAt), index('registrations_user_idx').on(t.userId)],
);

export type OrderAssignmentRow = typeof orderAssignments.$inferSelect;
export type RegistrationRow = typeof registrations.$inferSelect;
