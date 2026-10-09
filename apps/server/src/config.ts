import { REGISTRATION_THROTTLE } from '@hanjing/shared';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
/** apps/server */
export const SERVER_ROOT = resolve(here, '..');

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATA_DIR: z.string().min(1).default(resolve(SERVER_ROOT, 'data')),
  /** Comma-separated list of origins allowed to send state-changing requests. */
  APP_ORIGIN: z.string().min(1).default('http://localhost:5173,http://localhost:3000'),
  TRUST_PROXY: bool.default(false),
  SETUP_CODE: z.string().trim().min(8).optional(),
  GEO_DB_PATH: z.string().min(1).optional(),
  WEB_DIST_DIR: z.string().min(1).default(resolve(SERVER_ROOT, '..', 'web', 'dist')),
  /** 003 R3: each provider call gives up after this long, so the "unavailable" message shows within 5 s. */
  RATE_FETCH_TIMEOUT_MS: z.coerce.number().int().min(1).max(60_000).default(5000),
  /** Currency API URL templates, tried in order (`{date}` = `latest` or `YYYY-MM-DD`). Overridable for mirrors and tests. */
  RATES_CURRENCY_API_URLS: z
    .string()
    .min(1)
    .default(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/v1/currencies/cny.json,' +
        'https://{date}.currency-api.pages.dev/v1/currencies/cny.json',
    ),
  RATES_EXCHANGERATE_API_URL: z.string().min(1).default('https://open.er-api.com/v6/latest/CNY'),
  /** 005 FR-006: registrations accepted per network origin per hour. Raise only for automated tests. */
  REGISTRATIONS_PER_HOUR: z.coerce.number().int().min(1).max(10_000).default(REGISTRATION_THROTTLE.max),
});

export interface Config {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  dataDir: string;
  appOrigins: string[];
  trustProxy: boolean;
  setupCode: string | undefined;
  geoDbPath: string;
  webDistDir: string;
  /** Serve the built web app from this process (production). */
  serveWeb: boolean;
  /** Secure cookies whenever the app is served over HTTPS. */
  cookieSecure: boolean;
  rateFetchTimeoutMs: number;
  currencyApiUrls: string[];
  exchangeRateApiUrl: string;
  registrationsPerHour: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const e = parsed.data;
  const dataDir = resolve(e.DATA_DIR);
  const appOrigins = e.APP_ORIGIN.split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    dataDir,
    appOrigins,
    trustProxy: e.TRUST_PROXY,
    setupCode: e.SETUP_CODE,
    geoDbPath: e.GEO_DB_PATH ? resolve(e.GEO_DB_PATH) : resolve(dataDir, 'geo', 'dbip-city-lite.mmdb'),
    webDistDir: resolve(e.WEB_DIST_DIR),
    serveWeb: e.NODE_ENV === 'production',
    cookieSecure: e.NODE_ENV === 'production' && appOrigins.every((o) => o.startsWith('https://')),
    rateFetchTimeoutMs: e.RATE_FETCH_TIMEOUT_MS,
    currencyApiUrls: e.RATES_CURRENCY_API_URLS.split(',')
      .map((u) => u.trim())
      .filter(Boolean),
    exchangeRateApiUrl: e.RATES_EXCHANGERATE_API_URL,
    registrationsPerHour: e.REGISTRATIONS_PER_HOUR,
  };
}
