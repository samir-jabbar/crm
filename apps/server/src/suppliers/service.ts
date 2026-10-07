import { likePattern, type AddressBookQuery } from '@hanjing/shared';
import type { createSupplierRequestSchema, updateSupplierRequestSchema } from '@hanjing/shared';
import { and, eq, getTableColumns, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { suppliers, type SupplierRow, type UserRow } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { decodeOffset, encodeOffset } from '../lib/offsetCursor';
import type { RequestCtx } from '../lib/requestContext';
import { restore, softDelete } from '../softDelete';

type CreateInput = z.output<typeof createSupplierRequestSchema>;
type UpdateInput = z.output<typeof updateSupplierRequestSchema>;
export type SupplierWithCount = SupplierRow & { orderCount: number };

/** Orders (non-deleted) with at least one item from this supplier. */
// Table-qualified on purpose: inside a subquery, an unqualified "id" would be ambiguous.
const orderCount = sql<number>`(select count(distinct o.id) from orders o join order_items i on i.order_id = o.id
  where i.supplier_id = "suppliers"."id" and o.deleted_at is null)`;
const withCount = { ...getTableColumns(suppliers), orderCount };

const AUDITED = ['name', 'company', 'contactPerson', 'phone', 'wechat', 'email', 'city', 'country', 'notes'] as const;
const snapshot = (row: SupplierRow) => Object.fromEntries(AUDITED.map((k) => [k, row[k]]));

export function getSupplier(db: Executor, id: string, options: { deleted?: boolean } = {}): SupplierWithCount | undefined {
  return db
    .select(withCount)
    .from(suppliers)
    .where(and(eq(suppliers.id, id), options.deleted ? isNotNull(suppliers.deletedAt) : isNull(suppliers.deletedAt)))
    .get();
}

export function createSupplier(tx: Executor, clock: Clock, input: CreateInput, actor: UserRow, ctx: RequestCtx): SupplierWithCount {
  const now = clock.now();
  const row = tx
    .insert(suppliers)
    .values({
      id: newId(),
      name: input.name,
      company: input.company ?? null,
      contactPerson: input.contactPerson ?? null,
      phone: input.phone ?? null,
      wechat: input.wechat ?? null,
      email: input.email ?? null,
      city: input.city ?? null,
      country: input.country ?? 'China',
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
    })
    .returning()
    .get();
  recordAudit(tx, clock, {
    actorUserId: actor.id,
    actorLabel: actor.username,
    action: 'record.created',
    targetType: 'supplier',
    targetId: row.id,
    ctx,
    after: snapshot(row),
  });
  return { ...row, orderCount: 0 };
}

export function updateSupplier(
  tx: Executor,
  clock: Clock,
  id: string,
  input: UpdateInput,
  actor: UserRow,
  ctx: RequestCtx,
): SupplierWithCount {
  const before = getSupplier(tx, id);
  if (!before) throw notFound();
  const values: Partial<SupplierRow> = {};
  for (const key of AUDITED) {
    const value = input[key];
    if (value !== undefined) (values as Record<string, unknown>)[key] = value;
  }
  if (Object.keys(values).length === 0) return before;
  const after = tx
    .update(suppliers)
    .set({ ...values, updatedAt: clock.now() })
    .where(eq(suppliers.id, id))
    .returning()
    .get();
  recordAudit(tx, clock, {
    actorUserId: actor.id,
    actorLabel: actor.username,
    action: 'record.updated',
    targetType: 'supplier',
    targetId: id,
    ctx,
    before: snapshot(before),
    after: snapshot(after),
  });
  return { ...after, orderCount: before.orderCount };
}

/** Name-sorted list with normalized search over name, company, contact person and city (FR-006). */
export function listSuppliers(db: Executor, query: AddressBookQuery): { items: SupplierWithCount[]; nextCursor: string | null } {
  const offset = decodeOffset(query.cursor);
  const conditions: SQL[] = [query.deleted ? isNotNull(suppliers.deletedAt) : isNull(suppliers.deletedAt)];
  if (query.q?.trim()) {
    const pattern = likePattern(query.q);
    conditions.push(
      sql`(hj_norm(${suppliers.name}) like ${pattern} escape '\\'
        or hj_norm(${suppliers.company}) like ${pattern} escape '\\'
        or hj_norm(${suppliers.contactPerson}) like ${pattern} escape '\\'
        or hj_norm(${suppliers.city}) like ${pattern} escape '\\')`,
    );
  }
  const rows = db
    .select(withCount)
    .from(suppliers)
    .where(and(...conditions))
    .orderBy(sql`hj_norm(${suppliers.name})`, suppliers.id)
    .limit(query.limit + 1)
    .offset(offset)
    .all();
  const hasMore = rows.length > query.limit;
  return { items: rows.slice(0, query.limit), nextCursor: hasMore ? encodeOffset(offset + query.limit) : null };
}

/** FR-021: refused while items of non-deleted orders use the supplier. */
export function deleteSupplier(tx: Executor, clock: Clock, id: string, actor: UserRow, ctx: RequestCtx): void {
  const supplier = getSupplier(tx, id);
  if (!supplier) throw notFound();
  if (supplier.orderCount > 0) throw new AppError(409, 'in_use', { count: supplier.orderCount });
  softDelete(tx, clock, suppliers, 'supplier', id, actor, ctx);
}

export function restoreSupplier(tx: Executor, clock: Clock, id: string, actor: UserRow, ctx: RequestCtx): SupplierWithCount {
  if (!restore(tx, clock, suppliers, 'supplier', id, actor, ctx)) throw notFound();
  return getSupplier(tx, id)!;
}
