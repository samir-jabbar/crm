import { formatAmount, formatRate, parseAmount, parseRate, type ErrorCode, type ParsedOrderInput } from '@hanjing/shared';
import { assignCreator } from '../users/assignments';
import { and, asc, eq, getTableColumns, inArray, isNotNull, isNull, notInArray } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import {
  companySettings,
  customers,
  orderItems,
  orders,
  payments,
  suppliers,
  type OrderItemRow,
  type OrderRow,
  type UserRow,
} from '../db/schema';
import type { Deps } from '../deps';
import { AppError } from '../lib/errors';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';
import type { OrderView } from '../policy/present';
import { restore, softDelete } from '../softDelete';
import { copyDefaultPlan, copyPlan } from '../payments/plan';
import { orderPaymentSums } from '../payments/sums';
import { orderFinancials } from './financials';
import { chinaYear, nextOrderNumber } from './numbering';

// ── Reading ────────────────────────────────────────────────────────────────

/** An order with its customer name and items (with supplier names), or undefined. */
export function loadOrderView(db: Executor, id: string, options: { deleted?: boolean } = {}): OrderView | undefined {
  const order = db
    .select({ ...getTableColumns(orders), customerName: customers.name })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.id, id), options.deleted ? isNotNull(orders.deletedAt) : isNull(orders.deletedAt)))
    .get();
  if (!order) return undefined;
  const items = db
    .select({ ...getTableColumns(orderItems), supplierName: suppliers.name })
    .from(orderItems)
    .leftJoin(suppliers, eq(orderItems.supplierId, suppliers.id))
    .where(eq(orderItems.orderId, id))
    .orderBy(asc(orderItems.position))
    .all();
  return { order, items, financials: orderFinancials(db, order) };
}

/** 003 (D2): stored in micro-units for non-CNY orders; CNY orders always use 1 and store null. */
function agreedRateMicro(input: Pick<ParsedOrderInput, 'currency' | 'agreedRate'>): number | null {
  return input.currency === 'CNY' || !input.agreedRate ? null : parseRate(input.agreedRate);
}

// ── Validation shared by create, edit and duplicate ────────────────────────

/** References and clock-dependent rules that zod cannot check (FR-008, FR-011). */
function checkReferences(tx: Executor, clock: Clock, input: ParsedOrderInput): void {
  const fields: Record<string, ErrorCode> = {};
  const customer = tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), isNull(customers.deletedAt)))
    .get();
  if (!customer) fields.customerId = 'customer_invalid';

  const supplierIds = [...new Set(input.items.map((i) => i.supplierId).filter((s): s is string => Boolean(s)))];
  const known = new Set(
    supplierIds.length === 0
      ? []
      : tx
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(and(inArray(suppliers.id, supplierIds), isNull(suppliers.deletedAt)))
          .all()
          .map((s) => s.id),
  );
  const maxYear = chinaYear(clock.now()) + 1;
  input.items.forEach((item, index) => {
    if (item.supplierId && !known.has(item.supplierId)) fields[`items.${index}.supplierId`] = 'supplier_invalid';
    if (item.year != null && item.year > maxYear) fields[`items.${index}.year`] = 'year_invalid';
  });
  if (Object.keys(fields).length > 0) throw new AppError(400, 'validation_failed', { fields });
}

function itemRow(orderId: string, item: ParsedOrderInput['items'][number], position: number, id = newId()): OrderItemRow {
  return {
    id,
    orderId,
    position,
    productName: item.productName,
    brandModel: item.brandModel ?? null,
    year: item.year ?? null,
    quantity: item.quantity,
    unitPriceMinor: parseAmount(item.unitPrice),
    hsCode: item.hsCode ?? null,
    specs: item.specs ?? null,
    supplierId: item.supplierId ?? null,
  };
}

function orderPrefix(tx: Executor): string {
  return tx.select({ prefix: companySettings.orderNumberPrefix }).from(companySettings).where(eq(companySettings.id, 1)).get()
    ?.prefix ?? 'HJ';
}

// ── Create (US1) ───────────────────────────────────────────────────────────

