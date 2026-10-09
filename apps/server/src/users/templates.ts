import { normalizeForSearch, permissionConflict, TEMPLATE_KEYS, type createTemplateRequestSchema, type templateInputSchema } from '@hanjing/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { recordAudit } from '../audit/record';
import type { Executor } from '../db/client';
import { roleTemplates, type RoleTemplateRow, type UserRow } from '../db/schema';
import type { Deps } from '../deps';
import { AppError, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';
import { parsePermissions } from '../policy/access';

type TemplateInput = z.output<typeof templateInputSchema>;
type CreateTemplateInput = z.output<typeof createTemplateRequestSchema>;

/** Live templates: the five defaults first (in FR-015's order), then the Owner's own by creation. */
export function listTemplates(db: Executor): RoleTemplateRow[] {
  return db
    .select()
    .from(roleTemplates)
    .where(isNull(roleTemplates.deletedAt))
    .orderBy(
      sql`case ${roleTemplates.defaultKey} ${sql.join(
        TEMPLATE_KEYS.map((key, i) => sql`when ${key} then ${i}`),
        sql` `,
      )} else ${TEMPLATE_KEYS.length} end`,
      asc(roleTemplates.createdAt),
      asc(roleTemplates.id),
    )
    .all();
}

function requireLiveTemplate(db: Executor, id: string): RoleTemplateRow {
  const row = db.select().from(roleTemplates).where(and(eq(roleTemplates.id, id), isNull(roleTemplates.deletedAt))).get();
  if (!row) throw notFound();
  return row;
}

/** FR-032 for templates; names are unique among live templates, ignoring capitals and accents. */
function check(db: Executor, input: TemplateInput, exceptId?: string): void {
  const conflict = permissionConflict(input.permissions);
  if (conflict) throw new AppError(400, 'permission_conflict', { reason: conflict });
  if (input.name === null) return;
  const wanted = normalizeForSearch(input.name);
  const clash = listTemplates(db).some((t) => t.id !== exceptId && t.name !== null && normalizeForSearch(t.name) === wanted);
  if (clash) throw new AppError(400, 'validation_failed', { fields: { name: 'name_invalid' } });
}

const snapshot = (row: RoleTemplateRow) => ({
  name: row.name,
  permissions: parsePermissions(row.permissions),
  orderScope: row.orderScope,
  ownEntriesOnly: row.ownEntriesOnly,
});

export function createTemplate(deps: Deps, input: CreateTemplateInput, actor: UserRow, ctx: RequestCtx): RoleTemplateRow {
  const { db, clock } = deps;
  return db.transaction((tx) => {
    check(tx, input);
    const now = clock.now();
    const row = tx
      .insert(roleTemplates)
      .values({
        id: newId(),
        name: input.name,
        permissions: JSON.stringify(input.permissions),
        orderScope: input.orderScope,
        ownEntriesOnly: input.ownEntriesOnly,
        createdAt: now,
        updatedAt: now,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning()
      .get();
    recordAudit(tx, clock, { actorUserId: actor.id, actorLabel: actor.username, action: 'template.created', targetType: 'role_template', targetId: row.id, ctx, after: snapshot(row) });
    return row;
  });
}

/** Changing a template never changes workers already set up with it (FR-017). A null name on a default restores it. */
export function updateTemplate(deps: Deps, id: string, input: TemplateInput, actor: UserRow, ctx: RequestCtx): RoleTemplateRow {
  const { db, clock } = deps;
  return db.transaction((tx) => {
    const before = requireLiveTemplate(tx, id);
    if (input.name === null && before.defaultKey === null) throw new AppError(400, 'validation_failed', { fields: { name: 'name_invalid' } });
    check(tx, input, id);
    const after = tx
      .update(roleTemplates)
      .set({
        name: input.name,
        permissions: JSON.stringify(input.permissions),
        orderScope: input.orderScope,
        ownEntriesOnly: input.ownEntriesOnly,
        updatedAt: clock.now(),
        updatedBy: actor.id,
      })
      .where(eq(roleTemplates.id, id))
      .returning()
      .get();
    recordAudit(tx, clock, {
      actorUserId: actor.id,
      actorLabel: actor.username,
      action: 'template.updated',
      targetType: 'role_template',
      targetId: id,
      ctx,
      before: snapshot(before),
      after: snapshot(after),
    });
    return after;
  });
}

/** Soft delete: workers keep their copy, and their page shows the template as deleted. */
export function deleteTemplate(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const before = requireLiveTemplate(tx, id);
    tx.update(roleTemplates).set({ deletedAt: clock.now(), updatedBy: actor.id }).where(eq(roleTemplates.id, id)).run();
    recordAudit(tx, clock, { actorUserId: actor.id, actorLabel: actor.username, action: 'template.deleted', targetType: 'role_template', targetId: id, ctx, before: snapshot(before) });
  });
}
