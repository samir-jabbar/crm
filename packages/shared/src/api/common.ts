import { z } from 'zod';
import { AMOUNT_PATTERN, RATE_PATTERN } from '../enums';

/**
 * Optional free-text field. `undefined` = not sent (leave unchanged on PATCH); `null` or "" = clear it.
 */
export const optionalText = (max: number) =>
  z
    .string({ error: 'text_too_long' })
    .trim()
    .max(max, 'text_too_long')
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

export const optionalEmail = z
  .string({ error: 'email_invalid' })
  .trim()
  .max(120, 'email_invalid')
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'email_invalid')
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? v : null));

export const nameSchema = z.string({ error: 'name_invalid' }).trim().min(1, 'name_invalid').max(120, 'name_invalid');

/** Decimal amount string ("190000", "85000.5", "0.01"). See money.ts. */
export const amountSchema = z.string({ error: 'amount_invalid' }).trim().regex(AMOUNT_PATTERN, 'amount_invalid');

/** Rate to CNY ("7.1" = 1 unit is 7.1 CNY): up to 6 decimals, above 0 (003 research R2). */
export const rateSchema = z
  .string({ error: 'rate_invalid' })
  .trim()
  .regex(RATE_PATTERN, 'rate_invalid')
  .refine((v) => /[1-9]/.test(v), 'rate_invalid');

/** Calendar date `YYYY-MM-DD` (a date, not an instant). */
export const calendarDateSchema = z
  .string({ error: 'date_invalid' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_invalid')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  }, 'date_invalid');

export const idSchema = z.string().min(1).max(64);

export const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');
