import { integer, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Recoverable-deletion columns (FR-024 of 001), spread into every business table.
 * Lives with the schema (not in softDelete/) to avoid a schema ↔ audit import cycle.
 */
export function softDeleteColumns() {
  return {
    deletedAt: integer('deleted_at'),
    deletedBy: text('deleted_by').references(() => users.id),
  };
}

/** created/updated timestamps and creator, shared by business tables. */
export function auditColumns() {
  return {
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
  };
}
