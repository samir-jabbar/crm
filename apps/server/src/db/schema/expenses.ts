import { CURRENCY_CODES, EXPENSE_STATUSES, PAYMENT_METHODS, RATE_SOURCES } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { auditColumns, softDeleteColumns } from './columns';
import { expenseCategories } from './expenseCategories';
import { files } from './files';
import { orders } from './orders';
import { suppliers } from './suppliers';
import { users } from './users';

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * One real cost of one order (003). The rate is frozen when saved; `cny_minor` is computed from it with
 * BigInt half-up rounding, and totals add the stored `cny_minor` values (research R2).
 */
export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    name: text('name').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency', { enum: CURRENCY_CODES }).notNull(),
    /** "1 unit = X CNY" × 1,000,000; exactly 1,000,000 for CNY. */
    rateMicro: integer('rate_micro').notNull(),
    rateSource: text('rate_source', { enum: RATE_SOURCES }).notNull(),
    cnyMinor: integer('cny_minor').notNull(),
    /** USD→CNY and MAD→CNY of the expense date, from the rate cache only (research R4). */
    usdCnyMicro: integer('usd_cny_micro'),
    madCnyMicro: integer('mad_cny_micro'),
    /** Calendar date `YYYY-MM-DD`. */
    expenseDate: text('expense_date').notNull(),
    paidToSupplierId: text('paid_to_supplier_id').references(() => suppliers.id),
    paidToName: text('paid_to_name'),
    paymentMethod: text('payment_method', { enum: PAYMENT_METHODS }).notNull().default('cash'),
    advancedBy: text('advanced_by'),
    reimbursed: integer('reimbursed', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: EXPENSE_STATUSES }).notNull().default('paid'),
    dueDate: text('due_date'),
    receiptFileId: text('receipt_file_id').references(() => files.id),
    notes: text('notes'),
    ...auditColumns(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => users.id),
    ...softDeleteColumns(),
  },
  (t) => [
    index('expenses_order_idx').on(t.orderId, t.deletedAt, t.expenseDate),
    index('expenses_category_idx').on(t.categoryId),
    index('expenses_paid_to_supplier_idx').on(t.paidToSupplierId),
    index('expenses_advanced_by_idx').on(t.advancedBy),
    index('expenses_receipt_idx').on(t.receiptFileId),
    index('expenses_created_by_idx').on(t.createdBy),
    check('expenses_currency_check', sql`currency IN (${list(CURRENCY_CODES)})`),
    check('expenses_amount_check', sql`amount_minor BETWEEN 1 AND 100000000000000`),
    check('expenses_cny_check', sql`cny_minor BETWEEN 0 AND 100000000000000`),
    check('expenses_rate_check', sql`rate_micro > 0`),
    check('expenses_cny_rate_check', sql`currency <> 'CNY' OR rate_micro = 1000000`),
    check('expenses_paid_to_check', sql`NOT (paid_to_supplier_id IS NOT NULL AND paid_to_name IS NOT NULL)`),
    check('expenses_status_check', sql`status IN (${list(EXPENSE_STATUSES)})`),
    check('expenses_method_check', sql`payment_method IN (${list(PAYMENT_METHODS)})`),
    check('expenses_rate_source_check', sql`rate_source IN (${list(RATE_SOURCES)})`),
  ],
);

export type ExpenseRow = typeof expenses.$inferSelect;
