import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, inject } from 'vitest';
import { openDb, runMigrations } from '../../src/db/client';
import { migrationsAt } from '../migrationsAt';

const migrationsAt003 = (root: string) => migrationsAt(root, 5);

// 004 quickstart P21 / research R7: the 004 migrations rebuild `files`, which expenses reference.
describe('upgrading a 003 database', () => {
  it('keeps every link, plans existing orders, and copies the database first', () => {
    const root = mkdtempSync(join(inject('dataRoot'), 'mig-'));
    const backupsDir = join(root, 'backups');
    const { db, sqlite } = openDb(join(root, 'app.db'));

    // A brand-new database has nothing to copy.
    const initial = runMigrations(db, { migrationsFolder: migrationsAt003(root), backupsDir });
    expect(initial.backup).toBeNull();

    // 003-era data: an order with an expense that has a receipt.
    sqlite.exec(`
      insert into users (id, username, username_normalized, display_name, password_hash, role, status, language,
        password_changed_at, created_at, updated_at)
        values ('u1', 'hicham', 'hicham', 'Hicham', 'x', 'worker', 'active', 'en', 0, 0, 0);
      insert into customers (id, name, created_at, updated_at, created_by) values ('c1', 'MJTR Gold', 0, 0, 'u1');
      insert into orders (id, number, number_year, number_seq, title, customer_id, agreed_price_minor, currency,
        agreed_rate_micro, created_at, updated_at, created_by)
        values ('o1', 'HJ-2026-001', 2026, 1, 'Excavators', 'c1', 19000000, 'USD', 7100000, 0, 0, 'u1');
      insert into files (id, kind, mime, size_bytes, sha256, created_by, created_at)
        values ('f1', 'receipt', 'image/jpeg', 10, 'x', 'u1', 0);
      insert into expenses (id, order_id, name, category_id, amount_minor, currency, rate_micro, rate_source, cny_minor,
        expense_date, receipt_file_id, created_at, updated_at, created_by, updated_by)
        values ('e1', 'o1', 'Trucking', 'cat-inland_transport_china', 350000, 'CNY', 1000000, 'manual', 350000,
          '2026-10-07', 'f1', 0, 0, 'u1', 'u1');
    `);

    // Up to the end of 004 only: 005 has its own test.
    const upgrade = runMigrations(db, { migrationsFolder: migrationsAt(root, 7), backupsDir });
    expect(upgrade.applied).toBe(2);
    expect(upgrade.backup).not.toBeNull();
    expect(existsSync(upgrade.backup!)).toBe(true);

    // The expense still points at its receipt, and the receipt is untouched.
    expect(sqlite.prepare("select receipt_file_id as f from expenses where id = 'e1'").get()).toEqual({ f: 'f1' });
    expect(sqlite.prepare("select kind from files where id = 'f1'").get()).toEqual({ kind: 'receipt' });
    // The existing order received the default plan.
    expect(sqlite.prepare("select type, channel, percent_bp as bp, due_before_status as due from order_payment_stages where order_id = 'o1' order by position").all()).toEqual([
      { type: 'deposit', channel: 'direct', bp: 3000, due: 'in_production' },
      { type: 'balance', channel: 'bank', bp: 7000, due: 'on_vessel' },
    ]);
    expect(sqlite.prepare('select count(*) as n from payment_settings').get()).toEqual({ n: 1 });
    expect(sqlite.prepare('select count(*) as n from default_payment_stages').get()).toEqual({ n: 2 });
    expect((sqlite.prepare('select name from chinese_banks order by position').all() as { name: string }[]).map((r) => r.name)).toEqual([
      'Bank of China',
      'ICBC',
      'ABC',
      'CCB',
    ]);

    // Links are checked again, enforcement is back on, and the new file kind is allowed.
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(() => sqlite.prepare("delete from files where id = 'f1'").run()).toThrow(/FOREIGN KEY/);
    sqlite.prepare("insert into files (id, kind, mime, size_bytes, sha256, created_by, created_at) values ('f2', 'payment_proof', 'image/png', 5, 'y', 'u1', 0)").run();
    expect(() =>
      sqlite.prepare("insert into files (id, kind, mime, size_bytes, sha256, created_by, created_at) values ('f3', 'invoice', 'image/png', 5, 'y', 'u1', 0)").run(),
    ).toThrow(/CHECK/);

    // Nothing pending: no new copy.
    const again = runMigrations(db, { migrationsFolder: migrationsAt(root, 7), backupsDir });
    expect(again).toEqual({ applied: 0, backup: null });
    expect(readdirSync(backupsDir).filter((name) => name.startsWith('pre-migration-'))).toHaveLength(1);
    sqlite.close();
  });

  it('refuses to start when a migration leaves a broken reference', () => {
    const root = mkdtempSync(join(inject('dataRoot'), 'mig-'));
    const { db, sqlite } = openDb(join(root, 'app.db'));
    const folder = migrationsAt003(root);
    runMigrations(db, { migrationsFolder: folder, backupsDir: join(root, 'backups') });
    // A broken link that only a migration could create, with foreign keys off.
    sqlite.pragma('foreign_keys = OFF');
    sqlite.exec(`insert into users (id, username, username_normalized, display_name, password_hash, role, status, language,
        password_changed_at, created_at, updated_at) values ('u1', 'a', 'a', 'A', 'x', 'worker', 'active', 'en', 0, 0, 0);
      insert into customers (id, name, created_at, updated_at, created_by) values ('c1', 'X', 0, 0, 'u1');
      insert into orders (id, number, number_year, number_seq, title, customer_id, agreed_price_minor, currency, created_at,
        updated_at, created_by) values ('o1', 'HJ-2026-001', 2026, 1, 'T', 'missing-customer', 1, 'CNY', 0, 0, 'u1');`);
    sqlite.pragma('foreign_keys = ON');
    expect(() => runMigrations(db, { backupsDir: join(root, 'backups') })).toThrow(/broken references/);
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    sqlite.close();
  });
});
