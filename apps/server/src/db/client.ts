import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { normalizeForSearch } from '@hanjing/shared';
import { SERVER_ROOT } from '../config';
import * as schema from './schema';

export type Schema = typeof schema;
export type DB = BetterSQLite3Database<Schema>;
/** A database or an open transaction — every write helper accepts either. */
export type Executor = BaseSQLiteDatabase<'sync', Database.RunResult, Schema>;

export const MIGRATIONS_DIR = resolve(SERVER_ROOT, 'drizzle');

export interface OpenedDb {
  db: DB;
  sqlite: Database.Database;
}

/** Open (or create) the SQLite database. Pass ':memory:' for tests. */
export function openDb(path: string): OpenedDb {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  // Cross-script search (002 research R3): same normalization as the client's normalizeForSearch.
  sqlite.function('hj_norm', { deterministic: true }, (value: unknown) =>
    value === null || value === undefined ? null : normalizeForSearch(String(value)),
  );
  const db = drizzle({ client: sqlite, schema });
  return { db, sqlite };
}

export function runMigrations(db: DB): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
