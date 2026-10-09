import {
  averageRateMicro,
  convertToCnyMinor,
  PAYMENT_CHANNELS,
  percent1,
  RATE_SCALE,
  type CurrencyCode,
  type ForeignCurrency,
  type PaymentChannel,
} from '@hanjing/shared';
import { and, eq, inArray, isNull, sql, type Column, type SQL } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { payments } from '../db/schema';

/** Exact totals of an order's non-deleted payments (004 research R5), as bigints. */
export interface PaymentSums {
  /** Σ "counts as", in the order's currency, per channel. */
  byChannel: Record<PaymentChannel, bigint>;
  received: bigint;
  receivedCny: bigint;
  receivedUsd: bigint;
  receivedMad: bigint;
  /** Per foreign currency received: Σ amount in that currency and Σ CNY it brought (for average rates). */
  byCurrency: { currency: ForeignCurrency; amount: bigint; cny: bigint }[];
}

/** Sums as text, so they stay exact past 2^53 (as `orderExpenseSums` does in 003). */
const exact = (column: Column) => sql<string>`cast(sum(${column}) as text)`;

export function orderPaymentSums(
  db: Executor,
  orderId: string,
  channels: readonly PaymentChannel[] = PAYMENT_CHANNELS,
  /** 005: only some payments, e.g. the viewer's own entries (FR-028). */
  filter?: SQL,
): PaymentSums {
  const rows =
    channels.length === 0
      ? []
      : db
          .select({
            channel: payments.channel,
            currency: payments.currency,
            order: exact(payments.orderMinor),
            cny: exact(payments.cnyMinor),
            usd: exact(payments.usdMinor),
            mad: exact(payments.madMinor),
            amount: exact(payments.amountMinor),
          })
          .from(payments)
          .where(and(eq(payments.orderId, orderId), isNull(payments.deletedAt), inArray(payments.channel, [...channels]), filter))
          .groupBy(payments.channel, payments.currency)
          .all();

  const sums: PaymentSums = {
    byChannel: { direct: 0n, bank: 0n },
    received: 0n,
    receivedCny: 0n,
    receivedUsd: 0n,
    receivedMad: 0n,
    byCurrency: [],
  };
  const perCurrency = new Map<ForeignCurrency, { amount: bigint; cny: bigint }>();
  for (const row of rows) {
    sums.byChannel[row.channel] += BigInt(row.order);
    sums.received += BigInt(row.order);
    sums.receivedCny += BigInt(row.cny);
    sums.receivedUsd += BigInt(row.usd);
    sums.receivedMad += BigInt(row.mad);
    if (row.currency !== 'CNY') {
      const entry = perCurrency.get(row.currency) ?? { amount: 0n, cny: 0n };
      entry.amount += BigInt(row.amount);
      entry.cny += BigInt(row.cny);
      perCurrency.set(row.currency, entry);
    }
  }
  sums.byCurrency = [...perCurrency].map(([currency, v]) => ({ currency, ...v }));
  return sums;
}

/** What received money means for the order (research R5). Shared by the order's financials and the Payments tab. */
export interface PaymentFigures {
  received: bigint;
  remaining: bigint;
  overpaid: bigint;
  percentPaid: string | null;
  receivedCny: bigint;
  /** What remains, at the agreed rate (1 for CNY orders). Null when a non-CNY order has no agreed rate and money remains. */
  remainingCny: bigint | null;
  /** Received CNY minus the same money at the agreed rate. Null without an agreed rate. */
  fxResultCny: bigint | null;
  averageRates: { currency: ForeignCurrency; rateMicro: bigint }[];
}

export function paymentFigures(
  order: { currency: CurrencyCode; agreedPriceMinor: number; agreedRateMicro: number | null },
  sums: PaymentSums,
): PaymentFigures {
  const agreed = BigInt(order.agreedPriceMinor);
  const received = sums.received;
  const remaining = agreed > received ? agreed - received : 0n;
  const rate = order.currency === 'CNY' ? RATE_SCALE : order.agreedRateMicro;
  return {
    received,
    remaining,
    overpaid: received > agreed ? received - agreed : 0n,
    percentPaid: percent1(received, agreed),
    receivedCny: sums.receivedCny,
    remainingCny: rate === null ? (remaining === 0n ? 0n : null) : convertToCnyMinor(remaining, rate),
    fxResultCny: rate === null ? null : sums.receivedCny - convertToCnyMinor(received, rate),
    averageRates: sums.byCurrency.map(({ currency, amount, cny }) => ({ currency, rateMicro: averageRateMicro(cny, amount)! })),
  };
}
