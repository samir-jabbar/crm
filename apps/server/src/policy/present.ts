import {
  formatAmount,
  formatPercent,
  formatRate,
  paymentGap,
  lineTotalMinor,
  sumMinor,
  type AuditAction,
  type AuditEntryItem,
  type CurrencyCode,
  type Customer,
  type DefaultCategoryKey,
  type Expense,
  type ExpenseCategory,
  type ExpenseCategoryRef,
  type ExpenseTotals,
  type RateQuote,
  type RateSettings,
  type Reimbursement,
  type ToReimburse,
  type ReceiptMime,
  type ReceiptUpload,
  type MeResponse,
  type Order,
  type OrderFinancials,
  type Payment,
  type PaymentChannel,
  type PaymentsConfig,
  type PaymentSettings,
  type PaymentSummary,
  type PlanStage,
  type OrderItem,
  type OrderListItem,
  type OrderNote,
  type SessionItem,
  type SettingsResponse,
  type SignInHistoryItem,
  type Supplier,
  type RoleTemplate,
  type TemplateRef,
  type UserDetail,
  type UserListItem,
  basicOrdersOnly,
  figureVisible,
  isHidden,
  isPurchaseExpense,
  type Access,
  type Figure,
  type HiddenGroup,
} from '@hanjing/shared';
import type {
  AuditEntryRow,
  CompanySettingsRow,
  CurrencyRow,
  CustomerRow,
  ExpenseCategoryRow,
  ExpenseRow,
  FileRow,
  OrderItemRow,
  PaymentRow,
  RoleTemplateRow,
  OrderNoteRow,
  OrderRow,
  SessionRow,
  SignInAttemptRow,
  SupplierRow,
  UserRow,
} from '../db/schema';
import type { OrderFinancialsRaw } from '../orders/financials';
import type { UserDetailRow, UserListRow } from '../users/query';
import { accessEnded, parsePermissions } from './access';
import { accessOf } from './authorize';
import type { PlanStageView } from '../payments/plan';
import type { PaymentFigures } from '../payments/sums';

/**
 * Single place where API response bodies are built (R12). Every response passes through
 * `applyFieldRules`, which is where feature 005 hides restricted fields and derived values (D6).
 */
export interface PresentCtx {
  viewer: UserRow;
}

type Resource =
  | 'me'
  | 'session'
  | 'signInAttempt'
  | 'auditEntry'
  | 'settings'
  | 'customer'
  | 'supplier'
  | 'order'
  | 'orderItem'
  | 'orderNote'
  | 'expense'
  | 'expenseTotals'
  | 'expenseCategory'
  | 'receipt'
  | 'reimbursement'
  | 'rateQuote'
  | 'rateSettings'
  | 'payment'
  | 'paymentSummary'
  | 'planStage'
  | 'paymentsConfig'
  | 'paymentSettings'
  | 'user'
  | 'roleTemplate';

/**
 * Fields that restricted users may not see (ROADMAP D6). Feature 005 decides per user which of these are hidden;
 * derived values (totals, differences) are listed with their inputs so hiding a price also hides what reveals it.
 */
export const SENSITIVE_FIELDS = {
  order: ['agreedPrice', 'budgetCny', 'itemsTotal', 'priceDifference', 'agreedRate', 'financials'],
  orderItem: ['unitPrice', 'lineTotal', 'supplier'],
  expense: ['amount', 'rate', 'cnyAmount'],
  expenseTotals: ['grand', 'unpaid', 'byCategory', 'byAdvancedBy'],
  reimbursement: ['toReimburse'],
  payment: [
    'amount',
    'rates',
    'bankConversion',
    'marketRate',
    'cnyAmount',
    'countsAs',
    'usdAmount',
    'madAmount',
    'gap',
  ],
  paymentSummary: [
    'agreedPrice',
    'channels',
    'plan',
    'received',
    'remaining',
    'overpaid',
    'percentPaid',
    'receivedTotals',
    'averageRates',
    'agreedRate',
    'remainingCny',
    'fxResultCny',
    'warnings',
  ],
  planStage: ['amount'],
} as const satisfies Partial<Record<Resource, readonly string[]>>;

