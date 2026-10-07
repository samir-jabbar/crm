import { resolve } from 'node:path';
import { loadConfig } from '../config';
import { openDb, runMigrations } from '../db/client';

const config = loadConfig();
const dbPath = resolve(config.dataDir, 'app.db');
const { db, sqlite } = openDb(dbPath);
runMigrations(db);
sqlite.close();
console.log(`[migrate] ${dbPath} is up to date`);
