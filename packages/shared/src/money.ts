import {
  AMOUNT_PATTERN,
  BASIS_POINTS,
  MAX_AMOUNT_MINOR,
  PERCENT_PATTERN,
  RATE_PATTERN,
  RATE_SCALE,
  RATE_TYPO_THRESHOLD,
} from './enums';

/**
 * Money is exact (constitution I): amounts are integer minor units (cents) everywhere in code and storage,
 * and decimal strings like "190000.00" on the wire. No floating-point arithmetic is ever applied.
 * All supported currencies (CNY, USD, MAD, EUR) have 2 decimals.
 */

export function isAmount(value: string): boolean {
  return AMOUNT_PATTERN.test(value);
}

/** "190000" → 19000000, "0.5" → 50. Throws on anything that is not a plain non-negative amount. */
export function parseAmount(value: string): number {
  if (!AMOUNT_PATTERN.test(value)) throw new Error(`Invalid amount: ${value}`);
  const [whole = '0', fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** 18250000 → "182500.00"; negative values keep their sign ("-750.00"). Accepts bigint for derived totals. */
export function formatAmount(minor: number | bigint): string {
  if (typeof minor === 'number' && !Number.isSafeInteger(minor)) throw new Error(`Amount out of range: ${minor}`);
  const value = BigInt(minor);
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

export function lineTotalMinor(quantity: number, unitMinor: number): number {
  const total = quantity * unitMinor;
  if (!Number.isSafeInteger(total)) throw new Error('Line total out of range');
  return total;
}

export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  if (!Number.isSafeInteger(total)) throw new Error('Total out of range');
  return total;
}

export function isWithinAmountLimit(minor: number): boolean {
  return minor >= 0 && minor <= MAX_AMOUNT_MINOR;
}

// ── Exchange rates (003, research R2) ──────────────────────────────────────
// A rate means "1 unit of the currency = X CNY", stored as integer micro-units (rate × 1,000,000).

export function isRate(value: string): boolean {
  return RATE_PATTERN.test(value) && /[1-9]/.test(value);
}

/** "7.1" → 7100000. Throws on anything that is not a positive rate with at most 6 decimals. */
export function parseRate(value: string): number {
  if (!isRate(value)) throw new Error(`Invalid rate: ${value}`);
  const [whole = '0', fraction = ''] = value.split('.');
  return Number(whole) * RATE_SCALE + Number(fraction.padEnd(6, '0'));
}

/** 7100000 → "7.100000" (always 6 decimals). */
export function formatRate(micro: number | bigint): string {
  const value = BigInt(micro);
  const scale = BigInt(RATE_SCALE);
  return `${value / scale}.${String(value % scale).padStart(6, '0')}`;
}

/**
 * Amount in CNY minor units: amount × rate, rounded to the cent with half a cent rounded up.
 * BigInt keeps it exact for any amount × rate (FR-003).
 */
export function convertToCnyMinor(amountMinor: number | bigint, rateMicro: number | bigint): bigint {
  const product = BigInt(amountMinor) * BigInt(rateMicro);
  const scale = BigInt(RATE_SCALE);
  const half = scale / 2n;
  return product >= 0n ? (product + half) / scale : -((-product + half) / scale);
}

/** numerator ÷ denominator as a percentage with one decimal, half away from zero ("10.8", "-5.0"). Null if ÷ 0. */
export function percent1(numerator: number | bigint, denominator: number | bigint): string | null {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  if (d === 0n) return null;
  const absN = n < 0n ? -n : n;
  const absD = d < 0n ? -d : d;
  const tenths = (absN * 2000n + absD) / (2n * absD);
  const negative = n < 0n !== d < 0n && tenths !== 0n;
  return `${negative ? '-' : ''}${tenths / 10n}.${tenths % 10n}`;
}

/** True when `typedMicro` differs from `referenceMicro` by more than RATE_TYPO_THRESHOLD (FR-005). */
export function rateDeviates(typedMicro: number, referenceMicro: number): boolean {
  if (referenceMicro <= 0) return false;
  // Integer comparison in whole percent, so exactly 20% is not a warning.
  return Math.abs(typedMicro - referenceMicro) * 100 > referenceMicro * Math.round(RATE_TYPO_THRESHOLD * 100);
}

// ── Payments and plans (004, research R1/R4/R5) ────────────────────────────

/** a × b ÷ c, rounded half up, exact for any size. For non-negative values and c > 0. */
export function mulDivRound(a: number | bigint, b: number | bigint, c: number | bigint): bigint {
  const [x, y, z] = [BigInt(a), BigInt(b), BigInt(c)];
  if (z <= 0n) throw new Error('mulDivRound: divisor must be positive');
  if (x < 0n || y < 0n) throw new Error('mulDivRound: values must not be negative');
  return (x * y * 2n + z) / (2n * z);
}

/** "30" → 3000, "12.5" → 1250 basis points. Throws unless 0 < percentage ≤ 100 with at most 2 decimals. */
export function parsePercent(value: string): number {
  if (!PERCENT_PATTERN.test(value)) throw new Error(`Invalid percentage: ${value}`);
  const [whole = '0', fraction = ''] = value.split('.');
  const bp = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (bp <= 0 || bp > BASIS_POINTS) throw new Error(`Percentage out of range: ${value}`);
  return bp;
}

/** 3000 → "30", 1250 → "12.5", 1 → "0.01": the shortest form, as a person would type it. */
export function formatPercent(bp: number): string {
  const whole = Math.floor(bp / 100);
  const fraction = String(bp % 100).padStart(2, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/**
 * The planned amount of each stage: its share of the agreed price, rounded to the cent. The last stage takes the
 * rounding difference, so the stages always add up to the agreed price exactly.
 */
export function planAmounts(agreedMinor: number | bigint, bps: readonly number[]): bigint[] {
  const total = BigInt(agreedMinor);
  const amounts = bps.map((bp) => mulDivRound(total, bp, BASIS_POINTS));
  if (amounts.length > 0) amounts[amounts.length - 1] = total - amounts.slice(0, -1).reduce((a, b) => a + b, 0n);
  return amounts;
}

/** The average rate obtained: total CNY ÷ total amount, as a micro-rate. Null when nothing was received. */
export function averageRateMicro(cnySum: number | bigint, amountSum: number | bigint): bigint | null {
  return BigInt(amountSum) === 0n ? null : mulDivRound(cnySum, RATE_SCALE, amountSum);
}