/**
 * 005 FR-025: the top-level fields each hidden group removes, per resource. Nested values and derived figures are
 * removed by the presenters themselves through `figure()` (D6 inheritance, research R4).
 */
export const HIDDEN_FIELDS: Record<HiddenGroup, Partial<Record<Resource, readonly string[]>>> = {
  sellingPrice: {
    order: ['agreedPrice', 'agreedRate', 'budgetCny', 'itemsTotal', 'priceDifference'],
    orderItem: ['unitPrice', 'lineTotal'],
    paymentSummary: ['agreedPrice', 'agreedRate'],
  },
  // Purchase lines themselves are handled per row in presentExpense (the only data-dependent rule).
  supplierPrices: { expenseTotals: ['byAdvancedBy'], reimbursement: ['toReimburse', 'total'] },
  supplierIdentity: { orderItem: ['supplier'] },
  customerContacts: { customer: ['phone', 'email', 'notes'] },
  paymentAmounts: {
    payment: ['amount', 'rates', 'marketRate', 'cnyAmount', 'countsAs', 'usdAmount', 'madAmount', 'gap', 'hasProof', 'proofId', 'proofMime'],
  },
  // The bank's name inside a payment's conversion is removed in presentPayment.
  bankDetails: {},
};

const accessIn = (ctx: PresentCtx): Access => accessOf(ctx.viewer);

/** Is this value group hidden from the viewer? */
export const hides = (ctx: PresentCtx, group: HiddenGroup): boolean => isHidden(accessIn(ctx), group);

/** May the viewer see this derived figure? (FR-027) */
export const figure = (ctx: PresentCtx, name: Figure): boolean => figureVisible(accessIn(ctx), name);

/** Remove the derived figures the viewer may not see (D6): `figures` maps a key to the figure it holds. */
function omitFigures<T extends object>(
  body: T,
  ctx: PresentCtx,
  figures: Partial<Record<keyof T & string, Figure>>,
): T {
  const access = accessIn(ctx);
  if (access.owner) return body;
  const map = figures as Record<string, Figure | undefined>;
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => {
      const name = map[key];
      return name === undefined || figureVisible(access, name);
    }),
  ) as T;
}

/** FR-010: an order seen only through an order-bound module shows who and what, never money or details. */
function basicOrder(order: {
  id: string;
  number: string;
  title: string;
  customerId: string;
  customerName: string;
  status: OrderRow['status'];
  createdAt: number;
  deletedAt: number | null;
}) {
  return {
    id: order.id,
    number: order.number,
    title: order.title,
    customer: { id: order.customerId, name: order.customerName },
    status: order.status,
    createdAt: iso(order.createdAt),
    deletedAt: isoOrNull(order.deletedAt),
  };
}

/** Fields hidden from a viewer, per resource. The Owner sees everything. */
function hiddenFields(resource: Resource, ctx: PresentCtx): ReadonlySet<string> {
  const access = accessIn(ctx);
  if (access.owner) return new Set();
  return new Set(access.hidden.flatMap((group) => HIDDEN_FIELDS[group][resource] ?? []));
}

/** Hidden keys are omitted, never sent as null: null already means "not set" (research R4). */
function applyFieldRules<T extends object>(resource: Resource, body: T, ctx: PresentCtx): T {
  const hidden = hiddenFields(resource, ctx);
  if (hidden.size === 0) return body;
  return Object.fromEntries(Object.entries(body).filter(([key]) => !hidden.has(key))) as T;
}

