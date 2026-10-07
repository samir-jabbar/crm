import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { notDeleted, restore, softDelete, softDeleteColumns } from '../../src/softDelete';
import { auditActions, createTestContext } from '../helpers';

/** Test-only table: business tables arrive in features 002–004. */
const fixtureItems = sqliteTable('fixture_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ...softDeleteColumns(),
});

const ctxInfo = { ip: '203.0.113.1', userAgent: 'test', deviceLabel: 'Test', location: null };

async function setup() {
  const t = await createTestContext();
  await t.createOwner();
  t.sqlite.exec(
    'create table fixture_items (id text primary key, name text not null, deleted_at integer, deleted_by text references users(id))',
  );
  t.db.insert(fixtureItems).values([
    { id: 'a', name: 'Excavator' },
    { id: 'b', name: 'Crusher' },
  ]).run();
  const owner = t.sqlite.prepare("select id, username from users where role = 'owner'").get() as { id: string; username: string };
  const visible = () => t.db.select().from(fixtureItems).where(notDeleted(fixtureItems)).all().map((r) => r.id);
  return { ...t, owner, visible };
}

// Quickstart Q19 / FR-024.
describe('recoverable deletion', () => {
  it('hides a deleted record from default queries and audits it', async () => {
    const t = await setup();
    expect(t.db.transaction((tx) => softDelete(tx, t.clock, fixtureItems, 'fixture', 'a', t.owner, ctxInfo))).toBe(true);
    expect(t.visible()).toEqual(['b']);
    const row = t.sqlite.prepare("select deleted_by from fixture_items where id = 'a'").get();
    expect(row).toEqual({ deleted_by: t.owner.id });
    expect(auditActions(t)).toContain('record.deleted');
  });

  it('restores a deleted record and audits it', async () => {
    const t = await setup();
    t.db.transaction((tx) => softDelete(tx, t.clock, fixtureItems, 'fixture', 'a', t.owner, ctxInfo));
    expect(t.db.transaction((tx) => restore(tx, t.clock, fixtureItems, 'fixture', 'a', t.owner, ctxInfo))).toBe(true);
    expect(t.visible().sort()).toEqual(['a', 'b']);
    expect(auditActions(t)).toContain('record.restored');
  });

  it('is idempotent: deleting twice or restoring a live record changes nothing', async () => {
    const t = await setup();
    t.db.transaction((tx) => softDelete(tx, t.clock, fixtureItems, 'fixture', 'a', t.owner, ctxInfo));
    expect(t.db.transaction((tx) => softDelete(tx, t.clock, fixtureItems, 'fixture', 'a', t.owner, ctxInfo))).toBe(false);
    expect(t.db.transaction((tx) => restore(tx, t.clock, fixtureItems, 'fixture', 'b', t.owner, ctxInfo))).toBe(false);
    expect(auditActions(t).filter((a) => a.startsWith('record.'))).toEqual(['record.deleted']);
  });
});
