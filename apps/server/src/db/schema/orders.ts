import { CURRENCY_CODES, INCOTERMS, ORDER_STATUSES } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { auditColumns, softDeleteColumns } from './columns';
import { customers } from './customers';

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    /** `<prefix>-<year>-<seq>`, never changes and is never reused (FR-009). */
    number: text('number').notNull(),
    numberYear: integer('number_year').notNull(),
    numberSeq: integer('number_seq').notNull(),
    title: text('title').notNull(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    deliveryCity: text('delivery_city'),
    status: text('status', { enum: ORDER_STATUSES }).notNull().default('draft'),
    /** Typed by hand (decision 2026-10-07), integer minor units. */
    agreedPriceMinor: integer('agreed_price_minor').notNull(),
    currency: text('currency', { enum: CURRENCY_CODES }).notNull(),
    incoterm: text('incoterm', { enum: INCOTERMS }),
    destinationPort: text('destination_port'),
    /** Calendar date `YYYY-MM-DD`. */
    expectedDeliveryDate: text('expected_delivery_date'),
    /** Planned total cost in CNY (D7), integer minor units. */
    budgetCnyMinor: integer('budget_cny_minor'),
    /** Agreed rate to CNY in micro-units (003 D2); required by the API for non-CNY orders, null for CNY. */
    agreedRateMicro: integer('agreed_rate_micro'),
    ...auditColumns(),
    ...softDeleteColumns(),
  },
  (t) => [
    uniqueIndex('orders_number_unique').on(t.number),
    index('orders_deleted_created_idx').on(t.deletedAt, t.createdAt),
    index('orders_customer_idx').on(t.customerId),
    index('orders_status_idx').on(t.status),
    check('orders_status_check', sql`status IN (${list(ORDER_STATUSES)})`),
    check('orders_currency_check', sql`currency IN (${list(CURRENCY_CODES)})`),
    check('orders_incoterm_check', sql`incoterm IS NULL OR incoterm IN (${list(INCOTERMS)})`),
    check('orders_price_check', sql`agreed_price_minor BETWEEN 0 AND 100000000000000`),
    check('orders_budget_check', sql`budget_cny_minor IS NULL OR budget_cny_minor BETWEEN 0 AND 100000000000000`),
    check('orders_agreed_rate_check', sql`agreed_rate_micro IS NULL OR agreed_rate_micro > 0`),
  ],
);

export type OrderRow = typeof orders.$inferSelect;
