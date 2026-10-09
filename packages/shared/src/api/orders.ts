import { z } from 'zod';
import { CURRENCY_CODES, INCOTERMS, ORDER_STATUSES, type CurrencyCode, type Incoterm, type OrderStatus } from '../enums';
import { amountSchema, booleanQuery, calendarDateSchema, idSchema, optionalText, rateSchema } from './common';
import { pageQuerySchema } from './signInHistory';

export const orderItemInputSchema = z.strictObject({
  /** Present for items that already exist (edit); absent for new lines. */
  id: idSchema.optional(),
  productName: z
    .string({ error: 'product_name_invalid' })
    .trim()
    .min(1, 'product_name_invalid')
    .max(160, 'product_name_invalid'),
  brandModel: optionalText(120),
  /** Upper bound (current year + 1) is checked on the server against its clock. */
  year: z
    .number({ error: 'year_invalid' })
    .int('year_invalid')
    .min(1950, 'year_invalid')
    .max(2100, 'year_invalid')
    .nullable()
    .optional(),
  quantity: z
    .number({ error: 'quantity_invalid' })
    .int('quantity_invalid')
    .min(1, 'quantity_invalid')
    .max(100_000, 'quantity_invalid'),
  unitPrice: amountSchema,
  hsCode: z
    .string({ error: 'hs_code_invalid' })
    .trim()
    .refine((v) => v === '' || /^[0-9.]{4,14}$/.test(v), 'hs_code_invalid')
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  specs: optionalText(4000),
  supplierId: idSchema.nullable().optional(),
});
export type OrderItemInput = z.input<typeof orderItemInputSchema>;

/** Create (POST) and full edit (PUT) share one shape (research R4). */
export const orderInputSchema = z
  .strictObject({
    title: z.string({ error: 'title_invalid' }).trim().min(1, 'title_invalid').max(160, 'title_invalid'),
    customerId: z.string({ error: 'customer_invalid' }).min(1, 'customer_invalid').max(64, 'customer_invalid'),
    deliveryCity: optionalText(80),
    status: z.enum(ORDER_STATUSES, { error: 'status_invalid' }).optional(),
    agreedPrice: amountSchema,
    currency: z.enum(CURRENCY_CODES, { error: 'currency_invalid' }),
    incoterm: z.enum(INCOTERMS, { error: 'incoterm_invalid' }).nullable().optional(),
    destinationPort: optionalText(80),
    expectedDeliveryDate: calendarDateSchema.nullable().optional(),
    budgetCny: amountSchema.nullable().optional(),
    /** 003 (D2): "1 unit of the order currency = X CNY" agreed at the deal. Required unless CNY, ignored for CNY. */
    agreedRate: rateSchema.nullable().optional(),
    items: z.array(orderItemInputSchema).max(200).default([]),
    /** 004 FR-022: required to set the status to Closed while money remains to collect. */
    confirmOutstanding: z.literal(true, { error: 'invalid_value' }).optional(),
  })
  .refine((v) => v.currency === 'CNY' || !!v.agreedRate, {
    message: 'rate_required',
    path: ['agreedRate'],
    // Reported together with any other field error, so the form highlights everything at once.
    when: (payload) => payload.issues.every((i) => !['currency', 'agreedRate'].includes(String(i.path?.[0]))),
  });
export type OrderInput = z.input<typeof orderInputSchema>;
export type ParsedOrderInput = z.output<typeof orderInputSchema>;

export const orderStatusRequestSchema = z.strictObject({
  status: z.enum(ORDER_STATUSES, { error: 'status_invalid' }),
  /** 004 FR-022: required to close an order while money remains to collect. */
  confirmOutstanding: z.literal(true, { error: 'invalid_value' }).optional(),
});

export const duplicateOrderRequestSchema = z.strictObject({
  titleSuffix: z.string().max(40).optional(),
});

export const createOrderNoteRequestSchema = z.strictObject({
  body: z.string({ error: 'note_invalid' }).trim().min(1, 'note_invalid').max(2000, 'note_invalid'),
});

export const ordersQuerySchema = pageQuerySchema.extend({
  q: z.string().max(100).optional(),
  /** Comma-separated status codes. */
  status: z
    .string()
    .max(300)
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const codes = v.split(',').map((s) => s.trim()).filter(Boolean);
      for (const code of codes) {
        if (!(ORDER_STATUSES as readonly string[]).includes(code)) {
          ctx.addIssue({ code: 'custom', message: 'status_invalid' });
          return z.NEVER;
        }
      }
      return codes as OrderStatus[];
    }),
  customerId: z.string().max(64).optional(),
  from: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid_value').optional(),
  to: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid_value').optional(),
  deleted: booleanQuery,
});
export type OrdersQuery = z.output<typeof ordersQuerySchema>;

export interface OrderListItem {
  id: string;
  number: string;
  title: string;
  customer: { id: string; name: string };
  status: OrderStatus;
  /** Absent when the selling price is hidden from the viewer (005 FR-025). */
  agreedPrice?: string;
  currency: CurrencyCode;
  createdAt: string;
  deletedAt: string | null;
}

export interface OrderItem {
  id: string;
  position: number;
  productName: string;
  brandModel: string | null;
  year: number | null;
  quantity: number;
  /** Absent when the selling price is hidden (005). */
  unitPrice?: string;
  lineTotal?: string;
  hsCode: string | null;
  specs: string | null;
  /** Absent when supplier identity is hidden (005). */
  supplier?: { id: string; name: string } | null;
}

export interface Order extends OrderListItem {
  deliveryCity: string | null;
  incoterm: Incoterm | null;
  destinationPort: string | null;
  expectedDeliveryDate: string | null;
  /** This and the next three are absent when the selling price is hidden (005 FR-025). */
  budgetCny?: string | null;
  items: OrderItem[];
  itemsTotal?: string;
  priceDifference?: string;
  /** 003: rate to CNY agreed at the deal (6 decimals); null for CNY orders and older orders not yet edited. */
  agreedRate?: string | null;
  financials: OrderFinancials;
  updatedAt: string;
}

/**
 * 003 FR-012 / 004 FR-016 – FR-020: derived on every read, never stored. Amounts are in CNY unless noted;
 * `received`, `remaining` and `overpaid` are in the order's currency. Profit follows D2 (004 research R5).
 */
export interface OrderFinancials {
  // 005 FR-027: each figure is absent when the viewer may not see every value it is computed from.
  agreedPriceCny?: string | null;
  expensesTotal?: string;
  unpaid?: string;
  profit?: string | null;
  marginPercent?: string | null;
  budgetUsedPercent?: string | null;
  profitUnavailableReason?: 'agreed_rate_missing' | null;
  received?: string;
  remaining?: string;
  overpaid?: string;
  percentPaid?: string | null;
  receivedCny?: string;
  remainingCny?: string | null;
  fxResultCny?: string | null;
}

export interface OrderNote {
  id: string;
  body: string;
  author: { id: string | null; label: string };
  createdAt: string;
}

export interface OrdersSummary {
  openByStatus: Partial<Record<OrderStatus, number>>;
  openTotal: number;
}
