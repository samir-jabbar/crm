import { formatPercent, parsePercent, type PaymentSettings, type paymentSettingsPatchSchema } from '@hanjing/shared';
import { asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { recordAudit } from '../audit/record';
import type { Executor } from '../db/client';
import { chineseBanks, defaultPaymentStages, paymentSettings, type PaymentSettingsRow, type UserRow } from '../db/schema';
import type { Deps } from '../deps';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';

/** The single payment-settings row (seeded by migration 0007). */
export function readPaymentSettings(db: Executor): PaymentSettingsRow {
  const row = db.select().from(paymentSettings).where(eq(paymentSettings.id, 1)).get();
  if (!row) throw new Error('payment_settings row is missing: run the migrations');
  return row;
}

/** The bank names offered in the bank-rate field, in display order. */
export function listBanks(db: Executor): string[] {
  return db
    .select({ name: chineseBanks.name })
    .from(chineseBanks)
    .orderBy(asc(chineseBanks.position))
    .all()
    .map((b) => b.name);
}

/** FR-027: channel names (null = translated default), the default plan copied to new orders, and the bank list. */
export function getPaymentSettings(db: Executor): PaymentSettings {
  const row = readPaymentSettings(db);
  return {
    channelNames: { direct: row.directChannelName, bank: row.bankChannelName },
    defaultPlan: db
      .select()
      .from(defaultPaymentStages)
      .orderBy(asc(defaultPaymentStages.position))
      .all()
      .map((s) => ({ type: s.type, channel: s.channel, percent: formatPercent(s.percentBp), dueBeforeStatus: s.dueBeforeStatus })),
    banks: listBanks(db),
  };
}

type SettingsPatch = z.output<typeof paymentSettingsPatchSchema>;

/**
 * Change any of the three parts. A replaced bank list keeps its order; payments store bank names as text, so a
 * removed bank stays on past payments. One `settings.updated` audit entry with the parts that changed.
 */
export function updatePaymentSettings(deps: Deps, patch: SettingsPatch, actor: UserRow, ctx: RequestCtx): PaymentSettings {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const before = getPaymentSettings(tx);
    const now = clock.now();
    if (patch.channelNames) {
      const names = { ...before.channelNames, ...stripUndefined(patch.channelNames) };
      tx.update(paymentSettings)
        .set({ directChannelName: names.direct, bankChannelName: names.bank, updatedAt: now, updatedBy: actor.id })
        .where(eq(paymentSettings.id, 1))
        .run();
    }
    if (patch.defaultPlan) {
      tx.delete(defaultPaymentStages).run();
      tx.insert(defaultPaymentStages)
        .values(
          patch.defaultPlan.map((s, position) => ({
            id: newId(),
            position,
            type: s.type,
            channel: s.channel,
            percentBp: parsePercent(s.percent),
            dueBeforeStatus: s.dueBeforeStatus ?? null,
          })),
        )
        .run();
    }
    if (patch.banks) {
      tx.delete(chineseBanks).run();
      if (patch.banks.length > 0) {
        tx.insert(chineseBanks)
          .values(patch.banks.map((name, position) => ({ id: newId(), name, position, createdAt: now })))
          .run();
      }
    }
    const after = getPaymentSettings(tx);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'settings.updated',
      targetType: 'payment_settings',
      targetId: '1',
      ctx,
      before: { ...before },
      after: { ...after },
    });
  });
  return getPaymentSettings(db);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<{ [K in keyof T]: Exclude<T[K], undefined> }> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<{
    [K in keyof T]: Exclude<T[K], undefined>;
  }>;
}
