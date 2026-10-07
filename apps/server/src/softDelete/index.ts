import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { softDeleteColumns } from '../db/schema/columns';
import type { RequestCtx } from '../lib/requestContext';

/**
 * Recoverable deletion (FR-024), used by business records from feature 002 on:
 * spread `softDeleteColumns()` into a table, filter reads with `notDeleted(table)`,
 * and delete/restore only through `softDelete` / `restore`, which always write an audit entry.
 */
export { softDeleteColumns };

export type SoftDeletableTable = SQLiteTable & {
  id: SQLiteColumn;
  deletedAt: SQLiteColumn;
  deletedBy: SQLiteColumn;
};

export function notDeleted(table: SoftDeletableTable): SQL {
  return isNull(table.deletedAt);
}

interface Actor {
  id: string;
  username: string;
}

/** Hide a record from normal views. Returns false if it does not exist or is already deleted. */
export function softDelete(
  tx: Executor,
  clock: Clock,
  table: SoftDeletableTable,
  targetType: string,
  id: string,
  actor: Actor,
  ctx: RequestCtx,
): boolean {
  const result = tx
    .update(table)
    .set({ deletedAt: clock.now(), deletedBy: actor.id } as never)
    .where(and(eq(table.id, id), isNull(table.deletedAt)))
    .run();
  if (result.changes === 0) return false;
  recordAudit(tx, clock, {
    actorUserId: actor.id,
    actorLabel: actor.username,
    action: 'record.deleted',
    targetType,
    targetId: id,
    ctx,
  });
  return true;
}

/** Bring a soft-deleted record back. Returns false if it is not deleted. */
export function restore(
  tx: Executor,
  clock: Clock,
  table: SoftDeletableTable,
  targetType: string,
  id: string,
  actor: Actor,
  ctx: RequestCtx,
): boolean {
  const result = tx
    .update(table)
    .set({ deletedAt: null, deletedBy: null } as never)
    .where(and(eq(table.id, id), isNotNull(table.deletedAt)))
    .run();
  if (result.changes === 0) return false;
  recordAudit(tx, clock, {
    actorUserId: actor.id,
    actorLabel: actor.username,
    action: 'record.restored',
    targetType,
    targetId: id,
    ctx,
  });
  return true;
}
