import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { ensureSetupCode } from './auth/setup';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { openDb, runMigrations } from './db/client';
import { consoleLogger } from './deps';
import { createGeoLookup } from './lib/geo';

const log = consoleLogger;
const config = loadConfig();
const { db } = openDb(resolve(config.dataDir, 'app.db'));
runMigrations(db);
const geo = await createGeoLookup(config.geoDbPath);
await ensureSetupCode(db, config, log);

const app = createApp({ db, clock: systemClock, config, geo, log });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info(`[server] listening on http://localhost:${info.port} (${config.nodeEnv})`);
});
