import { z } from 'zod';
import type { CurrencyCode } from '../enums';
import { ORDER_NUMBER_PREFIX_PATTERN } from '../enums';
import { companyNameSchema, sessionIdleTimeoutSchema } from '../validation';

export interface CurrencyItem {
  code: CurrencyCode;
  symbol: string;
  minorUnits: number;
}

export interface SettingsResponse {
  companyName: string;
  baseCurrency: 'CNY';
  currencies: CurrencyItem[];
  /** Owner only: workers do not receive the security settings (005 FR-011). */
  sessionIdleTimeoutMinutes?: number;
  /** 005 FR-006, Owner only: whether new workers may register. */
  registrationOpen?: boolean;
  /** 002: order numbers are `<prefix>-<year>-<counter>`. */
  orderNumberPrefix: string;
  /** Preview of the next order number (nothing is reserved). */
  nextOrderNumber: string;
}

/** Strict: `baseCurrency` (or any other key) is rejected — the base currency is fixed to CNY. */
export const updateSettingsRequestSchema = z.strictObject({
  companyName: companyNameSchema.optional(),
  sessionIdleTimeoutMinutes: sessionIdleTimeoutSchema.optional(),
  orderNumberPrefix: z
    .string({ error: 'prefix_invalid' })
    .trim()
    .regex(ORDER_NUMBER_PREFIX_PATTERN, 'prefix_invalid')
    .optional(),
  /** 005: Owner only. */
  registrationOpen: z.boolean({ error: 'invalid_value' }).optional(),
});
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
