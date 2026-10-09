import { likePattern, normalizeForSearch, PURCHASE_CATEGORY_ID } from '@hanjing/shared';
import { and, asc, desc, eq, getTableColumns, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Executor } from '../db/client';
import { expenseCategories, expenses, files, orders, suppliers, users } from '../db/schema';
import { notFound } from '../lib/errors';
import type { ExpenseTotalsRaw, ExpenseView } from '../policy/present';

const creator = alias(users, 'creator');
const updater = alias(users, 'updater');

/**
 * Expenses with what the API shows next to them: category, supplier, receipt type, who created and changed them,
 * and their order. Expenses of a deleted order are never returned (they disappear with it, spec edge cases).
 */
export function selectExpenseViews(db: Executor, where: SQL | undefined) {
  return db
    .select({
      ...getTableColumns(expenses),
      categoryKey: expenseCategories.key,
      categoryName: expenseCategories.name,
      supplierName: suppliers.name,
      receiptMime: files.mime,
      createdByLabel: creator.username,
      updatedByLabel: updater.username,
      orderNumber: orders.number,
      orderTitle: orders.title,
    })
    .from(expenses)
    .innerJoin(orders, and(eq(expenses.orderId, orders.id), isNull(orders.deletedAt)))
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(suppliers, eq(expenses.paidToSupplierId, suppliers.id))
    .leftJoin(files, eq(expenses.receiptFileId, files.id))
    .leftJoin(creator, eq(expenses.createdBy, creator.id))
    .leftJoin(updater, eq(expenses.updatedBy, updater.id))
    .where(where);
}

export function getExpenseView(db: Executor, id: string, options: { deleted?: boolean } = {}): ExpenseView | undefined {
  return selectExpenseViews(
    db,
    and(eq(expenses.id, id), options.deleted ? isNotNull(expenses.deletedAt) : isNull(expenses.deletedAt)),
  ).get();
}

export function requireOpenOrder(db: Executor, orderId: string): void {
  const order = db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))
    .get();
  if (!order) throw notFound();
}

/** Sums as text so they stay exact past 2^53 (converted to bigint by the caller). */
const exactSum = (value: SQL | typeof expenses.cnyMinor) => sql<string>`cast(coalesce(sum(${value}), 0) as text)`;

/**
 * FR-010: the order's expenses (newest date first, then newest entry) and its CNY totals. Totals always cover the
 * non-deleted expenses, also when listing the deleted ones, and add the stored line amounts (research R2).
 */
export function listOrderExpenses(
  db: Executor,
  orderId: string,
  options: { deleted?: boolean; filter?: SQL } = {},
): { items: ExpenseView[]; totals: ExpenseTotalsRaw } {
  requireOpenOrder(db, orderId);
  const items = selectExpenseViews(
    db,
    and(eq(expenses.orderId, orderId), options.deleted ? isNotNull(expenses.deletedAt) : isNull(expenses.deletedAt), options.filter),
  )
    .orderBy(desc(expenses.expenseDate), desc(expenses.id))
    .all();
  return { items, totals: orderExpenseTotals(db, orderId, options.filter) };
}

/** Total and unpaid CNY of an order's non-deleted expenses, exact. */
export function orderExpenseSums(db: Executor, orderId: string, filter?: SQL): { grand: bigint; unpaid: bigint } {
  const sums = db
    .select({
      grand: exactSum(expenses.cnyMinor),
      unpaid: exactSum(sql`case when ${expenses.status} = 'to_pay' then ${expenses.cnyMinor} end`),
    })
    .from(expenses)
    .where(and(eq(expenses.orderId, orderId), isNull(expenses.deletedAt), filter))
    .get()!;
  return { grand: BigInt(sums.grand), unpaid: BigInt(sums.unpaid) };
}

/** `filter` (005): only some of the order's expenses, e.g. the viewer's own entries (FR-028). */
export function orderExpenseTotals(db: Executor, orderId: string, filter?: SQL): ExpenseTotalsRaw {
  const live = and(eq(expenses.orderId, orderId), isNull(expenses.deletedAt), filter);
  const sums = orderExpenseSums(db, orderId, filter);
  const byCategory = db
    .select({
      id: expenseCategories.id,
      key: expenseCategories.key,
      name: expenseCategories.name,
      total: exactSum(expenses.cnyMinor),
      // 005 FR-025: does the category hold a supplier purchase (equipment purchase, or paid to a supplier)?
      purchases: sql<number>`sum(case when ${expenses.categoryId} = ${PURCHASE_CATEGORY_ID} or ${expenses.paidToSupplierId} is not null then 1 else 0 end)`,
    })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(live)
    .groupBy(expenseCategories.id)
    .orderBy(asc(expenseCategories.position), asc(expenseCategories.id))
    .all();
  return {
    ...sums,
    byCategory: byCategory.map(({ total, purchases, ...category }) => ({ category, total: BigInt(total), hasPurchase: purchases > 0 })),
    byAdvancedBy: orderPersonTotals(db, orderId, filter),
  };
}

