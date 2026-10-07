import { AUDIT_ACTIONS } from '@hanjing/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/** Append-only (FR-022): UPDATE/DELETE are aborted by triggers in the custom migration. */
export const auditEntries = sqliteTable(
  'audit_entries',
  {
    id: text('id').primaryKey(),
    occurredAt: integer('occurred_at').notNull(),
    actorUserId: text('actor_user_id').references(() => users.id),
    actorLabel: text('actor_label').notNull(),
    action: text('action', { enum: AUDIT_ACTIONS }).notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    deviceLabel: text('device_label'),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
  },
  (t) => [
    index('audit_entries_occurred_idx').on(t.occurredAt),
    index('audit_entries_actor_idx').on(t.actorUserId, t.occurredAt),
    index('audit_entries_action_idx').on(t.action, t.occurredAt),
  ],
);

export type AuditEntryRow = typeof auditEntries.$inferSelect;