const iso = (ms: number) => new Date(ms).toISOString();

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function presentMe(
  user: UserRow,
  sessionId: string,
  settings: CompanySettingsRow,
  ctx: PresentCtx,
): MeResponse {
  return applyFieldRules(
    'me',
    {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        language: user.language,
        mustChangePassword: user.mustChangePassword,
      },
      access: (() => {
        const access = accessOf(user);
        return {
          owner: access.owner,
          modules: access.modules,
          hidden: access.hidden,
          orderScope: access.orderScope,
          ownEntriesOnly: access.ownEntriesOnly,
          accessEndsOn: user.accessEndsOn,
          basicOrdersOnly: basicOrdersOnly(access),
        };
      })(),
      company: { name: settings.companyName },
      session: { id: sessionId, idleTimeoutMinutes: settings.sessionIdleTimeoutMinutes },
    },
    ctx,
  );
}

export function presentSession(session: SessionRow, currentSessionId: string, ctx: PresentCtx): SessionItem {
  return applyFieldRules(
    'session',
    {
      id: session.id,
      deviceLabel: session.deviceLabel,
      ip: session.ip,
      location: session.location,
      createdAt: iso(session.createdAt),
      lastActiveAt: iso(session.lastActiveAt),
      current: session.id === currentSessionId,
    },
    ctx,
  );
}

export function presentSignInAttempt(row: SignInAttemptRow, ctx: PresentCtx): SignInHistoryItem {
  return applyFieldRules(
    'signInAttempt',
    {
      id: row.id,
      occurredAt: iso(row.occurredAt),
      outcome: row.outcome,
      reason: row.reason,
      deviceLabel: row.deviceLabel,
      ip: row.ip,
      location: row.location,
    },
    ctx,
  );
}

export function presentAuditEntry(row: AuditEntryRow, ctx: PresentCtx): AuditEntryItem {
  return applyFieldRules(
    'auditEntry',
    {
      id: row.id,
      occurredAt: iso(row.occurredAt),
      actor: { id: row.actorUserId, label: row.actorLabel },
      action: row.action as AuditAction,
      target: { type: row.targetType, id: row.targetId },
      ip: row.ip,
      deviceLabel: row.deviceLabel,
      before: parseJsonObject(row.beforeJson),
      after: parseJsonObject(row.afterJson),
    },
    ctx,
  );
}

export function presentSettings(
  settings: CompanySettingsRow,
  currencyRows: CurrencyRow[],
  nextOrderNumber: string,
  ctx: PresentCtx,
): SettingsResponse {
  return applyFieldRules(
    'settings',
    {
      companyName: settings.companyName,
      baseCurrency: 'CNY',
      currencies: currencyRows.map((c) => ({
        code: c.code as CurrencyCode,
        symbol: c.symbol,
        minorUnits: c.minorUnits,
      })),
      // 005 FR-011: security settings are the Owner's alone.
      ...(ctx.viewer.role === 'owner'
        ? {
            sessionIdleTimeoutMinutes: settings.sessionIdleTimeoutMinutes,
            registrationOpen: settings.registrationOpen,
          }
        : {}),
      orderNumberPrefix: settings.orderNumberPrefix,
      nextOrderNumber,
    },
    ctx,
  );
}

// ── 002: customers, suppliers, orders ──────────────────────────────────────

const isoOrNull = (ms: number | null) => (ms === null ? null : iso(ms));

export function presentCustomer(row: CustomerRow & { orderCount: number }, ctx: PresentCtx): Customer {
  return applyFieldRules(
    'customer',
    {
      id: row.id,
      name: row.name,
      company: row.company,
      city: row.city,
      country: row.country,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      orderCount: row.orderCount,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      deletedAt: isoOrNull(row.deletedAt),
    },
    ctx,
  );
}

