import type { UpdateSettingsRequest } from '@hanjing/shared';
import { asc, eq } from 'drizzle-orm';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { DB, Executor } from '../db/client';
import { companySettings, currencies, type CompanySettingsRow, type CurrencyRow, type UserRow } from '../db/schema';
import type { RequestCtx } from '../lib/requestContext';

const cache = new WeakMap<DB, CompanySettingsRow>();

/** Settings are read on every authenticated request (idle timeout), so they are cached per database. */
export function getSettings(db: DB): CompanySettingsRow {
  const cached = cache.get(db);
  if (cached) return cached;
  const row = db.select().from(companySettings).where(eq(companySettings.id, 1)).get();
  if (!row) throw new Error('company_settings row missing — migrations not applied');
  cache.set(db, row);
  return row;
}

export function invalidateSettingsCache(db: DB): void {
  cache.delete(db);
}

export function getIdleTimeoutMs(db: DB): number {
  return getSettings(db).sessionIdleTimeoutMinutes * 60_000;
}

export function listCurrencies(db: Executor): CurrencyRow[] {
  return db.select().from(currencies).orderBy(asc(currencies.sortOrder)).all();
}

/** Update settings and audit only the changed fields. Call invalidateSettingsCache after the transaction commits. */
export function updateSettings(
  tx: Executor,
  clock: Clock,
  patch: UpdateSettingsRequest,
  actor: UserRow,
  ctx: RequestCtx,
): CompanySettingsRow {
  const before = tx.select().from(companySettings).where(eq(companySettings.id, 1)).get();
  if (!before) throw new Error('company_settings row missing');
  const values: Partial<CompanySettingsRow> = {};
  if (patch.companyName !== undefined) values.companyName = patch.companyName;
  if (patch.sessionIdleTimeoutMinutes !== undefined)
    values.sessionIdleTimeoutMinutes = patch.sessionIdleTimeoutMinutes;
  if (patch.orderNumberPrefix !== undefined) values.orderNumberPrefix = patch.orderNumberPrefix;
  if (patch.registrationOpen !== undefined) values.registrationOpen = patch.registrationOpen;
  if (Object.keys(values).length === 0) return before;

  const after = tx
    .update(companySettings)
    .set({ ...values, updatedAt: clock.now(), updatedBy: actor.id })
    .where(eq(companySettings.id, 1))
    .returning()
    .get();

  recordAudit(tx, clock, {
    actorUserId: actor.id,
    actorLabel: actor.username,
    action: 'settings.updated',
    targetType: 'settings',
    targetId: '1',
    ctx,
    before: {
      companyName: before.companyName,
      sessionIdleTimeoutMinutes: before.sessionIdleTimeoutMinutes,
      orderNumberPrefix: before.orderNumberPrefix,
      registrationOpen: before.registrationOpen,
    },
    after: {
      companyName: after.companyName,
      sessionIdleTimeoutMinutes: after.sessionIdleTimeoutMinutes,
      orderNumberPrefix: after.orderNumberPrefix,
      registrationOpen: after.registrationOpen,
    },
  });
  return after;
}
