import { SIGN_IN_OUTCOMES, SIGN_IN_REASONS } from '@hanjing/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const signInAttempts = sqliteTable(
  'sign_in_attempts',
  {
    id: text('id').primaryKey(),
    occurredAt: integer('occurred_at').notNull(),
    usernameInput: text('username_input').notNull(),
    usernameNormalized: text('username_normalized').notNull(),
    userId: text('user_id').references(() => users.id),
    outcome: text('outcome', { enum: SIGN_IN_OUTCOMES }).notNull(),
    reason: text('reason', { enum: SIGN_IN_REASONS }).notNull(),
    ip: text('ip').notNull(),
    userAgent: text('user_agent').notNull(),
    deviceLabel: text('device_label').notNull(),
    location: text('location'),
  },
  (t) => [
    index('sign_in_attempts_username_idx').on(t.usernameNormalized, t.occurredAt),
    index('sign_in_attempts_ip_idx').on(t.ip, t.occurredAt),
    index('sign_in_attempts_user_idx').on(t.userId, t.occurredAt),
  ],
);

export type SignInAttemptRow = typeof signInAttempts.$inferSelect;
