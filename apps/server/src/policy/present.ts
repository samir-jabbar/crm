import {
  formatAmount,
  lineTotalMinor,
  sumMinor,
  type AuditAction,
  type AuditEntryItem,
  type CurrencyCode,
  type Customer,
  type MeResponse,
  type Order,
  type OrderItem,
  type OrderListItem,
  type OrderNote,
  type SessionItem,
  type SettingsResponse,
  type SignInHistoryItem,
  type Supplier,
} from '@hanjing/shared';
import type {
  AuditEntryRow,
  CompanySettingsRow,
  CurrencyRow,
  CustomerRow,
  OrderItemRow,
  OrderNoteRow,
  OrderRow,
  SessionRow,
  SignInAttemptRow,
  SupplierRow,
  UserRow,
} from '../db/schema';

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
  | 'orderNote';

/**
 * Fields that restricted users may not see (ROADMAP D6). Feature 005 decides per user which of these are hidden;
 * derived values (totals, differences) are listed with their inputs so hiding a price also hides what reveals it.
 */
export const SENSITIVE_FIELDS = {
  order: ['agreedPrice', 'budgetCny', 'itemsTotal', 'priceDifference'],
  orderItem: ['unitPrice', 'lineTotal', 'supplier'],
} as const satisfies Partial<Record<Resource, readonly string[]>>;

/** Fields hidden from a viewer, per resource. The Owner sees everything; 001 has no other viewers yet. */
function hiddenFields(_resource: Resource, ctx: PresentCtx): ReadonlySet<string> {
  if (ctx.viewer.role === 'owner') return new Set();
  return new Set();
}

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
      },
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
      sessionIdleTimeoutMinutes: settings.sessionIdleTimeoutMinutes,
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

export function presentOrderListItem(row: OrderRow & { customerName: string }, ctx: PresentCtx): OrderListItem {
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
      updatedAt: iso(order.updatedAt),
    },
    ctx,
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