export function presentSupplier(row: SupplierRow & { orderCount: number }, ctx: PresentCtx): Supplier {
  return applyFieldRules(
    'supplier',
    {
      id: row.id,
      name: row.name,
      company: row.company,
      contactPerson: row.contactPerson,
      phone: row.phone,
      wechat: row.wechat,
      email: row.email,
      city: row.city,
      country: row.country,
      notes: row.notes,
      orderCount: row.orderCount,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      deletedAt: isoOrNull(row.deletedAt),
    },
    ctx,
  );
}

export function presentOrderListItem(
  row: OrderRow & { customerName: string },
  ctx: PresentCtx,
): OrderListItem {
  // FR-010: the basic view carries only who and what; screens show detail only to users with Orders View.
  if (basicOrdersOnly(accessIn(ctx))) return basicOrder(row) as OrderListItem;
  return applyFieldRules(
    'order',
    {
      id: row.id,
      number: row.number,
      title: row.title,
      customer: { id: row.customerId, name: row.customerName },
      status: row.status,
      agreedPrice: formatAmount(row.agreedPriceMinor),
      currency: row.currency,
      createdAt: iso(row.createdAt),
      deletedAt: isoOrNull(row.deletedAt),
    },
    ctx,
  );
}

export interface OrderView {
  order: OrderRow & { customerName: string };
  items: (OrderItemRow & { supplierName: string | null })[];
  /** 003: derived CNY figures (orders/financials.ts). */
  financials: OrderFinancialsRaw;
}

export function presentOrderItem(item: OrderView['items'][number], ctx: PresentCtx): OrderItem {
  return applyFieldRules(
    'orderItem',
    {
      id: item.id,
      position: item.position,
      productName: item.productName,
      brandModel: item.brandModel,
      year: item.year,
      quantity: item.quantity,
      unitPrice: formatAmount(item.unitPriceMinor),
      lineTotal: formatAmount(lineTotalMinor(item.quantity, item.unitPriceMinor)),
      hsCode: item.hsCode,
      specs: item.specs,
      supplier: item.supplierId ? { id: item.supplierId, name: item.supplierName ?? '' } : null,
    },
    ctx,
  );
}

export function presentOrder(view: OrderView, ctx: PresentCtx): Order {
  const { order, items } = view;
  if (basicOrdersOnly(accessIn(ctx))) return basicOrder(order) as Order;
  const itemsTotal = sumMinor(items.map((i) => lineTotalMinor(i.quantity, i.unitPriceMinor)));
  return applyFieldRules(
    'order',
    {
      ...presentOrderListItem(order, ctx),
      deliveryCity: order.deliveryCity,
      incoterm: order.incoterm,
      destinationPort: order.destinationPort,
      expectedDeliveryDate: order.expectedDeliveryDate,
      budgetCny: order.budgetCnyMinor === null ? null : formatAmount(order.budgetCnyMinor),
      items: items.map((i) => presentOrderItem(i, ctx)),
      itemsTotal: formatAmount(itemsTotal),
      priceDifference: formatAmount(order.agreedPriceMinor - itemsTotal),
      agreedRate: order.agreedRateMicro === null ? null : formatRate(order.agreedRateMicro),
      financials: presentFinancials(view.financials, ctx),
      updatedAt: iso(order.updatedAt),
    },
    ctx,
  );
}

function presentFinancials(f: OrderFinancialsRaw, ctx: PresentCtx): OrderFinancials {
  const money = (v: bigint | null) => (v === null ? null : formatAmount(v));
  return omitFigures<OrderFinancials>(
    {
      agreedPriceCny: money(f.agreedPriceCny),
      expensesTotal: formatAmount(f.expensesTotal),
      unpaid: formatAmount(f.unpaid),
      profit: money(f.profit),
      marginPercent: f.marginPercent,
      budgetUsedPercent: f.budgetUsedPercent,
      profitUnavailableReason: f.profitUnavailableReason,
      received: formatAmount(f.received),
      remaining: formatAmount(f.remaining),
      overpaid: formatAmount(f.overpaid),
      percentPaid: f.percentPaid,
      receivedCny: formatAmount(f.receivedCny),
      remainingCny: money(f.remainingCny),
      fxResultCny: money(f.fxResultCny),
    },
    ctx,
    {
      agreedPriceCny: 'agreedPriceCny',
      expensesTotal: 'expensesTotal',
      unpaid: 'unpaid',
      profit: 'profit',
      marginPercent: 'marginPercent',
      profitUnavailableReason: 'profit',
      budgetUsedPercent: 'budgetUsedPercent',
      received: 'received',
      remaining: 'remaining',
      overpaid: 'overpaid',
      percentPaid: 'percentPaid',
      receivedCny: 'receivedCny',
      remainingCny: 'remainingCny',
      fxResultCny: 'fxResultCny',
    },
  );
}

