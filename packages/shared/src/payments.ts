import { RATE_SCALE, type CurrencyCode } from './enums';
import { convertToCnyMinor, mulDivRound, percent1 } from './money';

/**
 * How a payment is valued (004 research R1, decided 2026-10-08). Shared by the server, which freezes the values,
 * and the payment form, which shows them live, so what the Owner sees while typing is exactly what is saved.
 */
export interface PaymentValueInput {
  amountMinor: number | bigint;
  currency: CurrencyCode;
  orderCurrency: CurrencyCode;
  /** The rates entered for the customer, in micro-units. USD and MAD are always present. */
  rates: { USD: number; MAD: number; EUR: number | null };
  /** The Chinese bank's rate for the payment's currency, when it converted the payment. */
  bankRateMicro: number | null;
  /** "Counts as", typed by hand in the order's currency; null = computed. */
  countsAsMinor: number | bigint | null;
}

export interface PaymentValues {
  /** The CNY that actually arrived: at the bank's rate when entered, otherwise at the customer rate. */
  cnyMinor: bigint;
  /** What the payment counts for toward the agreed price, in the order's currency. */
  orderMinor: bigint;
  orderManual: boolean;
  usdMinor: bigint;
  madMinor: bigint;
}

/** The customer rate to CNY of a currency on this payment. */
export function customerRate(currency: CurrencyCode, rates: PaymentValueInput['rates']): number {
  if (currency === 'CNY') return RATE_SCALE;
  const rate = rates[currency];
  if (!rate) throw new Error(`No ${currency}→CNY rate on this payment`);
  return rate;
}

export function paymentValues(input: PaymentValueInput): PaymentValues {
  const amount = BigInt(input.amountMinor);
  const ownRate = customerRate(input.currency, input.rates);
  const cnyMinor = convertToCnyMinor(amount, input.bankRateMicro ?? ownRate);

  let orderMinor: bigint;
  let orderManual = false;
  if (input.currency === input.orderCurrency) {
    orderMinor = amount;
  } else if (input.countsAsMinor !== null) {
    orderMinor = BigInt(input.countsAsMinor);
    orderManual = true;
  } else {
    // Converted through the payment's own customer rates, not the bank's (the customer is credited at the
    // agreed conversion; the bank's cost shows in the exchange result).
    orderMinor = mulDivRound(amount, ownRate, customerRate(input.orderCurrency, input.rates));
  }

  return {
    cnyMinor,
    orderMinor,
    orderManual,
    usdMinor: input.currency === 'USD' ? amount : mulDivRound(cnyMinor, RATE_SCALE, input.rates.USD),
    madMinor: input.currency === 'MAD' ? amount : mulDivRound(cnyMinor, RATE_SCALE, input.rates.MAD),
  };
}

/**
 * The bank's rate against the market rate (FR-010): the CNY difference for this amount and the percentage with one
 * decimal ("-0.7"). Information only; null unless both rates are known.
 */
export function paymentGap(
  amountMinor: number | bigint,
  bankRateMicro: number | null,
  marketRateMicro: number | null,
): { cny: bigint; percent: string } | null {
  if (!bankRateMicro || !marketRateMicro) return null;
  return {
    cny: convertToCnyMinor(amountMinor, bankRateMicro) - convertToCnyMinor(amountMinor, marketRateMicro),
    percent: percent1(bankRateMicro - marketRateMicro, marketRateMicro)!,
  };
}
