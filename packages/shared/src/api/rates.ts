import { z } from 'zod';
import { FOREIGN_CURRENCIES, RATE_PROVIDERS, type ForeignCurrency, type RateProviderId } from '../enums';
import { calendarDateSchema } from './common';

export const rateQuerySchema = z.object({
  currency: z.enum(FOREIGN_CURRENCIES, { error: 'currency_invalid' }),
  /** Optional: the rate for this date when the provider has it, else the latest. */
  date: calendarDateSchema.optional(),
});

export const rateSettingsPatchSchema = z.strictObject({
  provider: z.enum(RATE_PROVIDERS, { error: 'invalid_value' }).optional(),
  /** Write-only. null or "" removes the key. */
  apiKey: z
    .string({ error: 'invalid_value' })
    .trim()
    .max(200, 'text_too_long')
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null)),
  autoFill: z.boolean({ error: 'invalid_value' }).optional(),
});
export type RateSettingsPatch = z.input<typeof rateSettingsPatchSchema>;

export interface RateAttribution {
  text: string;
  url: string;
}

export interface RateQuote {
  currency: ForeignCurrency;
  /** "1 unit = X CNY", 6 decimals. */
  rate: string;
  /** The date the provider published this rate for. */
  rateDate: string;
  provider: Exclude<RateProviderId, 'manual'>;
  /** False when the requested date was not available and this is the latest rate instead. */
  exact: boolean;
}

/** What every rate field needs, for any signed-in user. Never includes the key or fetch status. */
export interface RateConfig {
  provider: RateProviderId;
  autoFill: boolean;
  attribution: RateAttribution | null;
}

export interface RateSettings extends RateConfig {
  providers: RateProviderId[];
  apiKeySet: boolean;
  apiKeyLast4: string | null;
  lastFetchAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface RefreshResult {
  rates: { currency: ForeignCurrency; rate: string; rateDate: string }[];
  fetchedAt: string;
}
