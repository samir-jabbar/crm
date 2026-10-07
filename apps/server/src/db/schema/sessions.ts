import { SESSION_REVOKE_REASONS } from '@hanjing/shared';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const sessions = sqliteTable(
  'sessions',
  {
    /** Public id shown in the device list — never the token. */
    id: text('id').primaryKey(),
    /** SHA-256 (hex) of the cookie token. */
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
    lastActiveAt: integer('last_active_at').notNull(),
    /** Absolute expiry: sign-in + 30 days (FR-013). */
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    revokedReason: text('revoked_reason', { enum: SESSION_REVOKE_REASONS }),
    ip: text('ip').notNull(),
    userAgent: text('user_agent').notNull(),
    deviceLabel: text('device_label').notNull(),
    location: text('location'),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_unique').on(t.tokenHash),
    index('sessions_user_revoked_idx').on(t.userId, t.revokedAt),
  ],
);

export type SessionRow = typeof sessions.$inferSelect;
