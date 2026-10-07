import { describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers';

// Quickstart Q6 / FR-004: database-level protection of the Owner.
describe('owner protection', () => {
  it('cannot be deleted, demoted, suspended or duplicated, even with direct SQL', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const db = ctx.sqlite;
    expect(() => db.prepare("delete from users where role = 'owner'").run()).toThrow(/owner_protected/);
    expect(() => db.prepare("update users set role = 'worker' where role = 'owner'").run()).toThrow(/owner_protected/);
    expect(() => db.prepare("update users set status = 'suspended' where role = 'owner'").run()).toThrow(
      /owner_protected/,
    );
    expect(() =>
      db
        .prepare(
          `insert into users (id, username, username_normalized, display_name, password_hash, role, status, language,
             password_changed_at, created_at, updated_at)
           values ('x', 'second', 'second', 'Second', 'h', 'owner', 'active', 'en', 0, 0, 0)`,
        )
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it('still allows ordinary profile changes', async () => {
    const ctx = await createTestContext();
    await ctx.createOwner();
    const result = ctx.sqlite.prepare("update users set display_name = 'Hicham J.' where role = 'owner'").run();
    expect(result.changes).toBe(1);
  });
});
