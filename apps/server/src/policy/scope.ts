import type { Access } from '@hanjing/shared';
import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Executor } from '../db/client';
import { customers, expenses, orderAssignments, orderItems, orders, suppliers, userCustomers, type payments } from '../db/schema';
import { AppError, notFound } from '../lib/errors';

/**
 * Data scope as SQL (005 research R3). Every query that reaches orders, the records inside them, customers or
 * suppliers adds these predicates, so out-of-scope rows are never loaded and paging, totals and search stay right.
 * `undefined` means "no restriction" and can be passed straight to `and(...)`.
 */
const unrestricted = (access: Access) => access.owner || access.orderScope === 'all';

/** Rows whose order (given by `orderIdColumn`) is in the viewer's scope. */
export function orderVisible(access: Access, orderIdColumn: SQLiteColumn = orders.id): SQL | undefined {
  if (unrestricted(access)) return undefined;
  if (access.orderScope === 'assigned') {
    return sql`${orderIdColumn} in (select ${orderAssignments.orderId} from ${orderAssignments} where ${orderAssignments.userId} = ${access.userId})`;
  }
  return sql`${orderIdColumn} in (select ${orders.id} from ${orders} where ${orders.customerId} in (select ${userCustomers.customerId} from ${userCustomers} where ${userCustomers.userId} = ${access.userId}))`;
}

/** "Own entries only" (FR-021): the rows the viewer recorded themselves. */
export function ownEntries(access: Access, createdByColumn: SQLiteColumn): SQL | undefined {
  if (access.owner || !access.ownEntriesOnly) return undefined;
  return eq(createdByColumn, access.userId);
}

/** Customers linked to an order in scope, or created by the viewer (FR-022). */
export function customerVisible(access: Access, customerIdColumn: SQLiteColumn = customers.id): SQL | undefined {
  if (unrestricted(access)) return undefined;
  return or(
    sql`${customerIdColumn} in (select ${orders.customerId} from ${orders} where ${orderVisible(access)})`,
    sql`${customerIdColumn} in (select ${customers.id} from ${customers} where ${customers.createdBy} = ${access.userId})`,
  );
}

/** Suppliers of an item or an expense of an order in scope, or created by the viewer (FR-022). */
export function supplierVisible(access: Access, supplierIdColumn: SQLiteColumn = suppliers.id): SQL | undefined {
  if (unrestricted(access)) return undefined;
  return or(
    sql`${supplierIdColumn} in (select ${orderItems.supplierId} from ${orderItems} where ${orderVisible(access, orderItems.orderId)})`,
    sql`${supplierIdColumn} in (select ${expenses.paidToSupplierId} from ${expenses} where ${orderVisible(access, expenses.orderId)})`,
    sql`${supplierIdColumn} in (select ${suppliers.id} from ${suppliers} where ${suppliers.createdBy} = ${access.userId})`,
  );
}

// ── Single records (FR-013): out of scope answers exactly like a record that does not exist ──

const exists = (query: { get(): unknown }): boolean => query.get() !== undefined;

/** An order (deleted or not) the viewer may reach, or 404. */
export function requireOrderInScope(db: Executor, access: Access, orderId: string): void {
  if (unrestricted(access)) return;
  if (!exists(db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), orderVisible(access))))) throw notFound();
}

/** An expense or payment whose order is in scope and, with "own entries only", that the viewer recorded. */
export function requireEntryInScope(db: Executor, access: Access, table: typeof expenses | typeof payments, id: string): void {
  if (access.owner) return;
  const found = db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), orderVisible(access, table.orderId), ownEntries(access, table.createdBy)));
  if (!exists(found)) throw notFound();
}

export function requireCustomerInScope(db: Executor, access: Access, customerId: string): void {
  if (unrestricted(access)) return;
  if (!exists(db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, customerId), customerVisible(access))))) throw notFound();
}

export function requireSupplierInScope(db: Executor, access: Access, supplierId: string): void {
  if (unrestricted(access)) return;
  if (!exists(db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, supplierId), supplierVisible(access))))) throw notFound();
}

const within = (check: () => void): boolean => {
  try {
    check();
    return true;
  } catch {
    return false;
  }
};

/**
 * FR-022: a customer or supplier a worker refers to (on an order, an item or an expense) must be one they can see;
 * any other id is treated like an unknown one, so nothing out of scope can be attached and then displayed.
 */
export function requireReferencesInScope(
  db: Executor,
  access: Access,
  refs: { customerId?: string | null; supplierIds?: (string | null | undefined)[] },
): void {
  if (unrestricted(access)) return;
  if (refs.customerId && !within(() => requireCustomerInScope(db, access, refs.customerId!))) {
    throw new AppError(400, 'validation_failed', { fields: { customerId: 'customer_invalid' } });
  }
  for (const supplierId of refs.supplierIds ?? []) {
    if (supplierId && !within(() => requireSupplierInScope(db, access, supplierId))) {
      throw new AppError(400, 'validation_failed', { fields: { supplierId: 'supplier_invalid' } });
    }
  }
}