/**
 * FR-008/FR-009: create an order and its items with the next `HJ-YYYY-NNN` number.
 * The immediate transaction takes the write lock before the counter is read (research R2).
 */
export function createOrder(deps: Deps, input: ParsedOrderInput, actor: UserRow, ctx: RequestCtx): OrderView {
  const { db, clock } = deps;
  const orderId = db.transaction(
    (tx) => {
      checkReferences(tx, clock, input);
      const { number, year, seq } = nextOrderNumber(tx, clock, orderPrefix(tx));
      const now = clock.now();
      const id = newId();
      tx.insert(orders)
        .values({
          id,
          number,
          numberYear: year,
          numberSeq: seq,
          title: input.title,
          customerId: input.customerId,
          deliveryCity: input.deliveryCity ?? null,
          status: input.status ?? 'draft',
          agreedPriceMinor: parseAmount(input.agreedPrice),
          currency: input.currency,
          incoterm: input.incoterm ?? null,
          destinationPort: input.destinationPort ?? null,
          expectedDeliveryDate: input.expectedDeliveryDate ?? null,
          budgetCnyMinor: input.budgetCny ? parseAmount(input.budgetCny) : null,
          agreedRateMicro: agreedRateMicro(input),
          createdAt: now,
          updatedAt: now,
          createdBy: actor.id,
        })
        .run();
      if (input.items.length > 0) tx.insert(orderItems).values(input.items.map((item, i) => itemRow(id, item, i))).run();
      copyDefaultPlan(tx, id); // 004 FR-013
      assignCreator(tx, clock, actor, id); // 005 FR-020
      recordAudit(tx, clock, {
        actorUserId: actor.id,
        actorLabel: actor.username,
        action: 'record.created',
        targetType: 'order',
        targetId: id,
        ctx,
        after: {
          number,
          title: input.title,
          customerId: input.customerId,
          agreedPrice: formatAmount(parseAmount(input.agreedPrice)),
          currency: input.currency,
          agreedRate: input.currency === 'CNY' || !input.agreedRate ? null : formatRate(parseRate(input.agreedRate)),
          itemCount: input.items.length,
        },
      });
      return id;
    },
    { behavior: 'immediate' },
  );
  return loadOrderView(db, orderId)!;
}

// ── Edit and status (US2) ──────────────────────────────────────────────────

type ItemSnapshot = Omit<OrderItemRow, 'id' | 'orderId' | 'position' | 'unitPriceMinor'> & { unitPrice: string };

function itemSnapshot(item: OrderItemRow): ItemSnapshot {
  return {
    productName: item.productName,
    brandModel: item.brandModel,
    year: item.year,
    quantity: item.quantity,
    unitPrice: formatAmount(item.unitPriceMinor),
    hsCode: item.hsCode,
    specs: item.specs,
    supplierId: item.supplierId,
  };
}

/** The audited view of an order: editable fields plus compact item lines (research R4). */
function orderSnapshot(order: OrderView['order'], items: OrderItemRow[]) {
  return {
    title: order.title,
    customerId: order.customerId,
    deliveryCity: order.deliveryCity,
    status: order.status,
    agreedPrice: formatAmount(order.agreedPriceMinor),
    currency: order.currency,
    incoterm: order.incoterm,
    destinationPort: order.destinationPort,
    expectedDeliveryDate: order.expectedDeliveryDate,
    budgetCny: order.budgetCnyMinor === null ? null : formatAmount(order.budgetCnyMinor),
    agreedRate: order.agreedRateMicro === null ? null : formatRate(order.agreedRateMicro),
    items: items.map(itemSnapshot),
  };
}

function notFoundOrder(): never {
  throw new AppError(404, 'not_found');
}

/**
 * FR-013: full replace of the editable fields and item lines (research R4). Items keep their id when the
 * client sends one that belongs to this order; others are inserted, missing ones removed. One audit entry,
 * none at all when nothing changed. The number never changes.
 */
