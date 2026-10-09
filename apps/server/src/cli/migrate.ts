import { resolve } from 'node:path';
import { loadConfig } from '../config';
import { openDb, runMigrations } from '../db/client';

const config = loadConfig();
const dbPath = resolve(config.dataDir, 'app.db');
const { db, sqlite } = openDb(dbPath);
const { applied, backup } = runMigrations(db);
sqlite.close();
if (backup) console.log(`[migrate] copied the database to ${backup} first`);
console.log(`[migrate] ${dbPath} is up to date (${applied} migration(s) applied)`);
