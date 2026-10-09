import { BANK_RATE_TYPES, CURRENCY_CODES, PAYMENT_CHANNELS, PAYMENT_TYPES, RATE_SOURCES } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { auditColumns, softDeleteColumns } from './columns';
import { files } from './files';
import { orders } from './orders';
import { users } from './users';

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));
const amountRange = (column: string, min = 0) => sql.raw(`${column} BETWEEN ${min} AND 100000000000000`);

/**
 * Money received from the customer for one order, in one channel (004). Rates and every computed value are frozen
 * when saved (D1, brief §6): the CNY that actually arrived, what it counts for in the order's currency, and its USD
 * and MAD values (research R1).
 */
export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    channel: text('channel', { enum: PAYMENT_CHANNELS }).notNull(),
    type: text('type', { enum: PAYMENT_TYPES }).notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency', { enum: CURRENCY_CODES }).notNull(),
    /** Calendar date `YYYY-MM-DD`. */
    paymentDate: text('payment_date').notNull(),
    reference: text('reference'),
    /** "1 unit = X CNY" × 1,000,000: the rates entered for the customer. USD and MAD are always present. */
    usdCnyMicro: integer('usd_cny_micro').notNull(),
    madCnyMicro: integer('mad_cny_micro').notNull(),
    eurCnyMicro: integer('eur_cny_micro'),
    rateSource: text('rate_source', { enum: RATE_SOURCES }).notNull(),
    ratesFetchedAt: integer('rates_fetched_at'),
    /** The payment currency's market rate on its date, from the rate cache only (research R3). */
    marketRateMicro: integer('market_rate_micro'),
    marketRateDate: text('market_rate_date'),
    /** The Chinese bank's conversion: all four set, or none (FR-008). */
    bankRateMicro: integer('bank_rate_micro'),
    bankName: text('bank_name'),
    bankRateType: text('bank_rate_type', { enum: BANK_RATE_TYPES }),
    bankRateAt: integer('bank_rate_at'),
    /** The CNY that actually arrived: at the bank's rate when one is entered (decided 2026-10-08). */
    cnyMinor: integer('cny_minor').notNull(),
    /** What it counts for toward the agreed price, in the order's currency. */
    orderMinor: integer('order_minor').notNull(),
    orderMinorManual: integer('order_minor_manual', { mode: 'boolean' }).notNull().default(false),
    usdMinor: integer('usd_minor').notNull(),
    madMinor: integer('mad_minor').notNull(),
    proofFileId: text('proof_file_id').references(() => files.id),
    notes: text('notes'),
    ...auditColumns(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => users.id),
    ...softDeleteColumns(),
  },
  (t) => [
    index('payments_order_idx').on(t.orderId, t.deletedAt, t.paymentDate),
    index('payments_proof_idx').on(t.proofFileId),
    index('payments_created_by_idx').on(t.createdBy),
    check('payments_channel_check', sql`channel IN (${list(PAYMENT_CHANNELS)})`),
    check('payments_type_check', sql`type IN (${list(PAYMENT_TYPES)})`),
    check('payments_currency_check', sql`currency IN (${list(CURRENCY_CODES)})`),
    check('payments_rate_source_check', sql`rate_source IN (${list(RATE_SOURCES)})`),
    check('payments_bank_type_check', sql`bank_rate_type IS NULL OR bank_rate_type IN (${list(BANK_RATE_TYPES)})`),
    check('payments_amount_check', amountRange('amount_minor', 1)),
    check('payments_values_check', sql`${amountRange('cny_minor')} AND ${amountRange('order_minor')} AND ${amountRange('usd_minor')} AND ${amountRange('mad_minor')}`),
    check(
      'payments_rates_check',
      sql`usd_cny_micro > 0 AND mad_cny_micro > 0 AND (eur_cny_micro IS NULL OR eur_cny_micro > 0) AND (bank_rate_micro IS NULL OR bank_rate_micro > 0) AND (market_rate_micro IS NULL OR market_rate_micro > 0)`,
    ),
    check(
      'payments_bank_complete_check',
      sql`(bank_rate_micro IS NULL) = (bank_name IS NULL) AND (bank_name IS NULL) = (bank_rate_type IS NULL) AND (bank_rate_type IS NULL) = (bank_rate_at IS NULL)`,
    ),
    check('payments_bank_currency_check', sql`currency <> 'CNY' OR bank_rate_micro IS NULL`),
    check('payments_eur_rate_check', sql`currency <> 'EUR' OR eur_cny_micro IS NOT NULL`),
  ],
);

export type PaymentRow = typeof payments.$inferSelect;
