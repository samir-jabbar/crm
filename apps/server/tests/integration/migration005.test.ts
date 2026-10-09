import { permissionConflict, permissionSetSchema, TEMPLATE_KEYS } from '@hanjing/shared';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, inject } from 'vitest';
import { openDb, runMigrations } from '../../src/db/client';
import { migrationsAt } from '../migrationsAt';

// 005 quickstart W24: workers and permissions on top of a 004 database.
describe('upgrading a 004 database', () => {
  it('keeps the Owner and its protections, and seeds the five templates', () => {
    const root = mkdtempSync(join(inject('dataRoot'), 'mig-'));
    const backupsDir = join(root, 'backups');
    const { db, sqlite } = openDb(join(root, 'app.db'));
    runMigrations(db, { migrationsFolder: migrationsAt(root, 7), backupsDir });
    sqlite.exec(`
      insert into users (id, username, username_normalized, display_name, password_hash, role, status, language,
        password_changed_at, created_at, updated_at)
        values ('owner', 'hicham', 'hicham', 'Hicham', 'x', 'owner', 'active', 'en', 0, 0, 0);
      insert into customers (id, name, created_at, updated_at, created_by) values ('c1', 'Atlas', 0, 0, 'owner');`);

    const upgrade = runMigrations(db, { backupsDir });
    expect(upgrade.applied).toBe(2);
    expect(existsSync(upgrade.backup!)).toBe(true);
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);

    // The Owner is unchanged, gets the defaults, and stays protected (001 FR-004).
    expect(sqlite.prepare("select status, order_scope as scope, own_entries_only as own, permissions from users where id = 'owner'").get()).toEqual({
      status: 'active',
      scope: 'all',
      own: 0,
      permissions: null,
    });
    expect(() => sqlite.prepare("update users set status = 'suspended' where id = 'owner'").run()).toThrow(/owner_protected/);
    expect(() => sqlite.prepare("delete from users where id = 'owner'").run()).toThrow(/owner_protected/);
    expect(() => sqlite.prepare("update users set order_scope = 'everything' where id = 'owner'").run()).toThrow(/CHECK/);
    expect(sqlite.prepare('select registration_open as open from company_settings').get()).toEqual({ open: 1 });

    // Five templates, each a valid, normalized permission set with no conflict and no Direct payments.
    const templates = sqlite.prepare('select default_key as key, name, permissions, order_scope as scope, own_entries_only as own from role_templates order by id').all() as {
      key: string;
      name: string | null;
      permissions: string;
      scope: string;
      own: number;
    }[];
    expect(templates.map((t) => t.key).sort()).toEqual([...TEMPLATE_KEYS].sort());
    for (const t of templates) {
      const stored = JSON.parse(t.permissions);
      const parsed = permissionSetSchema.parse(stored);
      expect(parsed, t.key).toEqual(stored);
      expect(permissionConflict(parsed), t.key).toBeNull();
      expect(parsed.modules['payments.direct'], t.key).toBeUndefined();
      expect(t.name).toBeNull();
    }
    expect(templates.find((t) => t.key === 'site_assistant')).toMatchObject({ scope: 'assigned', own: 1 });
    expect(templates.find((t) => t.key === 'logistics')).toMatchObject({ scope: 'assigned', own: 0 });
    sqlite.close();
  });
});