export function updateOrder(deps: Deps, id: string, input: ParsedOrderInput, actor: UserRow, ctx: RequestCtx): OrderView {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const before = loadOrderView(tx, id);
    if (!before) notFoundOrder();
    checkReferences(tx, clock, input);

    const existingIds = new Set(before.items.map((i) => i.id));
    const nextItems = input.items.map((item, position) =>
      itemRow(id, item, position, item.id && existingIds.has(item.id) ? item.id : newId()),
    );
    const nextOrder = {
      ...before.order,
      title: input.title,
      customerId: input.customerId,
      deliveryCity: input.deliveryCity ?? null,
      status: input.status ?? before.order.status,
      agreedPriceMinor: parseAmount(input.agreedPrice),
      currency: input.currency,
      incoterm: input.incoterm ?? null,
      destinationPort: input.destinationPort ?? null,
      expectedDeliveryDate: input.expectedDeliveryDate ?? null,
      budgetCnyMinor: input.budgetCny ? parseAmount(input.budgetCny) : null,
      agreedRateMicro: agreedRateMicro(input),
    };
    const beforeSnap = orderSnapshot(before.order, before.items);
    const afterSnap = orderSnapshot(nextOrder, nextItems);
    if (JSON.stringify(beforeSnap) === JSON.stringify(afterSnap)) return;

    // 004 FR-023: remaining amounts are tracked in the order's currency, so it is fixed once payments exist.
    if (nextOrder.currency !== before.order.currency) {
      const paid = tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.orderId, id), isNull(payments.deletedAt)))
        .get();
      if (paid) throw new AppError(400, 'validation_failed', { fields: { currency: 'currency_locked' } });
    }
    const closing = checkClosing(tx, before.order, nextOrder.status, nextOrder.agreedPriceMinor, input.confirmOutstanding === true);

    tx.update(orders)
      .set({
        title: nextOrder.title,
        customerId: nextOrder.customerId,
        deliveryCity: nextOrder.deliveryCity,
        status: nextOrder.status,
        agreedPriceMinor: nextOrder.agreedPriceMinor,
        currency: nextOrder.currency,
        incoterm: nextOrder.incoterm,
        destinationPort: nextOrder.destinationPort,
        expectedDeliveryDate: nextOrder.expectedDeliveryDate,
        budgetCnyMinor: nextOrder.budgetCnyMinor,
        agreedRateMicro: nextOrder.agreedRateMicro,
        updatedAt: clock.now(),
      })
      .where(eq(orders.id, id))
      .run();

    const keep = nextItems.map((i) => i.id).filter((itemId) => existingIds.has(itemId));
    tx.delete(orderItems)
      .where(and(eq(orderItems.orderId, id), keep.length > 0 ? notInArray(orderItems.id, keep) : undefined))
      .run();
    for (const item of nextItems) {
      if (existingIds.has(item.id)) tx.update(orderItems).set(item).where(eq(orderItems.id, item.id)).run();
      else tx.insert(orderItems).values(item).run();
    }

    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'record.updated',
      targetType: 'order',
      targetId: id,
      ctx,
      before: beforeSnap,
      after: { ...afterSnap, ...closing },
    });
  });
  return loadOrderView(db, id)!;
}

/**
 * 004 FR-022 (brief §6): an order cannot be set to Closed while money remains to collect, unless the user confirms.
 * Returns what the audit entry should add ("133000.00 USD" still owed), or nothing when no confirmation was needed.
 */
function checkClosing(
  tx: Executor,
  order: Pick<OrderRow, 'id' | 'status' | 'currency'>,
  nextStatus: OrderRow['status'],
  agreedPriceMinor: number,
  confirmOutstanding: boolean,
): { outstanding: string } | null {
  if (nextStatus !== 'closed' || order.status === 'closed') return null;
  const received = orderPaymentSums(tx, order.id).received;
  const agreed = BigInt(agreedPriceMinor);
  if (received >= agreed) return null;
  const remaining = formatAmount(agreed - received);
  if (!confirmOutstanding) throw new AppError(409, 'balance_outstanding', { remaining, currency: order.currency });
  return { outstanding: `${remaining} ${order.currency}` };
}

