import { MAX_RECEIPT_BYTES, type FileKind, type ReceiptMime } from '@hanjing/shared';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, lt, ne, notExists } from 'drizzle-orm';
import { DAY_MS } from '../clock';
import type { Executor } from '../db/client';
import { expenses, files, payments, type FileRow, type UserRow } from '../db/schema';
import type { Deps } from '../deps';
import { AppError } from '../lib/errors';
import { newId } from '../lib/ids';
import { sniffMime } from './sniff';

/** Uploads not attached within this time are removed (003 research R7). */
export const ORPHAN_AGE_MS = DAY_MS;

/** `DATA_DIR/receipts/<id>`: no extension, the type lives in the `files` row (covered by 009 backups). */
export function receiptPath(dataDir: string, id: string): string {
  return join(dataDir, 'receipts', id);
}

/**
 * Store an uploaded file (an expense receipt or a payment proof): the type is sniffed from the bytes, never taken
 * from the client.
 */
export function saveFile(deps: Deps, bytes: Uint8Array, actor: UserRow, kind: FileKind): FileRow {
  if (bytes.length > MAX_RECEIPT_BYTES) throw new AppError(413, 'file_too_large');
  const mime = bytes.length > 0 ? sniffMime(bytes) : null;
  if (!mime) throw new AppError(400, 'file_type_invalid');

  const id = newId();
  const path = receiptPath(deps.config.dataDir, id);
  mkdirSync(join(deps.config.dataDir, 'receipts'), { recursive: true });
  writeFileSync(path, bytes, { flag: 'wx' });
  try {
    return deps.db
      .insert(files)
      .values({
        id,
        kind,
        mime,
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        createdBy: actor.id,
        createdAt: deps.clock.now(),
      })
      .returning()
      .get();
  } catch (error) {
    rmSync(path, { force: true });
    throw error;
  }
}

export function saveReceipt(deps: Deps, bytes: Uint8Array, actor: UserRow): FileRow {
  return saveFile(deps, bytes, actor, 'receipt');
}

/** The stored bytes and type of a file, or undefined if either the row or the file is gone. */
export function readFile(deps: Deps, fileId: string): { bytes: Buffer; mime: ReceiptMime; kind: FileKind } | undefined {
  const row = deps.db.select({ mime: files.mime, kind: files.kind }).from(files).where(eq(files.id, fileId)).get();
  if (!row) return undefined;
  try {
    return { bytes: readFileSync(receiptPath(deps.config.dataDir, fileId)), mime: row.mime, kind: row.kind };
  } catch {
    deps.log.warn(`[files] file ${fileId} is missing on disk`);
    return undefined;
  }
}

export const readReceipt = readFile;

/**
 * May `fileId` be attached by `actor`? It must be a file of this kind uploaded by the actor, and attached nowhere
 * else: neither to another expense nor to another payment (`except` is the record being edited).
 */
export function isAttachableFile(
  tx: Executor,
  fileId: string,
  kind: FileKind,
  actorId: string,
  except: { expenseId?: string; paymentId?: string } = {},
): boolean {
  const file = tx
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.kind, kind), eq(files.createdBy, actorId)))
    .get();
  if (!file) return false;
  const onExpense = tx
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.receiptFileId, fileId), except.expenseId ? ne(expenses.id, except.expenseId) : undefined))
    .get();
  const onPayment = tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.proofFileId, fileId), except.paymentId ? ne(payments.id, except.paymentId) : undefined))
    .get();
  return !onExpense && !onPayment;
}

/**
 * Remove uploads that no expense and no payment references after ORPHAN_AGE_MS. A soft-deleted record still
 * references its file, so restoring it brings the file back. Runs at server start and after each upload.
 */
export function removeOrphans(deps: Deps): number {
  const { db, clock, config, log } = deps;
  const orphans = db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        lt(files.createdAt, clock.now() - ORPHAN_AGE_MS),
        notExists(db.select({ id: expenses.id }).from(expenses).where(eq(expenses.receiptFileId, files.id))),
        notExists(db.select({ id: payments.id }).from(payments).where(eq(payments.proofFileId, files.id))),
      ),
    )
    .all();
  for (const { id } of orphans) {
    db.delete(files).where(eq(files.id, id)).run();
    rmSync(receiptPath(config.dataDir, id), { force: true });
  }
  if (orphans.length > 0) log.info(`[files] removed ${orphans.length} unattached upload(s)`);
  return orphans.length;
}
