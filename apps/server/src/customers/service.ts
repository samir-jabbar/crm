import { likePattern, type AddressBookQuery } from '@hanjing/shared';
import type { createCustomerRequestSchema, updateCustomerRequestSchema } from '@hanjing/shared';
import { and, eq, getTableColumns, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { customers, type CustomerRow, type UserRow } from '../db/schema';
import { AppError, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { decodeOffset, encodeOffset } from '../lib/offsetCursor';
import type { RequestCtx } from '../lib/requestContext';
import { restore, softDelete } from '../softDelete';

type CreateInput = z.output<typeof createCustomerRequestSchema>;
type UpdateInput = z.output<typeof updateCustomerRequestSchema>;
export type CustomerWithCount = CustomerRow & { orderCount: number };

// Table-qualified on purpose: inside a subquery, an unqualified "id" would bind to orders.id.
const orderCount = sql<number>`(select count(*) from orders o where o.customer_id = "customers"."id" and o.deleted_at is null)`;
const withCount = { ...getTableColumns(customers), orderCount };

const AUDITED = ['name', 'company', 'city', 'country', 'phone', 'email', 'notes'] as const;
const snapshot = (row: CustomerRow) => Object.fromEntries(AUDITED.map((k) => [k, row[k]]));

export function getCustomer(db: Executor, id: string, options: { deleted?: boolean } = {}): CustomerWithCount | undefined {
  return db
    .select(withCount)
    .from(customers)
    .where(and(eq(customers.id, id), options.deleted ? isNotNull(customers.deletedAt) : isNull(customers.deletedAt)))
    .get();
}

/** Same name as an existing non-deleted customer, ignoring case, accents and surrounding spaces (FR-002). */
export function findCustomerWithSameName(db: Executor, name: string): CustomerRow | undefined {
  return db
    .select()
    .from(customers)
    .where(and(isNull(customers.deletedAt), sql`hj_norm(${customers.name}) = hj_norm(${name})`))
    .get();
}

export function createCustomer(tx: Executor, clock: Clock, input: CreateInput, actor: UserRow, ctx: RequestCtx): CustomerWithCount {
  if (!input.confirmDuplicate) {
    const existing = findCustomerWithSameName(tx, input.name);
    if (existing) throw new AppError(409, 'customer_name_exists', { existingId: existing.id });
  }
  const now = clock.now();
  const row = tx
    .insert(customers)
    .values({
      id: newId(),
      name: input.name,
      company: input.company ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
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
    targetType: 'customer',
    targetId: row.id,
    ctx,
    after: snapshot(row),
  });
  return { ...row, orderCount: 0 };
}

export function updateCustomer(
  tx: Executor,
  clock: Clock,
  id: string,
  input: UpdateInput,
  actor: UserRow,
  ctx: RequestCtx,
): CustomerWithCount {
  const before = getCustomer(tx, id);
  if (!before) throw notFound();
  const values: Partial<CustomerRow> = {};
  for (const key of AUDITED) {
    const value = input[key];
    if (value !== undefined) (values as Record<string, unknown>)[key] = value;
  }
  if (Object.keys(values).length === 0) return before;
  const after = tx
    .update(customers)
    .set({ ...values, updatedAt: clock.now() })
    .where(eq(customers.id, id))
    .returning()
    .get();
  recordAudit(tx, clock, {
    actorUserId: actor.id,
    actorLabel: actor.username,
    action: 'record.updated',
    targetType: 'customer',
    targetId: id,
    ctx,
    before: snapshot(before),
    after: snapshot(after),
  });
  return { ...after, orderCount: before.orderCount };
}

/** Name-sorted list with normalized search over name, company, city and phone (FR-003). */
export function listCustomers(db: Executor, query: AddressBookQuery): { items: CustomerWithCount[]; nextCursor: string | null } {
  const offset = decodeOffset(query.cursor);
  const conditions: SQL[] = [query.deleted ? isNotNull(customers.deletedAt) : isNull(customers.deletedAt)];
  if (query.q?.trim()) {
    const pattern = likePattern(query.q);
    conditions.push(
      sql`(hj_norm(${customers.name}) like ${pattern} escape '\\'
        or hj_norm(${customers.company}) like ${pattern} escape '\\'
        or hj_norm(${customers.city}) like ${pattern} escape '\\'
        or hj_norm(${customers.phone}) like ${pattern} escape '\\')`,
    );
  }
  const rows = db
    .select(withCount)
    .from(customers)
    .where(and(...conditions))
    .orderBy(sql`hj_norm(${customers.name})`, customers.id)
    .limit(query.limit + 1)
    .offset(offset)
    .all();
  const hasMore = rows.length > query.limit;
  return { items: rows.slice(0, query.limit), nextCursor: hasMore ? encodeOffset(offset + query.limit) : null };
}

/** FR-021: refused while non-deleted orders use the customer. */
export function deleteCustomer(tx: Executor, clock: Clock, id: string, actor: UserRow, ctx: RequestCtx): void {
  const customer = getCustomer(tx, id);
  if (!customer) throw notFound();
  if (customer.orderCount > 0) throw new AppError(409, 'in_use', { count: customer.orderCount });
  softDelete(tx, clock, customers, 'customer', id, actor, ctx);
}

export function restoreCustomer(tx: Executor, clock: Clock, id: string, actor: UserRow, ctx: RequestCtx): CustomerWithCount {
  if (!restore(tx, clock, customers, 'customer', id, actor, ctx)) throw notFound();
  return getCustomer(tx, id)!;
}
