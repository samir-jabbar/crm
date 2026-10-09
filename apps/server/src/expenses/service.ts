import {
  convertToCnyMinor,
  formatAmount,
  formatRate,
  MAX_AMOUNT_MINOR,
  parseAmount,
  parseRate,
  RATE_SCALE,
  type ErrorCode,
  type ParsedExpenseInput,
} from '@hanjing/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import type { Executor } from '../db/client';
import { expenses, suppliers, type ExpenseRow, type UserRow } from '../db/schema';
import type { Deps } from '../deps';
import { AppError, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';
import type { ExpenseView } from '../policy/present';
import { restore, softDelete } from '../softDelete';
import { snapshotFor } from '../rates/cache';
import { readRateSettings, snapshotProvider } from '../rates/settings';
import { isAttachableFile } from '../files/store';
import { getCategory } from './categories';
import { getExpenseView, requireOpenOrder } from './query';

/** What an expense looks like in the audit log: the values the Owner typed, as shown in the API. */
function auditSnapshot(row: ExpenseRow): Record<string, unknown> {
  return {
    name: row.name,
    categoryId: row.categoryId,
    amount: formatAmount(row.amountMinor),
    currency: row.currency,
    rate: formatRate(row.rateMicro),
    rateSource: row.rateSource,
    cnyAmount: formatAmount(row.cnyMinor),
    expenseDate: row.expenseDate,
    paidToSupplierId: row.paidToSupplierId,
    paidToName: row.paidToName,
    paymentMethod: row.paymentMethod,
    advancedBy: row.advancedBy,
    reimbursed: row.reimbursed,
    status: row.status,
    dueDate: row.dueDate,
    receiptId: row.receiptFileId,
    notes: row.notes,
  };
}

type ExpenseFields = Omit<
  ExpenseRow,
  'id' | 'orderId' | 'usdCnyMicro' | 'madCnyMicro' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'deletedAt' | 'deletedBy'
>;

/**
 * References zod cannot check, then the frozen CNY amount (FR-003). On edit, `current` lets an expense keep a
 * category that has since been hidden, a supplier since deleted, and its own receipt.
 */
function resolveFields(tx: Executor, input: ParsedExpenseInput, actor: UserRow, current?: ExpenseRow): ExpenseFields {
  const fields: Record<string, ErrorCode> = {};

  const category = getCategory(tx, input.categoryId);
  if (!category || (category.hidden && current?.categoryId !== input.categoryId)) fields.categoryId = 'category_invalid';

  const supplierId = input.paidToSupplierId ?? null;
  if (supplierId && current?.paidToSupplierId !== supplierId) {
    const supplier = tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)))
      .get();
    if (!supplier) fields.paidToSupplierId = 'supplier_invalid';
  }

  const receiptId = input.receiptId ?? null;
  if (receiptId && current?.receiptFileId !== receiptId) {
    if (!isAttachableFile(tx, receiptId, 'receipt', actor.id, { expenseId: current?.id })) fields.receiptId = 'receipt_invalid';
  }

  // CNY is always 1, typed by nobody; any other currency uses the rate the user saved.
  const isBase = input.currency === 'CNY';
  const rateMicro = isBase ? RATE_SCALE : parseRate(input.rate!);
  const amountMinor = parseAmount(input.amount);
  const cny = convertToCnyMinor(amountMinor, rateMicro);
  if (cny > BigInt(MAX_AMOUNT_MINOR)) fields.amount = 'amount_invalid';

  if (Object.keys(fields).length > 0) throw new AppError(400, 'validation_failed', { fields });

  const advancedBy = input.advancedBy ?? null;
  return {
    name: input.name,
    categoryId: input.categoryId,
    amountMinor,
    currency: input.currency,
    rateMicro,
    rateSource: isBase ? 'manual' : input.rateSource,
    cnyMinor: Number(cny),
    expenseDate: input.expenseDate,
    paidToSupplierId: supplierId,
    paidToName: supplierId ? null : (input.paidToName ?? null),
    paymentMethod: input.paymentMethod,
    advancedBy,
    // "Reimbursed" only means something when someone advanced the money (data-model.md).
    reimbursed: advancedBy ? input.reimbursed : false,
    status: input.status,
    dueDate: input.dueDate ?? null,
    receiptFileId: receiptId,
    notes: input.notes ?? null,
  };
}

