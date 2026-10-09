import { formatPercent, parsePercent, planAmounts, type paymentPlanSchema } from '@hanjing/shared';
import { asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { defaultPaymentStages, orderPaymentStages, type OrderPaymentStageRow, type OrderRow, type UserRow } from '../db/schema';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';

export type PlanStageView = OrderPaymentStageRow & { amountMinor: bigint };

/** FR-013: every new order starts with a copy of the default plan from Settings. */
export function copyDefaultPlan(tx: Executor, orderId: string): void {
  const stages = tx.select().from(defaultPaymentStages).orderBy(asc(defaultPaymentStages.position)).all();
  if (stages.length === 0) return;
  tx.insert(orderPaymentStages)
    .values(
      stages.map((s) => ({
        id: newId(),
        orderId,
        position: s.position,
        type: s.type,
        channel: s.channel,
        percentBp: s.percentBp,
        dueBeforeStatus: s.dueBeforeStatus,
        dueDate: null,
      })),
    )
    .run();
}

/** A duplicated order keeps the plan of its source (with new ids). */
export function copyPlan(tx: Executor, fromOrderId: string, toOrderId: string): void {
  const stages = listPlan(tx, fromOrderId);
  if (stages.length === 0) return;
  tx.insert(orderPaymentStages)
    .values(stages.map((s) => ({ ...s, id: newId(), orderId: toOrderId })))
    .run();
}

export function listPlan(db: Executor, orderId: string): OrderPaymentStageRow[] {
  return db
    .select()
    .from(orderPaymentStages)
    .where(eq(orderPaymentStages.orderId, orderId))
    .orderBy(asc(orderPaymentStages.position))
    .all();
}

/** The plan with each stage's share of the agreed price; the last stage takes the rounding difference (R4). */
export function planWithAmounts(stages: OrderPaymentStageRow[], agreedMinor: number): PlanStageView[] {
  const amounts = planAmounts(
    agreedMinor,
    stages.map((s) => s.percentBp),
  );
  return stages.map((s, i) => ({ ...s, amountMinor: amounts[i]! }));
}

/** The plan as written to the audit log: what the Owner typed, without ids or computed amounts. */
function planSnapshot(stages: Pick<OrderPaymentStageRow, 'type' | 'channel' | 'percentBp' | 'dueBeforeStatus' | 'dueDate'>[]) {
  return stages.map((s) => ({
    type: s.type,
    channel: s.channel,
    percent: formatPercent(s.percentBp),
    dueBeforeStatus: s.dueBeforeStatus,
    dueDate: s.dueDate,
  }));
}

/**
 * FR-014: replace an order's whole plan (the schema has checked that it totals exactly 100%). One audit entry with
 * the plan before and after; none when nothing changed.
 */
export function replacePlan(
  tx: Executor,
  clock: Clock,
  order: OrderRow,
  stages: z.output<typeof paymentPlanSchema>['stages'],
  actor: UserRow,
  ctx: RequestCtx,
): PlanStageView[] {
  const before = listPlan(tx, order.id);
  const next = stages.map((s, position) => ({
    id: newId(),
    orderId: order.id,
    position,
    type: s.type,
    channel: s.channel,
    percentBp: parsePercent(s.percent),
    dueBeforeStatus: s.dueBeforeStatus ?? null,
    dueDate: s.dueDate ?? null,
  }));
  if (JSON.stringify(planSnapshot(before)) !== JSON.stringify(planSnapshot(next))) {
    tx.delete(orderPaymentStages).where(eq(orderPaymentStages.orderId, order.id)).run();
    tx.insert(orderPaymentStages).values(next).run();
    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'record.updated',
      targetType: 'order',
      targetId: order.id,
      ctx,
      before: { paymentPlan: planSnapshot(before) },
      after: { paymentPlan: planSnapshot(next) },
    });
  }
  return planWithAmounts(listPlan(tx, order.id), order.agreedPriceMinor);
}
