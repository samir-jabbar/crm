import type { AuditAction } from '@hanjing/shared';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { auditEntries } from '../db/schema';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';

/** Never written to the audit log, whatever the caller passes. */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'tokenHash',
  'setupCode',
  'setupCodeHash',
  // 003: the exchange-rate access key (rates/service.ts audits only whether one is set).
  'apiKey',
]);

export interface AuditInput {
  actorUserId: string | null;
  actorLabel: string;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  ctx?: RequestCtx | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

function scrub(values: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!values) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!SENSITIVE_KEYS.has(key)) out[key] = value;
  }
  return out;
}

/** When both sides are given, keep only the fields that actually changed (FR-021). */
function changedOnly(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): [Record<string, unknown> | null, Record<string, unknown> | null] {
  if (!before || !after) return [before, after];
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key] ?? null;
      a[key] = after[key] ?? null;
    }
  }
  return [b, a];
}

/**
 * Append an audit entry. Call it inside the same transaction as the change it describes,
 * so a committed change always has its entry (R11).
 */
export function recordAudit(tx: Executor, clock: Clock, input: AuditInput): void {
  const [before, after] = changedOnly(scrub(input.before), scrub(input.after));
  tx.insert(auditEntries)
    .values({
      id: newId(),
      occurredAt: clock.now(),
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel.slice(0, 64),
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ip: input.ctx?.ip ?? null,
      userAgent: input.ctx?.userAgent ?? null,
      deviceLabel: input.ctx?.deviceLabel ?? null,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: after ? JSON.stringify(after) : null,
    })
    .run();
}
