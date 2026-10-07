import { LANGUAGES, ROLES, USER_STATUSES } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    usernameNormalized: text('username_normalized').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    status: text('status', { enum: USER_STATUSES }).notNull(),
    language: text('language', { enum: LANGUAGES }).notNull(),
    passwordChangedAt: integer('password_changed_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  () => [
    uniqueIndex('users_username_normalized_unique').on(sql`username_normalized`),
    // At most one Owner (FR-002). Owner delete/demote triggers live in the custom migration.
    uniqueIndex('users_one_owner').on(sql`role`).where(sql`role = 'owner'`),
    check('users_role_check', sql`role IN ('owner', 'worker')`),
    check('users_status_check', sql`status IN ('active', 'pending', 'suspended', 'deleted')`),
    check('users_language_check', sql`language IN ('en', 'fr', 'ar')`),
  ],
);

export type UserRow = typeof users.$inferSelect;
