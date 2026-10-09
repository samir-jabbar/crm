import { z } from 'zod';
import {
  BANK_RATE_TYPES,
  BASIS_POINTS,
  CURRENCY_CODES,
  MAX_PLAN_STAGES,
  ORDER_STATUSES,
  PAYMENT_CHANNELS,
  PAYMENT_TYPES,
  PERCENT_PATTERN,
  RATE_PATTERN,
  RATE_SOURCES,
  type BankRateType,
  type CurrencyCode,
  type ForeignCurrency,
  type OrderStatus,
  type PaymentChannel,
  type PaymentType,
  type RateSource,
  type ReceiptMime,
} from '../enums';
import { parsePercent } from '../money';
import { normalizeForSearch } from '../search';
import { amountSchema, booleanQuery, calendarDateSchema, idSchema, optionalText, rateSchema } from './common';

const issuesFree = (issues: readonly { path?: readonly PropertyKey[] }[], ...fields: string[]) =>
  issues.every((issue) => !fields.includes(String(issue.path?.[0])));

/** An instant as sent by the browser (`toISOString()`). */
const instantSchema = z
  .string({ error: 'date_invalid' })
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/, 'date_invalid')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'date_invalid');

/** A rate that must be given: missing or null reports `rate_required`. */
const requiredRate = z
  .string({ error: 'rate_required' })
  .trim()
  .regex(RATE_PATTERN, 'rate_invalid')
  .refine((v) => /[1-9]/.test(v), 'rate_invalid');

/** The Chinese bank's conversion (FR-008): all four fields together, or nothing. Always typed (ROADMAP D8). */
export const bankConversionSchema = z.strictObject({
  rate: z
    .string({ error: 'bank_rate_incomplete' })
    .trim()
    .regex(RATE_PATTERN, 'rate_invalid')
    .refine((v) => /[1-9]/.test(v), 'rate_invalid'),
  name: z.string({ error: 'bank_rate_incomplete' }).trim().min(1, 'bank_rate_incomplete').max(60, 'text_too_long'),
  rateType: z.enum(BANK_RATE_TYPES, { error: 'bank_rate_incomplete' }),
  at: z.string({ error: 'bank_rate_incomplete' }).pipe(instantSchema),
});
export type BankConversionInput = z.input<typeof bankConversionSchema>;

/** Create (POST) and full edit (PUT) share one shape (004 contracts/api.md). */
export const paymentInputSchema = z
  .strictObject({
    channel: z.enum(PAYMENT_CHANNELS, { error: 'channel_invalid' }),
    type: z.enum(PAYMENT_TYPES, { error: 'payment_type_invalid' }),
    amount: amountSchema.refine((v) => /[1-9]/.test(v), 'amount_invalid'),
    currency: z.enum(CURRENCY_CODES, { error: 'currency_invalid' }),
    paymentDate: calendarDateSchema,
    reference: optionalText(80),
    /** MAD→CNY and USD→CNY are on every payment (brief §4.3); EUR→CNY when the payment or the order is in EUR. */
    rates: z.strictObject(
      { USD: requiredRate, MAD: requiredRate, EUR: rateSchema.nullable().optional() },
      { error: 'rate_required' },
    ),
    rateSource: z.enum(RATE_SOURCES, { error: 'invalid_value' }).default('manual'),
    /** When the rates were fetched (automatic sources only). */
    ratesFetchedAt: instantSchema.nullable().optional(),
    bank: bankConversionSchema.nullable().optional(),
    /** null = computed through the payment's own rates; a string = typed by hand (decided 2026-10-08). */
    countsAs: amountSchema.nullable().optional(),
    proofId: idSchema.nullable().optional(),
    notes: optionalText(2000),
  })
  // `when`: report these together with any other field error, so the form highlights everything at once.
  .refine((v) => v.currency !== 'EUR' || !!v.rates.EUR, {
    message: 'rate_required',
    path: ['rates', 'EUR'],
    when: (payload) => issuesFree(payload.issues, 'currency', 'rates'),
  })
  .refine((v) => v.currency !== 'CNY' || !v.bank, {
    message: 'bank_rate_incomplete',
    path: ['bank'],
    when: (payload) => issuesFree(payload.issues, 'currency', 'bank'),
  });
export type PaymentInput = z.input<typeof paymentInputSchema>;
export type ParsedPaymentInput = z.output<typeof paymentInputSchema>;

export const orderPaymentsQuerySchema = z.object({ deleted: booleanQuery });

// ── Plans ───────────────────────────────────────────────────────────────────

const percentSchema = z
  .string({ error: 'plan_total_invalid' })
  .trim()
  .regex(PERCENT_PATTERN, 'plan_total_invalid')
  .refine((v) => {
    try {
      parsePercent(v);
      return true;
    } catch {
      return false;
    }
  }, 'plan_total_invalid');

const stageFields = {
  type: z.enum(PAYMENT_TYPES, { error: 'payment_type_invalid' }),
  channel: z.enum(PAYMENT_CHANNELS, { error: 'channel_invalid' }),
  percent: percentSchema,
  /** "Before production" = due before the order reaches `in_production`. Translated with the order statuses. */
  dueBeforeStatus: z.enum(ORDER_STATUSES, { error: 'status_invalid' }).nullable().optional(),
};

