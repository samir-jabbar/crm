import { PAYMENT_CHANNELS, type PaymentChannel } from '@hanjing/shared';
import { and, desc, eq, getTableColumns, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Executor } from '../db/client';
import { files, orders, payments, users, type OrderRow } from '../db/schema';
import { notFound } from '../lib/errors';
import type { PaymentSummaryRaw, PaymentView } from '../policy/present';
import { listPlan, planWithAmounts } from './plan';
import { readPaymentSettings } from './settings';
import { orderPaymentSums, paymentFigures } from './sums';

const creator = alias(users, 'payment_creator');
const updater = alias(users, 'payment_updater');

/**
 * Payments with what is shown next to them: the order's currency (for "counts as"), the proof's type, and who
 * created and changed them. Payments of a deleted order are never returned: they disappear with it.
 */
export function selectPaymentViews(db: Executor, where: SQL | undefined) {
  return db
    .select({
      ...getTableColumns(payments),
      orderCurrency: orders.currency,
      orderNumber: orders.number,
      orderTitle: orders.title,
      proofMime: files.mime,
      createdByLabel: creator.username,
      updatedByLabel: updater.username,
    })
    .from(payments)
    .innerJoin(orders, and(eq(payments.orderId, orders.id), isNull(orders.deletedAt)))
    .leftJoin(files, eq(payments.proofFileId, files.id))
    .leftJoin(creator, eq(payments.createdBy, creator.id))
    .leftJoin(updater, eq(payments.updatedBy, updater.id))
    .where(where);
}

export function getPaymentView(db: Executor, id: string, options: { deleted?: boolean } = {}): PaymentView | undefined {
  return selectPaymentViews(
    db,
    and(eq(payments.id, id), options.deleted ? isNotNull(payments.deletedAt) : isNull(payments.deletedAt)),
  ).get();
}

/** The order a payment belongs to: it must exist and not be deleted. */
export function requireLiveOrder(db: Executor, orderId: string): OrderRow {
  const order = db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))
    .get();
  if (!order) throw notFound();
  return order;
}

/** FR-005: newest payment date first, then newest entry. Only the channels the viewer may see. */
export function listOrderPayments(
  db: Executor,
  orderId: string,
  options: { deleted?: boolean; channels?: readonly PaymentChannel[]; filter?: SQL } = {},
): PaymentView[] {
  const channels = options.channels ?? PAYMENT_CHANNELS;
  if (channels.length === 0) return [];
  return selectPaymentViews(
    db,
    and(
      eq(payments.orderId, orderId),
      options.deleted ? isNotNull(payments.deletedAt) : isNull(payments.deletedAt),
      inArray(payments.channel, [...channels]),
      options.filter,
    ),
  )
    .orderBy(desc(payments.paymentDate), desc(payments.id))
    .all();
}

/**
 * The Payments tab summary (FR-004, FR-015, FR-016, FR-019, FR-021), over the channels the viewer may see:
 * planned / received / remaining per channel, the plan, the order's totals, average rates, the exchange result,
 * and the two warnings.
 */
export function paymentSummary(
  db: Executor,
  order: OrderRow,
  channels: readonly PaymentChannel[] = PAYMENT_CHANNELS,
  filter?: SQL,
): PaymentSummaryRaw {
  const sums = orderPaymentSums(db, order.id, channels, filter);
  const figures = paymentFigures(order, sums);
  const plan = planWithAmounts(listPlan(db, order.id), order.agreedPriceMinor).filter((s) => channels.includes(s.channel));
  const settings = readPaymentSettings(db);
  const agreed = BigInt(order.agreedPriceMinor);
  return {
    currency: order.currency,
    agreedMinor: agreed,
    channels: channels.map((channel) => {
      const planned = plan.filter((s) => s.channel === channel).reduce((total, s) => total + s.amountMinor, 0n);
      return {
        channel,
        name: channel === 'direct' ? settings.directChannelName : settings.bankChannelName,
        planned,
        received: sums.byChannel[channel],
        remaining: planned - sums.byChannel[channel],
      };
    }),
    plan,
    figures,
    receivedUsd: sums.receivedUsd,
    receivedMad: sums.receivedMad,
    agreedRateMicro: order.currency === 'CNY' ? null : order.agreedRateMicro,
    warnings: {
      overpaid: figures.overpaid > 0n ? figures.overpaid : null,
      // The invoice total is the agreed price until invoices exist (D3, feature 006).
      bankOverInvoice: channels.includes('bank') && sums.byChannel.bank > agreed ? sums.byChannel.bank - agreed : null,
    },
  };
}
