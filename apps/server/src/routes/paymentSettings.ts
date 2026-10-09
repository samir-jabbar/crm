import { paymentSettingsPatchSchema, type PaymentSettings } from '@hanjing/shared';
import type { Hono } from 'hono';
import type { UserRow } from '../db/schema';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { parseWith, readJsonBody } from '../lib/validate';
import { getPaymentSettings, updatePaymentSettings } from '../payments/settings';
import { requireChannel } from '../policy/authorize';
import { presentPaymentSettings } from '../policy/present';
import { route } from '../policy/route';

/** 005 FR-009: payment settings name and plan both channels, so they need access to both. */
function requireBothChannels(user: UserRow | null): void {
  requireChannel(user, 'direct', 'view');
  requireChannel(user, 'bank', 'view');
}

/** 004 FR-027: channel names, the default plan and the list of Chinese banks. Settings, with both channels (005). */
export function registerPaymentSettingsRoutes(app: Hono<AppEnv>, deps: Deps): void {
  route(app, 'GET', '/api/settings/payments', { module: 'settings', action: 'view' }, (c) => {
    requireBothChannels(c.get('user'));
    return c.json<PaymentSettings>(presentPaymentSettings(getPaymentSettings(deps.db), { viewer: c.get('user')! }));
  });

  route(app, 'PATCH', '/api/settings/payments', { module: 'settings', action: 'edit' }, async (c) => {
    requireBothChannels(c.get('user'));
    const patch = parseWith(paymentSettingsPatchSchema, await readJsonBody(c));
    const settings = updatePaymentSettings(deps, patch, c.get('user')!, c.get('reqCtx'));
    return c.json<PaymentSettings>(presentPaymentSettings(settings, { viewer: c.get('user')! }));
  });
}
