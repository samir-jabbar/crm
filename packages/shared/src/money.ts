import { AMOUNT_PATTERN, MAX_AMOUNT_MINOR } from './enums';

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

/** 18250000 → "182500.00"; negative values keep their sign ("-750.00"). */
export function formatAmount(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error(`Amount out of range: ${minor}`);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}${whole}.${String(cents).padStart(2, '0')}`;
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
