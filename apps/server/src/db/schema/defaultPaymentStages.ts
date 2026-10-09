import { ORDER_STATUSES, PAYMENT_CHANNELS, PAYMENT_TYPES } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** The plan copied to every new order (004 FR-013). Seeded with 30% Deposit Direct and 70% Balance Bank. */
export const defaultPaymentStages = sqliteTable(
  'default_payment_stages',
  {
    id: text('id').primaryKey(),
    position: integer('position').notNull(),
    type: text('type', { enum: PAYMENT_TYPES }).notNull(),
    channel: text('channel', { enum: PAYMENT_CHANNELS }).notNull(),
    percentBp: integer('percent_bp').notNull(),
    dueBeforeStatus: text('due_before_status', { enum: ORDER_STATUSES }),
  },
  (t) => [
    uniqueIndex('default_payment_stages_position_unique').on(t.position),
    check('default_payment_stages_type_check', sql`type IN (${list(PAYMENT_TYPES)})`),
    check('default_payment_stages_channel_check', sql`channel IN (${list(PAYMENT_CHANNELS)})`),
    check('default_payment_stages_percent_check', sql`percent_bp BETWEEN 1 AND 10000`),
    check(
      'default_payment_stages_status_check',
      sql`due_before_status IS NULL OR due_before_status IN (${list(ORDER_STATUSES)})`,
    ),
  ],
);

export type DefaultPaymentStageRow = typeof defaultPaymentStages.$inferSelect;
