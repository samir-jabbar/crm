import { updateSettingsRequestSchema } from '@hanjing/shared';
import type { Hono } from 'hono';
import type { Deps } from '../deps';
import { previewNextOrderNumber } from '../orders/numbering';
import type { AppEnv } from '../env';
import { parseWith, readJsonBody } from '../lib/validate';
import { presentSettings } from '../policy/present';
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

  route(app, 'GET', '/api/settings', 'owner', (c) => c.json(present(c.get('user')!)));

  route(app, 'PATCH', '/api/settings', 'owner', async (c) => {
    const user = c.get('user')!;
    const patch = parseWith(updateSettingsRequestSchema, await readJsonBody(c));
    db.transaction((tx) => updateSettings(tx, clock, patch, user, c.get('reqCtx')));
    invalidateSettingsCache(db);
    return c.json(present(user));
  });
}