export function presentOrderNote(row: OrderNoteRow & { authorLabel: string }, ctx: PresentCtx): OrderNote {
  return applyFieldRules(
    'orderNote',
    {
      id: row.id,
      body: row.body,
      author: { id: row.authorUserId, label: row.authorLabel },
      createdAt: iso(row.createdAt),
    },
    ctx,
  );
}

// ── 003: expenses ───────────────────────────────────────────────────────────

/** An expense with what is shown next to it (see expenses/query.ts). */
export type ExpenseView = ExpenseRow & {
  categoryKey: string | null;
  categoryName: string | null;
  supplierName: string | null;
  receiptMime: ReceiptMime | null;
  createdByLabel: string | null;
  updatedByLabel: string | null;
  orderNumber: string;
  orderTitle: string;
};

/** Totals as exact bigints (minor units); formatted only here. */
export interface ExpenseTotalsRaw {
  grand: bigint;
  unpaid: bigint;
  byCategory: { category: { id: string; key: string | null; name: string | null }; total: bigint; hasPurchase: boolean }[];
  byAdvancedBy: { name: string; total: bigint; toReimburse: bigint }[];
}

const categoryRef = (c: { id: string; key: string | null; name: string | null }): ExpenseCategoryRef => ({
  id: c.id,
  key: c.key as DefaultCategoryKey | null,
  name: c.name,
});

/** FR-025: what a purchase line loses when supplier prices are hidden (its receipt shows the price too). */
const PURCHASE_FIELDS = new Set(['amount', 'rate', 'cnyAmount', 'hasReceipt', 'receiptId', 'receiptMime']);

export function presentExpense(view: ExpenseView, ctx: PresentCtx): Expense {
  const hiddenPurchase = hides(ctx, 'supplierPrices') && isPurchaseExpense(view);
  const hiddenSupplier = hides(ctx, 'supplierIdentity') && view.paidToSupplierId !== null;
  const body = {
      id: view.id,
      orderId: view.orderId,
      name: view.name,
      category: categoryRef({ id: view.categoryId, key: view.categoryKey, name: view.categoryName }),
      amount: formatAmount(view.amountMinor),
      currency: view.currency,
      rate: formatRate(view.rateMicro),
      rateSource: view.rateSource,
      cnyAmount: formatAmount(view.cnyMinor),
      expenseDate: view.expenseDate,
      paidTo: view.paidToSupplierId
        ? { supplier: { id: view.paidToSupplierId, name: view.supplierName ?? '' } }
        : view.paidToName
          ? { name: view.paidToName }
          : null,
      paymentMethod: view.paymentMethod,
      advancedBy: view.advancedBy,
      reimbursed: view.reimbursed,
      status: view.status,
      dueDate: view.dueDate,
      hasReceipt: view.receiptFileId !== null,
      receiptId: view.receiptFileId,
      receiptMime: view.receiptMime,
      notes: view.notes,
      createdAt: iso(view.createdAt),
      createdBy: view.createdByLabel,
      updatedAt: iso(view.updatedAt),
      updatedBy: view.updatedByLabel,
      deletedAt: view.deletedAt === null ? null : iso(view.deletedAt),
  };
  const kept = Object.fromEntries(
    Object.entries(body).filter(([key]) => !(hiddenPurchase && PURCHASE_FIELDS.has(key)) && !(hiddenSupplier && key === 'paidTo')),
  ) as unknown as Expense;
  return applyFieldRules('expense', kept, ctx);
}

