import { convertToCnyMinor, percent1, RATE_SCALE } from '@hanjing/shared';
import type { Executor } from '../db/client';
import type { OrderRow } from '../db/schema';
import { orderExpenseSums } from '../expenses/query';
import { orderPaymentSums, paymentFigures } from '../payments/sums';

/** Exact figures in minor units; formatted by the presenter. `received`/`remaining`/`overpaid` are in the order's currency. */
export interface OrderFinancialsRaw {
  agreedPriceCny: bigint | null;
  expensesTotal: bigint;
  unpaid: bigint;
  profit: bigint | null;
  marginPercent: string | null;
  budgetUsedPercent: string | null;
  profitUnavailableReason: 'agreed_rate_missing' | null;
  received: bigint;
  remaining: bigint;
  overpaid: bigint;
  percentPaid: string | null;
  receivedCny: bigint;
  remainingCny: bigint | null;
  fxResultCny: bigint | null;
}

type FinancialInputs = Pick<OrderRow, 'id' | 'currency' | 'agreedPriceMinor' | 'agreedRateMicro' | 'budgetCnyMinor'>;

/**
 * 003 FR-012 / 004 FR-017 – FR-020: derived on every read, never stored, so it can never drift from its inputs.
 *
 * Profit follows D2: the money received, each payment at its frozen CNY value (the CNY that actually arrived),
 * plus what remains to collect at the order's agreed rate, minus every expense. With no payment yet this is the
 * 003 figure (agreed price × agreed rate − expenses). A non-CNY order without an agreed rate has no profit while
 * money remains to collect; once fully paid, the agreed rate is no longer needed (FR-018).
 */
export function orderFinancials(db: Executor, order: FinancialInputs): OrderFinancialsRaw {
  const { grand, unpaid } = orderExpenseSums(db, order.id);
  const figures = paymentFigures(order, orderPaymentSums(db, order.id));
  const rate = order.currency === 'CNY' ? RATE_SCALE : order.agreedRateMicro;

  const base = {
    agreedPriceCny: rate === null ? null : convertToCnyMinor(order.agreedPriceMinor, rate),
    expensesTotal: grand,
    unpaid,
    budgetUsedPercent: order.budgetCnyMinor ? percent1(grand, order.budgetCnyMinor) : null,
    received: figures.received,
    remaining: figures.remaining,
    overpaid: figures.overpaid,
    percentPaid: figures.percentPaid,
    receivedCny: figures.receivedCny,
    remainingCny: figures.remainingCny,
    fxResultCny: figures.fxResultCny,
  };
  if (figures.remainingCny === null) {
    return { ...base, profit: null, marginPercent: null, profitUnavailableReason: 'agreed_rate_missing' };
  }
  const expected = figures.receivedCny + figures.remainingCny;
  const profit = expected - grand;
  return { ...base, profit, marginPercent: percent1(profit, expected), profitUnavailableReason: null };
}
