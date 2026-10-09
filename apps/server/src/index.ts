import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { ensureSetupCode } from './auth/setup';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { openDb, runMigrations } from './db/client';
import { consoleLogger, type Deps } from './deps';
import { removeOrphans } from './files/store';
import { createGeoLookup } from './lib/geo';

const log = consoleLogger;
const config = loadConfig();
const { db } = openDb(resolve(config.dataDir, 'app.db'));
const migrated = runMigrations(db);
if (migrated.backup) log.info(`[db] copied the database to ${migrated.backup} before ${migrated.applied} migration(s)`);
const geo = await createGeoLookup(config.geoDbPath);
await ensureSetupCode(db, config, log);

const deps: Deps = { db, clock: systemClock, config, geo, log, http: globalThis.fetch };
removeOrphans(deps); // 003 R7: drop receipt uploads that were never attached
const app = createApp(deps);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info(`[server] listening on http://localhost:${info.port} (${config.nodeEnv})`);
});