/**
 * Totals of the expenses listed (the order's, or the viewer's own entries). With supplier prices hidden, every
 * total that includes a purchase is removed (D6): the grand and unpaid totals and the categories holding one.
 */
export function presentExpenseTotals(totals: ExpenseTotalsRaw, ctx: PresentCtx): ExpenseTotals {
  const purchasesHidden = hides(ctx, 'supplierPrices');
  const body = {
      grand: formatAmount(totals.grand),
      unpaid: formatAmount(totals.unpaid),
      byCategory: totals.byCategory
        .filter((c) => !(purchasesHidden && c.hasPurchase))
        .map((c) => ({
          category: categoryRef(c.category),
          total: formatAmount(c.total),
        })),
      byAdvancedBy: totals.byAdvancedBy.map((p) => ({
        name: p.name,
        total: formatAmount(p.total),
        toReimburse: formatAmount(p.toReimburse),
      })),
  };
  if (purchasesHidden) {
    const { grand: _grand, unpaid: _unpaid, ...rest } = body;
    return applyFieldRules('expenseTotals', rest as ExpenseTotals, ctx);
  }
  return applyFieldRules('expenseTotals', body, ctx);
}

export function presentCategory(row: ExpenseCategoryRow, ctx: PresentCtx): ExpenseCategory {
  return applyFieldRules(
    'expenseCategory',
    { ...categoryRef(row), position: row.position, hidden: row.hidden },
    ctx,
  );
}

export function presentReceiptUpload(row: FileRow, ctx: PresentCtx): ReceiptUpload {
  return applyFieldRules('receipt', { id: row.id, mime: row.mime, size: row.sizeBytes }, ctx);
}

// ── 003: exchange rates (built in rates/service.ts; the key never leaves the server) ──

export function presentRateQuote(quote: RateQuote, ctx: PresentCtx): RateQuote {
  return applyFieldRules('rateQuote', quote, ctx);
}

export function presentRateSettings(settings: RateSettings, ctx: PresentCtx): RateSettings {
  return applyFieldRules('rateSettings', settings, ctx);
}

export function presentReimbursement(
  row: { name: string; toReimburse: bigint; expenseCount: number },
  ctx: PresentCtx,
): Reimbursement {
  return applyFieldRules(
    'reimbursement',
    { name: row.name, toReimburse: formatAmount(row.toReimburse), expenseCount: row.expenseCount },
    ctx,
  );
}

export function presentToReimburse(
  row: { person: string; total: bigint; items: ExpenseView[] },
  ctx: PresentCtx,
): ToReimburse {
  return applyFieldRules(
    'reimbursement',
    {
      person: row.person,
      total: formatAmount(row.total),
      items: row.items.map((view) => ({
        ...presentExpense(view, ctx),
        order: { id: view.orderId, number: view.orderNumber, title: view.orderTitle },
      })),
    },
    ctx,
  );
}

// ── 004: payments ───────────────────────────────────────────────────────────

/** A payment with what is shown next to it (see payments/query.ts). */
export type PaymentView = PaymentRow & {
  orderCurrency: CurrencyCode;
  orderNumber: string;
  orderTitle: string;
  proofMime: ReceiptMime | null;
  createdByLabel: string | null;
  updatedByLabel: string | null;
};

/** The Payments tab summary as exact bigints; formatted only here. */
export interface PaymentSummaryRaw {
  currency: CurrencyCode;
  agreedMinor: bigint;
  channels: {
    channel: PaymentChannel;
    name: string | null;
    planned: bigint;
    received: bigint;
    remaining: bigint;
  }[];
  plan: PlanStageView[];
  figures: PaymentFigures;
  receivedUsd: bigint;
  receivedMad: bigint;
  agreedRateMicro: number | null;
  warnings: { overpaid: bigint | null; bankOverInvoice: bigint | null };
}

