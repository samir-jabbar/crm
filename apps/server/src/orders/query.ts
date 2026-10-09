import { likePattern, OPEN_ORDER_STATUSES, type OrdersQuery, type OrderStatus } from '@hanjing/shared';
import { and, count, desc, eq, getTableColumns, gte, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { customers, orders, type OrderRow } from '../db/schema';
import { decodeCursor, olderThan, toPage } from '../lib/pagination';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type OrderListRow = OrderRow & { customerName: string };

const listColumns = { ...getTableColumns(orders), customerName: customers.name };

/** Normalized substring search over number, title, customer name, and item product/model (research R3). */
function searchCondition(q: string): SQL {
  const pattern = likePattern(q);
  return sql`(
    hj_norm(${orders.number}) like ${pattern} escape '\\'
    or hj_norm(${orders.title}) like ${pattern} escape '\\'
    or hj_norm(${customers.name}) like ${pattern} escape '\\'
    or exists (select 1 from order_items i where i.order_id = ${orders.id}
      and (hj_norm(i.product_name) like ${pattern} escape '\\' or hj_norm(i.brand_model) like ${pattern} escape '\\'))
  )`;
}

/** FR-014: newest first, filtered and searched, keyset-paginated. `scope` limits it to the viewer's orders (005). */
export function listOrders(
  db: Executor,
  query: OrdersQuery,
  scope?: SQL,
): { items: OrderListRow[]; nextCursor: string | null } {
  const conditions: (SQL | undefined)[] = [query.deleted ? isNotNull(orders.deletedAt) : isNull(orders.deletedAt), scope];
  if (query.status?.length) conditions.push(inArray(orders.status, query.status));
  if (query.customerId) conditions.push(eq(orders.customerId, query.customerId));
  if (query.from) conditions.push(gte(orders.createdAt, Date.parse(query.from)));
  if (query.to) {
    const to = DATE_ONLY.test(query.to) ? Date.parse(query.to) + DAY_MS - 1 : Date.parse(query.to);
    conditions.push(lte(orders.createdAt, to));
  }
  if (query.q?.trim()) conditions.push(searchCondition(query.q));
  conditions.push(olderThan(orders.createdAt, orders.id, decodeCursor(query.cursor)));

  const rows = db
    .select(listColumns)
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(query.limit + 1)
    .all();
  return toPage(rows, query.limit, (r) => r.createdAt);
}

/** Non-deleted orders of a customer, newest first (FR-004). */
export function ordersOfCustomer(db: Executor, customerId: string, scope?: SQL): OrderListRow[] {
  return db
    .select(listColumns)
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.customerId, customerId), isNull(orders.deletedAt), scope))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .all();
}

/** Non-deleted orders with at least one item from a supplier (FR-007). */
export function ordersOfSupplier(db: Executor, supplierId: string, scope?: SQL): OrderListRow[] {
  return db
    .select(listColumns)
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(
      and(
        isNull(orders.deletedAt),
        sql`exists (select 1 from order_items i where i.order_id = ${orders.id} and i.supplier_id = ${supplierId})`,
        scope,
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .all();
}

/** FR-026: open (not delivered/closed/cancelled), non-deleted orders per status. */
export function ordersSummary(db: Executor, scope?: SQL): { openByStatus: Partial<Record<OrderStatus, number>>; openTotal: number } {
  const rows = db
    .select({ status: orders.status, n: count() })
    .from(orders)
    .where(and(isNull(orders.deletedAt), inArray(orders.status, OPEN_ORDER_STATUSES), scope))
    .groupBy(orders.status)
    .all();
  const openByStatus: Partial<Record<OrderStatus, number>> = {};
  let openTotal = 0;
  for (const row of rows) {
    openByStatus[row.status] = row.n;
    openTotal += row.n;
  }
  return { openByStatus, openTotal };
}
