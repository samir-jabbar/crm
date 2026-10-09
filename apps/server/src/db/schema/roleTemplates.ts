import { ORDER_SCOPES, TEMPLATE_KEYS } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Reusable sets of permissions (005 FR-015 – FR-017). Applying one copies it to the worker (research R9). The five
 * defaults have a `default_key` and a null `name`, which shows the translated default name until renamed.
 */
export const roleTemplates = sqliteTable(
  'role_templates',
  {
    id: text('id').primaryKey(),
    defaultKey: text('default_key', { enum: TEMPLATE_KEYS }),
    name: text('name'),
    /** JSON PermissionSet, normalized. */
    permissions: text('permissions').notNull(),
    orderScope: text('order_scope', { enum: ORDER_SCOPES }).notNull().default('all'),
    ownEntriesOnly: integer('own_entries_only', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    createdBy: text('created_by').references((): AnySQLiteColumn => users.id),
    updatedBy: text('updated_by').references((): AnySQLiteColumn => users.id),
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    uniqueIndex('role_templates_default_key_unique').on(t.defaultKey),
    check('role_templates_scope_check', sql`order_scope IN ('all', 'assigned', 'customers')`),
    check('role_templates_name_length', sql`name IS NULL OR length(name) BETWEEN 1 AND 60`),
  ],
);

export type RoleTemplateRow = typeof roleTemplates.$inferSelect;
