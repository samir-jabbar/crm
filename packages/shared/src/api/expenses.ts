import { z } from 'zod';
import {
  CURRENCY_CODES,
  EXPENSE_STATUSES,
  PAYMENT_METHODS,
  RATE_SOURCES,
  type CurrencyCode,
  type DefaultCategoryKey,
  type ExpenseStatus,
  type PaymentMethod,
  type RateSource,
  type ReceiptMime,
} from '../enums';
import { amountSchema, booleanQuery, calendarDateSchema, idSchema, optionalText, rateSchema } from './common';

const expenseFields = {
  name: z.string({ error: 'name_invalid' }).trim().min(1, 'name_invalid').max(160, 'name_invalid'),
  categoryId: z.string({ error: 'category_invalid' }).min(1, 'category_invalid').max(64, 'category_invalid'),
  amount: amountSchema.refine((v) => /[1-9]/.test(v), 'amount_invalid'),
  currency: z.enum(CURRENCY_CODES, { error: 'currency_invalid' }),
  /** Required unless the currency is CNY, where it is forced to 1. */
  rate: rateSchema.nullable().optional(),
  rateSource: z.enum(RATE_SOURCES, { error: 'invalid_value' }).default('manual'),
  expenseDate: calendarDateSchema,
  /** "Paid to" is a supplier from the address book or a typed name, never both. */
  paidToSupplierId: z.string({ error: 'supplier_invalid' }).max(64, 'supplier_invalid').nullable().optional(),
  paidToName: optionalText(120),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: 'invalid_value' }).default('cash'),
  advancedBy: optionalText(80),
  reimbursed: z.boolean({ error: 'invalid_value' }).default(false),
  status: z.enum(EXPENSE_STATUSES, { error: 'invalid_value' }).default('paid'),
  dueDate: calendarDateSchema.nullable().optional(),
  /** An upload from POST /api/receipts; null removes the receipt on edit. */
  receiptId: idSchema.nullable().optional(),
  notes: optionalText(2000),
};

const fieldIsValid = (issues: readonly { path?: readonly PropertyKey[] }[], ...fields: string[]) =>
  issues.every((issue) => !fields.includes(String(issue.path?.[0])));

/** Create (POST) and full edit (PUT) share one shape. */
export const expenseInputSchema = z
  .strictObject(expenseFields)
  // `when`: report these together with any other field error, so the form highlights everything at once.
  .refine((v) => v.currency === 'CNY' || !!v.rate, {
    message: 'rate_required',
    path: ['rate'],
    when: (payload) => fieldIsValid(payload.issues, 'currency', 'rate'),
  })
  .refine((v) => !(v.paidToSupplierId && v.paidToName), {
    message: 'invalid_value',
    path: ['paidToName'],
    when: (payload) => fieldIsValid(payload.issues, 'paidToSupplierId', 'paidToName'),
  });
export type ExpenseInput = z.input<typeof expenseInputSchema>;
export type ParsedExpenseInput = z.output<typeof expenseInputSchema>;

export const expenseStatusPatchSchema = z
  .strictObject({
    status: z.enum(EXPENSE_STATUSES, { error: 'invalid_value' }).optional(),
    reimbursed: z.boolean({ error: 'invalid_value' }).optional(),
  })
  .refine((v) => v.status !== undefined || v.reimbursed !== undefined, 'invalid_value');
export type ExpenseStatusPatch = z.input<typeof expenseStatusPatchSchema>;

export const orderExpensesQuerySchema = z.object({ deleted: booleanQuery });
export const advancedByQuerySchema = z.object({ q: z.string().max(80).optional() });
export const toReimburseQuerySchema = z.object({
  person: z.string({ error: 'name_invalid' }).trim().min(1, 'name_invalid').max(80, 'name_invalid'),
});
export const categoriesQuerySchema = z.object({ includeHidden: booleanQuery });

const categoryName = z.string({ error: 'name_invalid' }).trim().min(1, 'name_invalid').max(60, 'name_invalid');
export const createCategorySchema = z.strictObject({ name: categoryName });
export const patchCategorySchema = z
  .strictObject({ name: categoryName.optional(), hidden: z.boolean({ error: 'invalid_value' }).optional() })
  .refine((v) => v.name !== undefined || v.hidden !== undefined, 'invalid_value');
export type CreateCategoryRequest = z.input<typeof createCategorySchema>;
export type PatchCategoryRequest = z.input<typeof patchCategorySchema>;

// ── Responses ───────────────────────────────────────────────────────────────

export interface ExpenseCategory {
  id: string;
  /** Default categories have a key (label from translations); user-added ones have null. */
  key: DefaultCategoryKey | null;
  /** Typed or renamed label; wins over the translation. */
  name: string | null;
  position: number;
  hidden: boolean;
}

export type ExpenseCategoryRef = Pick<ExpenseCategory, 'id' | 'key' | 'name'>;

export type ExpensePaidTo = { supplier: { id: string; name: string } } | { name: string } | null;

export interface Expense {
  id: string;
  orderId: string;
  name: string;
  category: ExpenseCategoryRef;
  /** Amount, rate, CNY amount and receipt: absent on a supplier purchase when supplier prices are hidden (005). */
  amount?: string;
  currency: CurrencyCode;
  rate?: string;
  rateSource: RateSource;
  cnyAmount?: string;
  expenseDate: string;
  /** Absent when it names a supplier and supplier identity is hidden (005). */
  paidTo?: ExpensePaidTo;
  paymentMethod: PaymentMethod;
  advancedBy: string | null;
  reimbursed: boolean;
  status: ExpenseStatus;
  dueDate: string | null;
  hasReceipt?: boolean;
  /** Sent back unchanged on edit to keep the receipt; null removes it. */
  receiptId?: string | null;
  receiptMime?: ReceiptMime | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  deletedAt: string | null;
}

/** 005: totals that include a hidden supplier purchase are absent; so are the categories holding one. */
export interface ExpenseTotals {
  grand?: string;
  unpaid?: string;
  byCategory: { category: ExpenseCategoryRef; total: string }[];
  byAdvancedBy?: { name: string; total: string; toReimburse: string }[];
}

export interface OrderExpenses {
  items: Expense[];
  totals: ExpenseTotals;
  /** 005 FR-028: the viewer sees only their own entries; the totals cover those entries only. */
  yourEntries?: boolean;
}

export interface ReceiptUpload {
  id: string;
  mime: ReceiptMime;
  size: number;
}

export interface Reimbursement {
  name: string;
  /** Absent when supplier prices are hidden (it may include a purchase). */
  toReimburse?: string;
  expenseCount: number;
}

export interface ToReimburseExpense extends Expense {
  order: { id: string; number: string; title: string };
}

export interface ToReimburse {
  person: string;
  total?: string;
  items: ToReimburseExpense[];
}
