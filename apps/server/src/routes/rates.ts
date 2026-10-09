import { rateQuerySchema, rateSettingsPatchSchema, type RateConfig, type RateQuote, type RateSettings, type RefreshResult } from '@hanjing/shared';
import type { Hono } from 'hono';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { parseWith, readJsonBody } from '../lib/validate';
import { presentRateQuote, presentRateSettings } from '../policy/present';
import { route } from '../policy/route';
import { getRate, getRateConfig, getRateSettings, refreshLatest, updateRateSettings } from '../rates/service';

/**
 * 003 FR-014 – FR-018. Market rates are not sensitive and every rate field needs them, so reading a rate and the
 * auto-fill switch only needs a session (research R10); settings and refresh are the Owner's.
 */
export function registerRateRoutes(app: Hono<AppEnv>, deps: Deps): void {
  route(app, 'GET', '/api/rates', 'authenticated', async (c) => {
    const { currency, date } = parseWith(rateQuerySchema, c.req.query());
    return c.json<RateQuote>(presentRateQuote(await getRate(deps, currency, date), { viewer: c.get('user')! }));
  });

  route(app, 'GET', '/api/rates/config', 'authenticated', (c) => c.json<RateConfig>(getRateConfig(deps)));

  // 005 FR-009: the exchange-rate settings belong to the Exchange rates module.
  route(app, 'POST', '/api/rates/refresh', { module: 'rates', action: 'edit' }, async (c) => c.json<RefreshResult>(await refreshLatest(deps)));

  route(app, 'GET', '/api/settings/exchange-rates', { module: 'rates', action: 'view' }, (c) =>
    c.json<RateSettings>(presentRateSettings(getRateSettings(deps), { viewer: c.get('user')! })),
  );

  route(app, 'PATCH', '/api/settings/exchange-rates', { module: 'rates', action: 'edit' }, async (c) => {
    const viewer = c.get('user')!;
    const patch = parseWith(rateSettingsPatchSchema, await readJsonBody(c));
    return c.json<RateSettings>(presentRateSettings(updateRateSettings(deps, patch, viewer, c.get('reqCtx')), { viewer }));
  });
}
