import { LANGUAGES, ORDER_SCOPES, ROLES, USER_STATUSES } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { roleTemplates } from './roleTemplates';

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
    // 005: a worker's access (research R1). `permissions` is a JSON PermissionSet; null for the Owner and pending accounts.
    permissions: text('permissions'),
    orderScope: text('order_scope', { enum: ORDER_SCOPES }).notNull().default('all'),
    ownEntriesOnly: integer('own_entries_only', { mode: 'boolean' }).notNull().default(false),
    /** Last day of access, `YYYY-MM-DD` in China time (FR-023). */
    accessEndsOn: text('access_ends_on'),
    templateId: text('template_id').references((): AnySQLiteColumn => roleTemplates.id),
    /** The access differs from the template it was copied from. */
    permissionsAdjusted: integer('permissions_adjusted', { mode: 'boolean' }).notNull().default(false),
    /** Set by an Owner password reset: the worker must choose a new password first (FR-037). */
    mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
    approvedAt: integer('approved_at'),
    approvedBy: text('approved_by').references((): AnySQLiteColumn => users.id),
    /** A rejected registration: status `deleted`, username freed (research R6). */
    rejectedAt: integer('rejected_at'),
    deletedAt: integer('deleted_at'),
  },
  () => [
    uniqueIndex('users_username_normalized_unique').on(sql`username_normalized`),
    // At most one Owner (FR-002). Owner delete/demote triggers live in the custom migration.
    uniqueIndex('users_one_owner').on(sql`role`).where(sql`role = 'owner'`),
    check('users_role_check', sql`role IN ('owner', 'worker')`),
    check('users_status_check', sql`status IN ('active', 'pending', 'suspended', 'deleted')`),
    check('users_language_check', sql`language IN ('en', 'fr', 'ar')`),
    check('users_order_scope_check', sql`order_scope IN ('all', 'assigned', 'customers')`),
  ],
);

export type UserRow = typeof users.$inferSelect;
