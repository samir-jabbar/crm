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
  };
}
