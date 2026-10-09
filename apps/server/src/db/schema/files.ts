import { FILE_KINDS, RECEIPT_MIME_TYPES } from '@hanjing/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * Stored files (003 R7). The bytes live at `DATA_DIR/receipts/<id>`; this row holds what was sniffed.
 * A file is attached when an expense or a payment references it; unattached uploads are removed after 24 h.
 */
export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    /** `receipt` (expenses, 003) or `payment_proof` (payments, 004). */
    kind: text('kind', { enum: FILE_KINDS }).notNull(),
    mime: text('mime', { enum: RECEIPT_MIME_TYPES }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('files_created_idx').on(t.createdAt),
    check('files_kind_check', sql`kind IN (${list(FILE_KINDS)})`),
    check('files_mime_check', sql`mime IN (${list(RECEIPT_MIME_TYPES)})`),
    check('files_size_check', sql`size_bytes BETWEEN 1 AND 10485760`),
  ],
);

export type FileRow = typeof files.$inferSelect;