const moneyOrNull = (v: bigint | null) => (v === null ? null : formatAmount(v));

export function presentPayment(view: PaymentView, ctx: PresentCtx): Payment {
  const gap = paymentGap(view.amountMinor, view.bankRateMicro, view.marketRateMicro);
  return applyFieldRules(
    'payment',
    {
      id: view.id,
      orderId: view.orderId,
      channel: view.channel,
      type: view.type,
      amount: formatAmount(view.amountMinor),
      currency: view.currency,
      paymentDate: view.paymentDate,
      reference: view.reference,
      rates: {
        USD: formatRate(view.usdCnyMicro),
        MAD: formatRate(view.madCnyMicro),
        EUR: view.eurCnyMicro === null ? null : formatRate(view.eurCnyMicro),
      },
      rateSource: view.rateSource,
      ratesFetchedAt: isoOrNull(view.ratesFetchedAt),
      marketRate:
        view.marketRateMicro === null || view.marketRateDate === null
          ? null
          : { rate: formatRate(view.marketRateMicro), rateDate: view.marketRateDate },
      bank:
        view.bankRateMicro === null ||
        view.bankName === null ||
        view.bankRateType === null ||
        view.bankRateAt === null
          ? null
          : {
              // FR-025: the bank's rate is a payment rate; the bank's name is a bank detail.
              ...(hides(ctx, 'paymentAmounts') ? {} : { rate: formatRate(view.bankRateMicro) }),
              ...(hides(ctx, 'bankDetails') ? {} : { name: view.bankName }),
              rateType: view.bankRateType,
              at: iso(view.bankRateAt),
            },
      cnyAmount: formatAmount(view.cnyMinor),
      countsAs: {
        amount: formatAmount(view.orderMinor),
        currency: view.orderCurrency,
        manual: view.orderMinorManual,
      },
      usdAmount: formatAmount(view.usdMinor),
      madAmount: formatAmount(view.madMinor),
      gap: gap === null ? null : { cny: formatAmount(gap.cny), percent: gap.percent },
      hasProof: view.proofFileId !== null,
      proofId: view.proofFileId,
      proofMime: view.proofMime,
      notes: view.notes,
      createdAt: iso(view.createdAt),
      createdBy: view.createdByLabel,
      updatedAt: iso(view.updatedAt),
      updatedBy: view.updatedByLabel,
      deletedAt: isoOrNull(view.deletedAt),
    },
    ctx,
  );
}

export function presentPlanStage(stage: PlanStageView, ctx: PresentCtx): PlanStage {
  return applyFieldRules(
    'planStage',
    omitFigures<PlanStage>(
      {
        id: stage.id,
        position: stage.position,
        type: stage.type,
        channel: stage.channel,
        percent: formatPercent(stage.percentBp),
        amount: formatAmount(stage.amountMinor),
        dueBeforeStatus: stage.dueBeforeStatus,
        dueDate: stage.dueDate,
      },
      ctx,
      { amount: 'stageAmount' },
    ),
    ctx,
  );
}

