import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { normalizeForSearch } from '@hanjing/shared';
import { SERVER_ROOT } from '../config';
import * as schema from './schema';

export type Schema = typeof schema;
/** As returned by `drizzle()`: the query builder plus the raw better-sqlite3 handle (`$client`). */
export type DB = BetterSQLite3Database<Schema> & { $client: Database.Database };
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

export interface MigrationOptions {
  migrationsFolder?: string;
  /** Where the pre-migration copy goes. Default: `backups/` next to the database file (i.e. `DATA_DIR/backups`). */
  backupsDir?: string;
}

export interface MigrationResult {
  applied: number;
  /** Path of the copy made before migrating, when the database had data and migrations were pending. */
  backup: string | null;
}

function lastAppliedMigration(sqlite: Database.Database): number | null {
  const table = sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'").get();
  if (!table) return null;
  const row = sqlite.prepare('select max(created_at) as last from __drizzle_migrations').get() as { last: number | null };
  return row.last === null ? null : Number(row.last);
}

/**
 * Apply pending migrations following SQLite's documented procedure for table changes (004 research R7):
 * foreign keys off *outside* any transaction, migrate, `foreign_key_check`, foreign keys back on.
 * Drizzle runs every migration in one transaction, where `PRAGMA foreign_keys` is ignored, so without this a
 * generated table rebuild cannot drop a table that others reference. A copy of the database is made first
 * whenever migrations are pending on a database that already has data (constitution IV).
 */
export function runMigrations(db: DB, options: MigrationOptions = {}): MigrationResult {
  const sqlite = db.$client;
  const migrationsFolder = options.migrationsFolder ?? MIGRATIONS_DIR;
  const last = lastAppliedMigration(sqlite);
  const pending = readMigrationFiles({ migrationsFolder }).filter((m) => last === null || m.folderMillis > last).length;

  let backup: string | null = null;
  if (pending > 0 && last !== null && !sqlite.memory) {
    const dir = options.backupsDir ?? resolve(dirname(sqlite.name), 'backups');
    mkdirSync(dir, { recursive: true });
    backup = resolve(dir, `pre-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    sqlite.prepare('VACUUM INTO ?').run(backup);
  }

  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder });
    const broken = sqlite.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) {
      throw new Error(`Migrations left broken references, refusing to start: ${JSON.stringify(broken.slice(0, 20))}`);
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
  return { applied: pending, backup };
}