/** Quick status change from the order header (FR-010), with the 004 closing rule. */
export function setOrderStatus(
  deps: Deps,
  id: string,
  status: OrderView['order']['status'],
  actor: UserRow,
  ctx: RequestCtx,
  options: { confirmOutstanding?: boolean } = {},
): OrderView {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const before = loadOrderView(tx, id);
    if (!before) notFoundOrder();
    if (before.order.status === status) return;
    const closing = checkClosing(tx, before.order, status, before.order.agreedPriceMinor, options.confirmOutstanding === true);
    tx.update(orders).set({ status, updatedAt: clock.now() }).where(eq(orders.id, id)).run();
    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'record.updated',
      targetType: 'order',
      targetId: id,
      ctx,
      before: { status: before.order.status },
      after: { status, ...closing },
    });
  });
  return loadOrderView(db, id)!;
}

// ── Duplicate (US4) ────────────────────────────────────────────────────────

/**
 * FR-016: copy an order into a new Draft with the next number. Copies the deal (customer, city, price, currency,
 * agreed rate, Incoterm, port, budget) and all item lines; never notes, the expected delivery date or history.
 */
export function duplicateOrder(deps: Deps, id: string, titleSuffix: string, actor: UserRow, ctx: RequestCtx): OrderView {
  const { db, clock } = deps;
  const copyId = db.transaction(
    (tx) => {
      const source = loadOrderView(tx, id);
      if (!source) notFoundOrder();
      const { number, year, seq } = nextOrderNumber(tx, clock, orderPrefix(tx));
      const now = clock.now();
      const newOrderId = newId();
      const title = `${source.order.title}${titleSuffix}`.slice(0, 160);
      tx.insert(orders)
        .values({
          id: newOrderId,
          number,
          numberYear: year,
          numberSeq: seq,
          title,
          customerId: source.order.customerId,
          deliveryCity: source.order.deliveryCity,
          status: 'draft',
          agreedPriceMinor: source.order.agreedPriceMinor,
          currency: source.order.currency,
          incoterm: source.order.incoterm,
          destinationPort: source.order.destinationPort,
          expectedDeliveryDate: null,
          budgetCnyMinor: source.order.budgetCnyMinor,
          agreedRateMicro: source.order.agreedRateMicro,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.id,
        })
        .run();
      if (source.items.length > 0) {
        tx.insert(orderItems)
          .values(source.items.map(({ supplierName: _supplierName, ...item }) => ({ ...item, id: newId(), orderId: newOrderId })))
          .run();
      }
      copyPlan(tx, source.order.id, newOrderId); // 004: the plan is part of the deal (payments are not copied)
      assignCreator(tx, clock, actor, newOrderId); // 005 FR-020
      recordAudit(tx, clock, {
        actorUserId: actor.id,
        actorLabel: actor.username,
        action: 'record.created',
        targetType: 'order',
        targetId: newOrderId,
        ctx,
        after: {
          number,
          title,
          customerId: source.order.customerId,
          agreedPrice: formatAmount(source.order.agreedPriceMinor),
          currency: source.order.currency,
          itemCount: source.items.length,
          duplicatedFrom: source.order.number,
        },
      });
      return newOrderId;
    },
    { behavior: 'immediate' },
  );
  return loadOrderView(db, copyId)!;
}

// ── Delete and restore (US5) ───────────────────────────────────────────────

/** FR-019: recoverable deletion; the number stays taken (FR-009). */
export function deleteOrder(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    if (!softDelete(tx, clock, orders, 'order', id, actor, ctx)) notFoundOrder();
  });
}

/** FR-020: restore with all data; refused while the order's customer is deleted. */
export function restoreOrder(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): OrderView {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const deleted = loadOrderView(tx, id, { deleted: true });
    if (!deleted) notFoundOrder();
    const customer = tx.select({ deletedAt: customers.deletedAt }).from(customers).where(eq(customers.id, deleted.order.customerId)).get();
    if (customer?.deletedAt !== null) throw new AppError(409, 'customer_deleted');
    restore(tx, clock, orders, 'order', id, actor, ctx);
  });
  return loadOrderView(db, id)!;
}