/** USD/MAD → CNY of the expense date, from the rate cache only: saving never calls a provider (research R4). */
function snapshots(tx: Executor, date: string) {
  const { usdMicro, madMicro } = snapshotFor(tx, snapshotProvider(readRateSettings(tx)), date);
  return { usdCnyMicro: usdMicro, madCnyMicro: madMicro };
}

/** FR-001 – FR-004: add an expense to a non-deleted order, in one transaction with its audit entry. */
export function createExpense(deps: Deps, orderId: string, input: ParsedExpenseInput, actor: UserRow, ctx: RequestCtx): ExpenseView {
  const { db, clock } = deps;
  return db.transaction((tx) => {
    requireOpenOrder(tx, orderId);
    const now = clock.now();
    const row = tx
      .insert(expenses)
      .values({
        id: newId(),
        orderId,
        ...resolveFields(tx, input, actor),
        ...snapshots(tx, input.expenseDate),
        createdAt: now,
        updatedAt: now,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning()
      .get();
    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'record.created',
      targetType: 'expense',
      targetId: row.id,
      ctx,
      after: { orderId, ...auditSnapshot(row) },
    });
    return getExpenseView(tx, row.id)!;
  });
}

export function requireExpense(db: Executor, id: string, options: { deleted?: boolean } = {}): ExpenseView {
  const view = getExpenseView(db, id, options);
  if (!view) throw notFound();
  return view;
}

// ── Edit, status, delete, restore (US4) ────────────────────────────────────

/**
 * FR-007: full replace of every field, with the same checks as create. The CNY amount is recomputed; USD/MAD
 * snapshots are refreshed only when the date changes. One audit entry with the changed fields, none if nothing did.
 */
export function updateExpense(deps: Deps, id: string, input: ParsedExpenseInput, actor: UserRow, ctx: RequestCtx): ExpenseView {
  const { db, clock } = deps;
  return db.transaction((tx) => {
    const current = requireExpense(tx, id);
    const fields = resolveFields(tx, input, actor, current);
    const dated = input.expenseDate === current.expenseDate ? {} : snapshots(tx, input.expenseDate);
    const before = auditSnapshot(current);
    const after = auditSnapshot({ ...current, ...fields });
    if (JSON.stringify(before) === JSON.stringify(after)) return current;

    tx.update(expenses)
      .set({ ...fields, ...dated, updatedAt: clock.now(), updatedBy: actor.id })
      .where(eq(expenses.id, id))
      .run();
    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'record.updated',
      targetType: 'expense',
      targetId: id,
      ctx,
      before,
      after,
    });
    return getExpenseView(tx, id)!;
  });
}

/** Quick switches from the expense page: paid ↔ to pay, and (US5) reimbursed. Audited like any edit. */
export function setExpenseStatus(
  deps: Deps,
  id: string,
  patch: { status?: ExpenseRow['status']; reimbursed?: boolean },
  actor: UserRow,
  ctx: RequestCtx,
): ExpenseView {
  const { db, clock } = deps;
  return db.transaction((tx) => {
    const current = requireExpense(tx, id);
    const status = patch.status ?? current.status;
    // "Reimbursed" only means something when someone advanced the money.
    const reimbursed = patch.reimbursed === undefined || !current.advancedBy ? current.reimbursed : patch.reimbursed;
    if (status === current.status && reimbursed === current.reimbursed) return current;

    tx.update(expenses).set({ status, reimbursed, updatedAt: clock.now(), updatedBy: actor.id }).where(eq(expenses.id, id)).run();
    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'record.updated',
      targetType: 'expense',
      targetId: id,
      ctx,
      before: { status: current.status, reimbursed: current.reimbursed },
      after: { status, reimbursed },
    });
    return getExpenseView(tx, id)!;
  });
}

/** FR-008: recoverable deletion through the 001 helper (which writes the audit entry). */
export function deleteExpense(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    requireExpense(tx, id);
    if (!softDelete(tx, clock, expenses, 'expense', id, actor, ctx)) throw notFound();
  });
}

/** Restore from "Show deleted expenses". The order must not be deleted (its expenses come back with it). */
export function restoreExpense(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): ExpenseView {
  const { db, clock } = deps;
  return db.transaction((tx) => {
    requireExpense(tx, id, { deleted: true });
    if (!restore(tx, clock, expenses, 'expense', id, actor, ctx)) throw notFound();
    return getExpenseView(tx, id)!;
  });
}