// ── Reimbursements (US5, research R9) ──────────────────────────────────────

interface PersonRow {
  advancedBy: string | null;
  cnyMinor: number;
  reimbursed: boolean;
  createdAt: number;
  id: string;
}

interface PersonGroup {
  key: string;
  /** The spelling of the person's most recent expense. */
  name: string;
  total: bigint;
  toReimburse: bigint;
  openCount: number;
  newest: [number, string];
}

/** One person whatever the spelling ("Ahmed", "ahmed ", "Ahmed" with an accent): grouped by `hj_norm`. */
function groupByPerson(rows: PersonRow[]): PersonGroup[] {
  const groups = new Map<string, PersonGroup>();
  for (const row of rows) {
    if (!row.advancedBy) continue;
    const key = normalizeForSearch(row.advancedBy);
    const group = groups.get(key) ?? { key, name: row.advancedBy, total: 0n, toReimburse: 0n, openCount: 0, newest: [row.createdAt, row.id] };
    group.total += BigInt(row.cnyMinor);
    if (!row.reimbursed) {
      group.toReimburse += BigInt(row.cnyMinor);
      group.openCount += 1;
    }
    if (row.createdAt > group.newest[0] || (row.createdAt === group.newest[0] && row.id > group.newest[1])) {
      group.newest = [row.createdAt, row.id];
      group.name = row.advancedBy;
    }
    groups.set(key, group);
  }
  return [...groups.values()];
}

const byAmountThenName = (amount: (g: PersonGroup) => bigint) => (a: PersonGroup, b: PersonGroup) =>
  amount(a) === amount(b) ? a.name.localeCompare(b.name) : amount(b) > amount(a) ? 1 : -1;

const personColumns = {
  advancedBy: expenses.advancedBy,
  cnyMinor: expenses.cnyMinor,
  reimbursed: expenses.reimbursed,
  createdAt: expenses.createdAt,
  id: expenses.id,
};

/** Per-person totals on one order: everything they advanced, and what is still to reimburse (FR-010). */
export function orderPersonTotals(db: Executor, orderId: string, filter?: SQL): ExpenseTotalsRaw['byAdvancedBy'] {
  const rows = db
    .select(personColumns)
    .from(expenses)
    .where(and(eq(expenses.orderId, orderId), isNull(expenses.deletedAt), isNotNull(expenses.advancedBy), filter))
    .all();
  return groupByPerson(rows)
    .sort(byAmountThenName((g) => g.total))
    .map((g) => ({ name: g.name, total: g.total, toReimburse: g.toReimburse }));
}

/** Open (not reimbursed) advances of live expenses on live orders: what the dashboard shows (FR-020). */
function openAdvances(db: Executor, where?: SQL) {
  return db
    .select(personColumns)
    .from(expenses)
    .innerJoin(orders, and(eq(expenses.orderId, orders.id), isNull(orders.deletedAt)))
    .where(and(isNull(expenses.deletedAt), isNotNull(expenses.advancedBy), eq(expenses.reimbursed, false), where))
    .all();
}

/** `filter` (005): the expenses the viewer may see. */
export function reimbursements(db: Executor, filter?: SQL): { name: string; toReimburse: bigint; expenseCount: number }[] {
  return groupByPerson(openAdvances(db, filter))
    .filter((g) => g.toReimburse > 0n)
    .sort(byAmountThenName((g) => g.toReimburse))
    .map((g) => ({ name: g.name, toReimburse: g.toReimburse, expenseCount: g.openCount }));
}

/** The open expenses behind one line of the reimbursements block, matched on the normalized name. */
export function toReimburse(db: Executor, person: string, filter?: SQL): { person: string; total: bigint; items: ExpenseView[] } {
  const key = normalizeForSearch(person);
  const items = selectExpenseViews(
    db,
    and(
      isNull(expenses.deletedAt),
      eq(expenses.reimbursed, false),
      sql`hj_norm(${expenses.advancedBy}) = ${key}`,
      filter,
    ),
  )
    .orderBy(desc(expenses.expenseDate), desc(expenses.id))
    .all();
  const [group] = groupByPerson(items);
  return { person: group?.name ?? person.trim(), total: group?.toReimburse ?? 0n, items };
}

/** "Advanced by" suggestions (FR-019): names already used, once each, most recent spelling first, up to 10. */
export function advancedByNames(db: Executor, q: string | undefined, filter?: SQL): string[] {
  const rows = db
    .select({ advancedBy: expenses.advancedBy, createdAt: expenses.createdAt, id: expenses.id })
    .from(expenses)
    .where(
      and(
        isNull(expenses.deletedAt),
        isNotNull(expenses.advancedBy),
        q?.trim() ? sql`hj_norm(${expenses.advancedBy}) like ${likePattern(q)} escape '\\'` : undefined,
        filter,
      ),
    )
    .orderBy(desc(expenses.createdAt), desc(expenses.id))
    .all();
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of rows) {
    const key = normalizeForSearch(row.advancedBy!);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(row.advancedBy!);
    if (names.length === 10) break;
  }
  return names;
}
