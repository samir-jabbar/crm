import { asc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { expenseCategories, type ExpenseCategoryRow, type UserRow } from '../db/schema';
import { notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';

/** Categories in display order; hidden ones only when asked (settings, or an expense that already uses one). */
export function listCategories(db: Executor, options: { includeHidden?: boolean } = {}): ExpenseCategoryRow[] {
  return db
    .select()
    .from(expenseCategories)
    .where(options.includeHidden ? undefined : eq(expenseCategories.hidden, false))
    .orderBy(asc(expenseCategories.position), asc(expenseCategories.id))
    .all();
}

export function getCategory(db: Executor, id: string): ExpenseCategoryRow | undefined {
  return db.select().from(expenseCategories).where(eq(expenseCategories.id, id)).get();
}

/** FR-022: a user category, at the end of the list, with its name exactly as typed (any script). */
export function createCategory(tx: Executor, clock: Clock, name: string, actor: UserRow, ctx: RequestCtx): ExpenseCategoryRow {
  const last = tx.select({ max: sql<number | null>`max(${expenseCategories.position})` }).from(expenseCategories).get();
  const now = clock.now();
  const row = tx
    .insert(expenseCategories)
    .values({ id: newId(), key: null, name, position: (last?.max ?? -1) + 1, hidden: false, createdAt: now, updatedAt: now })
    .returning()
    .get();
  recordAudit(tx, clock, {
    actorUserId: actor.id,
    actorLabel: actor.username,
    action: 'record.created',
    targetType: 'expense_category',
    targetId: row.id,
    ctx,
    after: { name: row.name, position: row.position },
  });
  return row;
}

/** Rename (a renamed default shows the typed name in every language) and/or hide/show. Never deleted. */
export function updateCategory(
  tx: Executor,
  clock: Clock,
  id: string,
  patch: { name?: string; hidden?: boolean },
  actor: UserRow,
  ctx: RequestCtx,
): ExpenseCategoryRow {
  const current = getCategory(tx, id);
  if (!current) throw notFound();
  const next = { name: patch.name ?? current.name, hidden: patch.hidden ?? current.hidden };
  if (next.name === current.name && next.hidden === current.hidden) return current;
  const row = tx
    .update(expenseCategories)
    .set({ ...next, updatedAt: clock.now() })
    .where(eq(expenseCategories.id, id))
    .returning()
    .get();
  recordAudit(tx, clock, {
    actorUserId: actor.id,
    actorLabel: actor.username,
    action: 'record.updated',
    targetType: 'expense_category',
    targetId: id,
    ctx,
    before: { name: current.name, hidden: current.hidden },
    after: next,
  });
  return row;
}
