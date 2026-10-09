import { and, asc, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { orderAssignments, orders, userCustomers, users, type UserRow } from '../db/schema';
import type { Deps } from '../deps';
import { AppError, notFound } from '../lib/errors';
import type { RequestCtx } from '../lib/requestContext';
import { requireTarget } from './service';

/** Workers assigned to an order (005 FR-019), by name. */
export function orderAssignees(db: Executor, orderId: string): { userId: string; displayName: string }[] {
  return db
    .select({ userId: users.id, displayName: users.displayName })
    .from(orderAssignments)
    .innerJoin(users, eq(users.id, orderAssignments.userId))
    .where(eq(orderAssignments.orderId, orderId))
    .orderBy(asc(users.displayName))
    .all();
}

const sorted = (ids: string[]) => [...new Set(ids)].sort();

/** Workers who can be assigned: not the Owner, not deleted or rejected. */
function requireAssignable(tx: Executor, userIds: string[]): void {
  if (userIds.length === 0) return;
  const found = tx.select({ id: users.id, role: users.role, status: users.status }).from(users).where(inArray(users.id, userIds)).all();
  const ok = found.filter((u) => u.role === 'worker' && u.status !== 'deleted');
  if (ok.length !== userIds.length) throw new AppError(400, 'validation_failed', { fields: { userIds: 'invalid_value' } });
}

/** FR-019: set an order's assignees (from the order page). One audit entry with before and after. */
export function setOrderAssignees(deps: Deps, orderId: string, userIds: string[], actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    if (!tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).get()) throw notFound();
    const wanted = sorted(userIds);
    requireAssignable(tx, wanted);
    const before = orderAssignees(tx, orderId).map((a) => a.userId).sort();
    if (JSON.stringify(before) === JSON.stringify(wanted)) return;
    tx.delete(orderAssignments).where(eq(orderAssignments.orderId, orderId)).run();
    const now = clock.now();
    for (const userId of wanted) tx.insert(orderAssignments).values({ orderId, userId, assignedAt: now, assignedBy: actor.id }).run();
    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'order.assignees_changed',
      targetType: 'order',
      targetId: orderId,
      ctx,
      before: { userIds: before },
      after: { userIds: wanted },
    });
  });
}

/** FR-019: set a worker's assigned orders (from the worker's page). One audit entry per order that changed. */
export function setUserOrders(deps: Deps, userId: string, orderIds: string[], actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const user = requireTarget(tx, userId);
    if (user.status === 'deleted') throw notFound();
    const wanted = new Set(sorted(orderIds));
    if (wanted.size > 0 && tx.select({ id: orders.id }).from(orders).where(inArray(orders.id, [...wanted])).all().length !== wanted.size) {
      throw new AppError(400, 'validation_failed', { fields: { orderIds: 'invalid_value' } });
    }
    const current = new Set(tx.select({ id: orderAssignments.orderId }).from(orderAssignments).where(eq(orderAssignments.userId, userId)).all().map((r) => r.id));
    const changed = [...new Set([...wanted, ...current])].filter((id) => wanted.has(id) !== current.has(id));
    for (const orderId of changed) {
      const before = orderAssignees(tx, orderId).map((a) => a.userId).sort();
      if (wanted.has(orderId)) tx.insert(orderAssignments).values({ orderId, userId, assignedAt: clock.now(), assignedBy: actor.id }).run();
      else tx.delete(orderAssignments).where(and(eq(orderAssignments.orderId, orderId), eq(orderAssignments.userId, userId))).run();
      recordAudit(tx, clock, {
        actorUserId: actor.id,
        actorLabel: actor.username,
        action: 'order.assignees_changed',
        targetType: 'order',
        targetId: orderId,
        ctx,
        before: { userIds: before },
        after: { userIds: orderAssignees(tx, orderId).map((a) => a.userId).sort() },
      });
    }
  });
}

/** FR-020: an order created by a worker with the "assigned orders" scope is theirs at once. */
export function assignCreator(tx: Executor, clock: Clock, actor: UserRow, orderId: string): void {
  if (actor.role !== 'worker' || actor.orderScope !== 'assigned') return;
  tx.insert(orderAssignments).values({ orderId, userId: actor.id, assignedAt: clock.now(), assignedBy: actor.id }).onConflictDoNothing().run();
}

/** FR-020: a customer created by a worker with the "selected customers" scope joins their selection. */
export function selectCreatedCustomer(tx: Executor, actor: UserRow, customerId: string): void {
  if (actor.role !== 'worker' || actor.orderScope !== 'customers') return;
  tx.insert(userCustomers).values({ userId: actor.id, customerId }).onConflictDoNothing().run();
}
