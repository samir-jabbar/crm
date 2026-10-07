import { z } from 'zod';
import type { AuditAction } from '../enums';
import { pageQuerySchema } from './signInHistory';

export interface AuditEntryItem {
  id: string;
  occurredAt: string;
  actor: { id: string | null; label: string };
  action: AuditAction;
  target: { type: string | null; id: string | null };
  ip: string | null;
  deviceLabel: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const isoDateOrDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'invalid_value')
  .optional();

export const auditQuerySchema = pageQuerySchema.extend({
  actorId: z.string().max(64).optional(),
  /** Exact action code, or a prefix ending with "." (e.g. "auth."). */
  action: z.string().max(64).optional(),
  from: isoDateOrDateTime,
  to: isoDateOrDateTime,
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export interface AuditActionsResponse {
  items: AuditAction[];
}

export interface AuditActorsResponse {
  items: { id: string; label: string }[];
}
