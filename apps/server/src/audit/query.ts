import type { AuditAction, AuditQuery } from '@hanjing/shared';
import { and, asc, desc, eq, gte, isNotNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { auditEntries, type AuditEntryRow } from '../db/schema';
import { decodeCursor, olderThan, toPage } from '../lib/pagination';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `from` is inclusive; a date-only `to` covers that whole (UTC) day. Clients send local-day bounds as datetimes. */
function bounds(from?: string, to?: string): SQL[] {
  const conditions: SQL[] = [];
  if (from) conditions.push(gte(auditEntries.occurredAt, Date.parse(from)));
  if (to) conditions.push(lte(auditEntries.occurredAt, DATE_ONLY.test(to) ? Date.parse(to) + DAY_MS - 1 : Date.parse(to)));
  return conditions;
}

/** FR-023: newest first, filtered by person, action (exact or "prefix.") and date range; keyset paginated. */
export function listAudit(db: Executor, query: AuditQuery): { items: AuditEntryRow[]; nextCursor: string | null } {
  const conditions: (SQL | undefined)[] = [...bounds(query.from, query.to)];
  if (query.actorId) conditions.push(eq(auditEntries.actorUserId, query.actorId));
  if (query.action) {
    conditions.push(
      query.action.endsWith('.')
        ? sql`substr(${auditEntries.action}, 1, ${query.action.length}) = ${query.action}`
        : eq(auditEntries.action, query.action as AuditAction),
    );
  }
  conditions.push(olderThan(auditEntries.occurredAt, auditEntries.id, decodeCursor(query.cursor)));

  const rows = db
    .select()
    .from(auditEntries)
    .where(and(...conditions))
    .orderBy(desc(auditEntries.occurredAt), desc(auditEntries.id))
    .limit(query.limit + 1)
    .all();
  return toPage(rows, query.limit, (r) => r.occurredAt);
}

/** People who appear in the log (for the person filter). */
export function listAuditActors(db: Executor): { id: string; label: string }[] {
  return db
    .selectDistinct({ id: sql<string>`${auditEntries.actorUserId}`, label: auditEntries.actorLabel })
    .from(auditEntries)
    .where(isNotNull(auditEntries.actorUserId))
    .orderBy(asc(auditEntries.actorLabel))
    .all();
}