export const planStageInputSchema = z.strictObject({ ...stageFields, dueDate: calendarDateSchema.nullable().optional() });
export const defaultPlanStageInputSchema = z.strictObject(stageFields);
export type PlanStageInput = z.input<typeof planStageInputSchema>;
export type DefaultPlanStageInput = z.input<typeof defaultPlanStageInputSchema>;

const totalIsWhole = (stages: readonly { percent: string }[]) =>
  stages.reduce((sum, s) => sum + parsePercent(s.percent), 0) === BASIS_POINTS;

function planStages<S extends z.ZodType<{ percent: string }>>(stage: S) {
  return z
    .array(stage, { error: 'plan_total_invalid' })
    .min(1, 'plan_total_invalid')
    .max(MAX_PLAN_STAGES, 'plan_total_invalid')
    .refine(totalIsWhole, { message: 'plan_total_invalid', when: (payload) => payload.issues.length === 0 });
}

/** A plan totals exactly 100% (FR-014). */
export const paymentPlanSchema = z.strictObject({ stages: planStages(planStageInputSchema) });
export type PaymentPlanInput = z.input<typeof paymentPlanSchema>;

// ── Settings ────────────────────────────────────────────────────────────────

/** Empty = the translated default name. */
const channelName = z
  .string({ error: 'name_invalid' })
  .trim()
  .max(40, 'name_invalid')
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? v : null));

export const paymentSettingsPatchSchema = z.strictObject({
  channelNames: z.strictObject({ direct: channelName, bank: channelName }).optional(),
  defaultPlan: planStages(defaultPlanStageInputSchema).optional(),
  banks: z
    .array(z.string({ error: 'name_invalid' }).trim().min(1, 'name_invalid').max(60, 'name_invalid'), { error: 'name_invalid' })
    .max(30, 'name_invalid')
    .refine((names) => new Set(names.map(normalizeForSearch)).size === names.length, {
      message: 'name_invalid',
      when: (payload) => payload.issues.length === 0,
    })
    .optional(),
});
export type PaymentSettingsPatch = z.input<typeof paymentSettingsPatchSchema>;

// ── Responses ───────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  orderId: string;
  channel: PaymentChannel;
  type: PaymentType;
  /** Amounts, rates, values and the proof are absent when payment amounts are hidden (005 FR-025). */
  amount?: string;
  currency: CurrencyCode;
  paymentDate: string;
  reference: string | null;
  /** USD and MAD are on every payment; EUR when the payment or the order is in EUR. */
  rates?: { USD: string; MAD: string; EUR: string | null };
  rateSource: RateSource;
  ratesFetchedAt: string | null;
  /** The payment currency's market rate on its date, from the rate cache (research R3). */
  marketRate?: { rate: string; rateDate: string } | null;
  /** 005: `rate` is absent with payment amounts hidden, `name` with bank details hidden. */
  bank: { rate?: string; name?: string; rateType: BankRateType; at: string } | null;
  /** The CNY that actually arrived: at the bank's rate when one is entered (decided 2026-10-08). */
  cnyAmount?: string;
  /** What the payment counts for toward the agreed price, in the order's currency. */
  countsAs?: { amount: string; currency: CurrencyCode; manual: boolean };
  usdAmount?: string;
  madAmount?: string;
  /** Bank rate against market rate: CNY difference and percentage. Only when both are known. */
  gap?: { cny: string; percent: string } | null;
  hasProof?: boolean;
  proofId?: string | null;
  proofMime?: ReceiptMime | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  deletedAt: string | null;
}

export interface PlanStage {
  id: string;
  position: number;
  type: PaymentType;
  channel: PaymentChannel;
  percent: string;
  /** Absent when the selling price is hidden (005). */
  amount?: string;
  dueBeforeStatus: OrderStatus | null;
  dueDate: string | null;
}

export interface DefaultPlanStage {
  type: PaymentType;
  channel: PaymentChannel;
  percent: string;
  dueBeforeStatus: OrderStatus | null;
}

export interface PaymentChannelSummary {
  channel: PaymentChannel;
  /** null = the translated default name. */
  name: string | null;
  // 005 FR-027: each figure is absent when the viewer may not see what it is computed from.
  planned?: string;
  received?: string;
  remaining?: string;
}

export interface PaymentSummary {
  currency: CurrencyCode;
  agreedPrice?: string;
  channels: PaymentChannelSummary[];
  plan: PlanStage[];
  received?: string;
  remaining?: string;
  overpaid?: string;
  percentPaid?: string | null;
  receivedTotals?: { cny: string; usd: string; mad: string };
  averageRates?: { currency: ForeignCurrency; rate: string }[];
  agreedRate?: string | null;
  remainingCny?: string | null;
  fxResultCny?: string | null;
  warnings?: { overpaid: string | null; bankOverInvoice: string | null };
}

export interface OrderPayments {
  items: Payment[];
  summary: PaymentSummary;
}

export interface PaymentsConfig {
  channels: Record<PaymentChannel, { name: string | null }>;
  banks: string[];
}

export interface PaymentSettings {
  channelNames: Record<PaymentChannel, string | null>;
  defaultPlan: DefaultPlanStage[];
  banks: string[];
}

export interface PaymentProofUpload {
  id: string;
  mime: ReceiptMime;
  size: number;
}
