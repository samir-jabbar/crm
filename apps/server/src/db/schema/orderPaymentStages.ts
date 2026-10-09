import { ORDER_STATUSES, PAYMENT_CHANNELS, PAYMENT_TYPES } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { orders } from './orders';

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * One planned instalment of an order (004 FR-012): its share of the agreed price in basis points, its channel,
 * and when it is due ("before production" = before the order reaches `in_production`). The stages of an order
 * total 10,000; amounts are derived from the agreed price on every read (research R4).
 */
export const orderPaymentStages = sqliteTable(
  'order_payment_stages',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    position: integer('position').notNull(),
    type: text('type', { enum: PAYMENT_TYPES }).notNull(),
    channel: text('channel', { enum: PAYMENT_CHANNELS }).notNull(),
    percentBp: integer('percent_bp').notNull(),
    dueBeforeStatus: text('due_before_status', { enum: ORDER_STATUSES }),
    /** Calendar date `YYYY-MM-DD`. */
    dueDate: text('due_date'),
  },
  (t) => [
    uniqueIndex('order_payment_stages_position_unique').on(t.orderId, t.position),
    check('order_payment_stages_type_check', sql`type IN (${list(PAYMENT_TYPES)})`),
    check('order_payment_stages_channel_check', sql`channel IN (${list(PAYMENT_CHANNELS)})`),
    check('order_payment_stages_percent_check', sql`percent_bp BETWEEN 1 AND 10000`),
    check(
      'order_payment_stages_status_check',
      sql`due_before_status IS NULL OR due_before_status IN (${list(ORDER_STATUSES)})`,
    ),
  ],
);

export type OrderPaymentStageRow = typeof orderPaymentStages.$inferSelect;
