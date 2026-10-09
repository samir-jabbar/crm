import { updateSettingsRequestSchema } from '@hanjing/shared';
import type { Hono } from 'hono';
import type { Deps } from '../deps';
import { previewNextOrderNumber } from '../orders/numbering';
import type { AppEnv } from '../env';
import { parseWith, readJsonBody } from '../lib/validate';
import { presentSettings } from '../policy/present';
import { requireOwner } from '../policy/authorize';
import { route } from '../policy/route';
import { getSettings, invalidateSettingsCache, listCurrencies, updateSettings } from '../settings/service';

/** FR-035 – FR-037: company name and session timeout. The base currency is fixed to CNY (D1). */
export function registerSettingsRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db, clock } = deps;

  const present = (viewer: Parameters<typeof presentSettings>[3]['viewer']) => {
    const settings = getSettings(db);
    const next = previewNextOrderNumber(db, clock, settings.orderNumberPrefix);
    return presentSettings(settings, listCurrencies(db), next, { viewer });
  };

  // 005 FR-009, FR-011: business settings are grantable; the security settings stay the Owner's.
  route(app, 'GET', '/api/settings', { module: 'settings', action: 'view' }, (c) => c.json(present(c.get('user')!)));

  route(app, 'PATCH', '/api/settings', { module: 'settings', action: 'edit' }, async (c) => {
    const user = c.get('user')!;
    const patch = parseWith(updateSettingsRequestSchema, await readJsonBody(c));
    if (patch.sessionIdleTimeoutMinutes !== undefined || patch.registrationOpen !== undefined) requireOwner(user);
    db.transaction((tx) => updateSettings(tx, clock, patch, user, c.get('reqCtx')));
    invalidateSettingsCache(db);
    return c.json(present(user));
  });
}