export function presentPaymentSummary(summary: PaymentSummaryRaw, ctx: PresentCtx): PaymentSummary {
  const { figures } = summary;
  return applyFieldRules(
    'paymentSummary',
    omitFigures<PaymentSummary>(
      {
        currency: summary.currency,
        agreedPrice: formatAmount(summary.agreedMinor),
        channels: summary.channels.map((c) =>
          omitFigures(
            {
              channel: c.channel,
              name: c.name,
              planned: formatAmount(c.planned),
              received: formatAmount(c.received),
              remaining: formatAmount(c.remaining),
            },
            ctx,
            { planned: 'channelPlanned', received: 'channelReceived', remaining: 'channelRemaining' },
          ),
        ),
        plan: summary.plan.map((s) => presentPlanStage(s, ctx)),
        received: formatAmount(figures.received),
        remaining: formatAmount(figures.remaining),
        overpaid: formatAmount(figures.overpaid),
        percentPaid: figures.percentPaid,
        receivedTotals: {
          cny: formatAmount(figures.receivedCny),
          usd: formatAmount(summary.receivedUsd),
          mad: formatAmount(summary.receivedMad),
        },
        averageRates: figures.averageRates.map((r) => ({
          currency: r.currency,
          rate: formatRate(r.rateMicro),
        })),
        agreedRate: summary.agreedRateMicro === null ? null : formatRate(summary.agreedRateMicro),
        remainingCny: moneyOrNull(figures.remainingCny),
        fxResultCny: moneyOrNull(figures.fxResultCny),
        warnings: {
          overpaid: moneyOrNull(summary.warnings.overpaid),
          bankOverInvoice: moneyOrNull(summary.warnings.bankOverInvoice),
        },
      },
      ctx,
      {
        received: 'received',
        remaining: 'remaining',
        overpaid: 'overpaid',
        percentPaid: 'percentPaid',
        receivedTotals: 'receivedTotals',
        averageRates: 'averageRates',
        remainingCny: 'remainingCny',
        fxResultCny: 'fxResultCny',
        warnings: 'warnings',
      },
    ),
    ctx,
  );
}

export function presentPaymentsConfig(config: PaymentsConfig, ctx: PresentCtx): PaymentsConfig {
  return applyFieldRules('paymentsConfig', config, ctx);
}

export function presentPaymentSettings(settings: PaymentSettings, ctx: PresentCtx): PaymentSettings {
  return applyFieldRules('paymentSettings', settings, ctx);
}

// ── 005: workers (Owner-only screens, so no field rules apply) ─────────────

const templateRef = (t: UserListRow['template']): TemplateRef | null =>
  t ? { id: t.id, defaultKey: t.defaultKey, name: t.name, deleted: t.deletedAt !== null } : null;

export function presentUserListItem(row: UserListRow, now: number, ctx: PresentCtx): UserListItem {
  const { user } = row;
  return applyFieldRules(
    'user',
    {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      language: user.language,
      status: user.status,
      accessEnded: user.status === 'active' && accessEnded(user, now),
      template: templateRef(row.template),
      adjusted: user.permissionsAdjusted,
      lastSignInAt: isoOrNull(row.lastSignInAt),
      registeredAt: iso(user.createdAt),
      registration:
        user.status === 'pending' && row.registration
          ? {
              deviceLabel: row.registration.deviceLabel,
              location: row.registration.location,
              at: iso(row.registration.createdAt),
            }
          : null,
    },
    ctx,
  );
}

export function presentUserDetail(row: UserDetailRow, now: number, ctx: PresentCtx): UserDetail {
  const { user } = row;
  return applyFieldRules(
    'user',
    {
      ...presentUserListItem(row, now, ctx),
      permissions: parsePermissions(user.permissions),
      orderScope: user.orderScope,
      customers: row.customers,
      ownEntriesOnly: user.ownEntriesOnly,
      accessEndsOn: user.accessEndsOn,
      assignedOrders: row.assignedOrders,
      mustChangePassword: user.mustChangePassword,
    },
    ctx,
  );
}

export function presentRoleTemplate(row: RoleTemplateRow, usedBy: number, ctx: PresentCtx): RoleTemplate {
  return applyFieldRules(
    'roleTemplate',
    {
      id: row.id,
      defaultKey: row.defaultKey,
      name: row.name,
      permissions: parsePermissions(row.permissions),
      orderScope: row.orderScope,
      ownEntriesOnly: row.ownEntriesOnly,
      usedBy,
    },
    ctx,
  );
}
