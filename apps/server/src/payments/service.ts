import {
  formatAmount,
  formatRate,
  MAX_AMOUNT_MINOR,
  parseAmount,
  parseRate,
  paymentValues,
  type ErrorCode,
  type ParsedPaymentInput,
} from '@hanjing/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import type { Executor } from '../db/client';
import { payments, type OrderRow, type PaymentRow, type UserRow } from '../db/schema';
import type { Deps } from '../deps';
import { isAttachableFile } from '../files/store';
import { AppError, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';
import { requireChannel } from '../policy/authorize';
import type { PaymentView } from '../policy/present';
import { marketRateFor } from '../rates/cache';
import { readRateSettings, snapshotProvider } from '../rates/settings';
import { restore, softDelete } from '../softDelete';
import { getPaymentView, requireLiveOrder } from './query';

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** What a payment looks like in the audit log: the values typed, and the frozen values they produced. */
function auditSnapshot(row: PaymentRow): Record<string, unknown> {
  return {
    channel: row.channel,
    type: row.type,
    amount: formatAmount(row.amountMinor),
    currency: row.currency,
    paymentDate: row.paymentDate,
    reference: row.reference,
    rates: {
      USD: formatRate(row.usdCnyMicro),
      MAD: formatRate(row.madCnyMicro),
      EUR: row.eurCnyMicro === null ? null : formatRate(row.eurCnyMicro),
    },
    rateSource: row.rateSource,
    bank:
      row.bankRateMicro === null
        ? null
        : { rate: formatRate(row.bankRateMicro), name: row.bankName, rateType: row.bankRateType, at: iso(row.bankRateAt) },
    cnyAmount: formatAmount(row.cnyMinor),
    countsAs: formatAmount(row.orderMinor),
    countsAsManual: row.orderMinorManual,
    proofId: row.proofFileId,
    notes: row.notes,
  };
}

type PaymentFields = Omit<
  PaymentRow,
  'id' | 'orderId' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'deletedAt' | 'deletedBy'
>;

/**
 * Checks zod cannot make (they need the order or the database), then the frozen values (research R1–R3).
 * On edit, `current` lets a payment keep its own proof and its market rate while its date and currency are unchanged.
 */
function resolvePayment(tx: Executor, input: ParsedPaymentInput, order: OrderRow, actor: UserRow, current?: PaymentRow): PaymentFields {
  const fields: Record<string, ErrorCode> = {};

  const eurMicro = input.rates.EUR ? parseRate(input.rates.EUR) : null;
  if (order.currency === 'EUR' && eurMicro === null) fields['rates.EUR'] = 'rate_required';

  const proofId = input.proofId ?? null;
  if (proofId && current?.proofFileId !== proofId) {
    if (!isAttachableFile(tx, proofId, 'payment_proof', actor.id, { paymentId: current?.id })) fields.proofId = 'proof_invalid';
  }

  // "Counts as" can only be typed when it is a conversion (decided 2026-10-08).
  const countsAs = input.countsAs ?? null;
  if (countsAs !== null && input.currency === order.currency) fields.countsAs = 'amount_invalid';

  if (Object.keys(fields).length > 0) throw new AppError(400, 'validation_failed', { fields });

  const amountMinor = parseAmount(input.amount);
  const rates = { USD: parseRate(input.rates.USD), MAD: parseRate(input.rates.MAD), EUR: eurMicro };
  const bank = input.bank ?? null;
  const bankRateMicro = bank ? parseRate(bank.rate) : null;
  const values = paymentValues({
    amountMinor,
    currency: input.currency,
    orderCurrency: order.currency,
    rates,
    bankRateMicro,
    countsAsMinor: countsAs === null ? null : parseAmount(countsAs),
  });
  const max = BigInt(MAX_AMOUNT_MINOR);
  if (values.cnyMinor > max || values.orderMinor > max || values.usdMinor > max || values.madMinor > max) {
    throw new AppError(400, 'validation_failed', { fields: { amount: 'amount_invalid' } });
  }

  // The payment currency's market rate on its date, from the cache only (R3). Kept while date and currency stay.
  let market = { marketRateMicro: null as number | null, marketRateDate: null as string | null };
  if (current && current.currency === input.currency && current.paymentDate === input.paymentDate) {
    market = { marketRateMicro: current.marketRateMicro, marketRateDate: current.marketRateDate };
  } else if (input.currency !== 'CNY') {
    const found = marketRateFor(tx, snapshotProvider(readRateSettings(tx)), input.currency, input.paymentDate);
    if (found) market = { marketRateMicro: found.rateMicro, marketRateDate: found.rateDate };
  }

  return {
    channel: input.channel,
    type: input.type,
    amountMinor,
    currency: input.currency,
    paymentDate: input.paymentDate,
    reference: input.reference ?? null,
    usdCnyMicro: rates.USD,
    madCnyMicro: rates.MAD,
    eurCnyMicro: eurMicro,
    rateSource: input.rateSource,
    ratesFetchedAt: input.rateSource !== 'manual' && input.ratesFetchedAt ? Date.parse(input.ratesFetchedAt) : null,
    ...market,
    bankRateMicro,
    bankName: bank ? bank.name : null,
    bankRateType: bank ? bank.rateType : null,
    bankRateAt: bank ? Date.parse(bank.at) : null,
    cnyMinor: Number(values.cnyMinor),
    orderMinor: Number(values.orderMinor),
    orderMinorManual: values.orderManual,
    usdMinor: Number(values.usdMinor),
    madMinor: Number(values.madMinor),
    proofFileId: proofId,
    notes: input.notes ?? null,
  };
}

/** FR-001 – FR-011: add a payment to a non-deleted order, in one transaction with its audit entry. */
export function createPayment(deps: Deps, orderId: string, input: ParsedPaymentInput, actor: UserRow, ctx: RequestCtx): PaymentView {
  const { db, clock } = deps;
  return db.transaction((tx) => {
    const order = requireLiveOrder(tx, orderId);
    requireChannel(actor, input.channel, 'create');
    const now = clock.now();
    const row = tx
      .insert(payments)
      .values({
        id: newId(),
        orderId,
        ...resolvePayment(tx, input, order, actor),
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
      targetType: 'payment',
      targetId: row.id,
      ctx,
      after: { orderId, ...auditSnapshot(row) },
    });
    return getPaymentView(tx, row.id)!;
  });
}

/** A payment the viewer may act on: it exists (deleted or not, as asked), its order is not deleted, its channel is allowed. */
export function requirePayment(
  db: Executor,
  actor: UserRow,
  id: string,
  action: 'view' | 'create' | 'edit' | 'delete',
  options: { deleted?: boolean } = {},
): PaymentView {
  const view = getPaymentView(db, id, options);
  if (!view) throw notFound();
  requireChannel(actor, view.channel, action);
  return view;
}

// ── Edit, delete, restore (US6) ────────────────────────────────────────────

/**
 * FR-024: full replace of every field, with the same checks as create. Values are recomputed; a typed "counts as"
 * is kept only while it is sent; the market rate is refreshed only when the date or the currency changes.
 * One audit entry with the changed fields, none if nothing changed.
 */
export function updatePayment(deps: Deps, id: string, input: ParsedPaymentInput, actor: UserRow, ctx: RequestCtx): PaymentView {
  const { db, clock } = deps;
  return db.transaction((tx) => {
    const current = requirePayment(tx, actor, id, 'edit');
    requireChannel(actor, input.channel, 'edit'); // moving a payment needs the target channel too
    const order = requireLiveOrder(tx, current.orderId);
    const fields = resolvePayment(tx, input, order, actor, current);
    const before = auditSnapshot(current);
    const after = auditSnapshot({ ...current, ...fields });
    if (JSON.stringify(before) === JSON.stringify(after)) return current;

    tx.update(payments)
      .set({ ...fields, updatedAt: clock.now(), updatedBy: actor.id })
      .where(eq(payments.id, id))
      .run();
    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'record.updated',
      targetType: 'payment',
      targetId: id,
      ctx,
      before,
      after,
    });
    return getPaymentView(tx, id)!;
  });
}

/** FR-025: recoverable deletion through the 001 helper (which writes the audit entry). */
export function deletePayment(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    requirePayment(tx, actor, id, 'delete');
    if (!softDelete(tx, clock, payments, 'payment', id, actor, ctx)) throw notFound();
  });
}

/** Restore from "Show deleted payments". The order must not be deleted (its payments come back with it). */
export function restorePayment(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): PaymentView {
  const { db, clock } = deps;
  return db.transaction((tx) => {
    requirePayment(tx, actor, id, 'delete', { deleted: true });
    if (!restore(tx, clock, payments, 'payment', id, actor, ctx)) throw notFound();
    return getPaymentView(tx, id)!;
  });
}
