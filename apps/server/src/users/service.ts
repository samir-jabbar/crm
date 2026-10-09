import { permissionConflict, type accessInputSchema, type PermissionSet } from '@hanjing/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import { recordAudit } from '../audit/record';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { customers, orderAssignments, userCustomers, users, type RoleTemplateRow, type UserRow } from '../db/schema';
import { checkPasswordPolicy, hashPassword } from '../auth/password';
import { revokeAllForUser } from '../auth/sessions';
import type { Deps } from '../deps';
import { AppError, forbidden, notFound } from '../lib/errors';
import type { RequestCtx } from '../lib/requestContext';
import { chinaToday, parsePermissions } from '../policy/access';
import { findLiveTemplate } from './query';

export type ParsedAccess = z.output<typeof accessInputSchema>;

/** A worker the Owner acts on: unknown ids are 404, the Owner itself is 403 (FR-040). */
export function requireTarget(db: Executor, id: string, options: { decided?: boolean } = {}): UserRow {
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) throw notFound();
  // A second approve/reject of a rejected registration says so; everything else ignores rejected accounts.
  if (user.rejectedAt !== null) throw options.decided ? new AppError(409, 'already_decided') : notFound();
  if (user.role === 'owner') throw forbidden();
  return user;
}

/** The template's access, as approving or "apply template" copies it (research R9). */
export function templateAccess(template: RoleTemplateRow): ParsedAccess {
  return {
    permissions: parsePermissions(template.permissions),
    orderScope: template.orderScope,
    ownEntriesOnly: template.ownEntriesOnly,
    customerIds: [],
    accessEndsOn: null,
  };
}

function requireTemplate(db: Executor, templateId: string): RoleTemplateRow {
  const template = findLiveTemplate(db, templateId);
  if (!template) throw new AppError(400, 'validation_failed', { fields: { templateId: 'template_invalid' } });
  return template;
}

/** FR-018, FR-023, FR-032: checks that need the database or today's date, on top of the schema. */
function checkAccess(tx: Executor, clock: Clock, access: ParsedAccess): string[] {
  const conflict = permissionConflict(access.permissions);
  if (conflict) throw new AppError(400, 'permission_conflict', { reason: conflict });
  if (access.accessEndsOn !== null && access.accessEndsOn < chinaToday(clock.now())) {
    throw new AppError(400, 'validation_failed', { fields: { accessEndsOn: 'date_invalid' } });
  }
  if (access.orderScope !== 'customers') return [];
  const ids = [...new Set(access.customerIds ?? [])];
  if (ids.length === 0) throw new AppError(400, 'validation_failed', { fields: { customerIds: 'scope_customers_required' } });
  const found = tx.select({ id: customers.id }).from(customers).where(and(inArray(customers.id, ids), isNull(customers.deletedAt))).all();
  if (found.length !== ids.length) throw new AppError(400, 'validation_failed', { fields: { customerIds: 'customer_invalid' } });
  return ids.sort();
}

const samePermissions = (a: PermissionSet, b: PermissionSet) => JSON.stringify(a) === JSON.stringify(b);

/** Did the Owner change the access after copying the template? (FR-017; the end date and customers don't count.) */
function differsFromTemplate(access: ParsedAccess, template: RoleTemplateRow | undefined): boolean {
  if (!template) return true;
  const copy = templateAccess(template);
  return !samePermissions(access.permissions, copy.permissions) || access.orderScope !== copy.orderScope || access.ownEntriesOnly !== copy.ownEntriesOnly;
}

/** The access as the audit log records it. */
export function accessSnapshot(tx: Executor, user: UserRow): Record<string, unknown> {
  const customerIds = tx.select({ id: userCustomers.customerId }).from(userCustomers).where(eq(userCustomers.userId, user.id)).all().map((r) => r.id).sort();
  return {
    permissions: parsePermissions(user.permissions),
    orderScope: user.orderScope,
    ownEntriesOnly: user.ownEntriesOnly,
    customerIds,
    accessEndsOn: user.accessEndsOn,
    templateId: user.templateId,
  };
}

/** Store a worker's access and their selected customers (replacing the previous ones). */
function writeAccess(tx: Executor, clock: Clock, user: UserRow, access: ParsedAccess, customerIds: string[], values: Partial<UserRow>): UserRow {
  const updated = tx
    .update(users)
    .set({
      permissions: JSON.stringify(access.permissions),
      orderScope: access.orderScope,
      ownEntriesOnly: access.ownEntriesOnly,
      accessEndsOn: access.accessEndsOn,
      updatedAt: clock.now(),
      ...values,
    })
    .where(eq(users.id, user.id))
    .returning()
    .get();
  tx.delete(userCustomers).where(eq(userCustomers.userId, user.id)).run();
  for (const customerId of customerIds) tx.insert(userCustomers).values({ userId: user.id, customerId }).run();
  return updated;
}

const actorOf = (actor: UserRow, ctx: RequestCtx) => ({ actorUserId: actor.id, actorLabel: actor.username, ctx });

/** FR-004: approve a pending registration with a template, optionally adjusted. */
export function approveUser(
  deps: Deps,
  id: string,
  input: { templateId: string; access?: ParsedAccess },
  actor: UserRow,
  ctx: RequestCtx,
): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const user = requireTarget(tx, id, { decided: true });
    if (user.status !== 'pending') throw new AppError(409, 'already_decided');
    const template = requireTemplate(tx, input.templateId);
    const access = input.access ?? templateAccess(template);
    const customerIds = checkAccess(tx, clock, access);
    const now = clock.now();
    const updated = writeAccess(tx, clock, user, access, customerIds, {
      status: 'active',
      templateId: template.id,
      permissionsAdjusted: input.access ? differsFromTemplate(access, template) : false,
      approvedAt: now,
      approvedBy: actor.id,
    });
    recordAudit(tx, clock, {
      ...actorOf(actor, ctx),
      action: 'user.approved',
      targetType: 'user',
      targetId: user.id,
      before: { status: 'pending' },
      after: { status: 'active', ...accessSnapshot(tx, updated) },
    });
  });
}

/** FR-005: reject a pending registration; its username becomes free again (research R6). */
export function rejectUser(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const user = requireTarget(tx, id, { decided: true });
    if (user.status !== 'pending') throw new AppError(409, 'already_decided');
    const now = clock.now();
    tx.update(users)
      .set({ status: 'deleted', rejectedAt: now, usernameNormalized: `!rejected:${user.id}`, updatedAt: now })
      .where(eq(users.id, user.id))
      .run();
    recordAudit(tx, clock, {
      ...actorOf(actor, ctx),
      action: 'user.rejected',
      targetType: 'user',
      targetId: user.id,
      before: { username: user.username, status: 'pending' },
    });
  });
}

/** FR-017, US2: replace a worker's access (any state but deleted). */
export function setUserAccess(deps: Deps, id: string, access: ParsedAccess, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const user = requireTarget(tx, id);
    if (user.status === 'deleted') throw notFound();
    const customerIds = checkAccess(tx, clock, access);
    const before = accessSnapshot(tx, user);
    const template = user.templateId ? findLiveTemplate(tx, user.templateId) : undefined;
    const updated = writeAccess(tx, clock, user, access, customerIds, { permissionsAdjusted: differsFromTemplate(access, template) });
    recordAudit(tx, clock, {
      ...actorOf(actor, ctx),
      action: 'user.access_changed',
      targetType: 'user',
      targetId: user.id,
      before,
      after: accessSnapshot(tx, updated),
    });
  });
}

/** FR-017: copy a template onto a worker again, keeping their end date. */
export function applyTemplate(deps: Deps, id: string, templateId: string, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const user = requireTarget(tx, id);
    if (user.status === 'deleted') throw notFound();
    const template = requireTemplate(tx, templateId);
    const access = { ...templateAccess(template), accessEndsOn: user.accessEndsOn };
    const before = accessSnapshot(tx, user);
    if (access.orderScope === 'customers') {
      // A template cannot hold customers: keep the worker's current selection.
      access.customerIds = before.customerIds as string[];
    }
    const customerIds = checkAccess(tx, clock, access);
    const updated = writeAccess(tx, clock, user, access, customerIds, { templateId: template.id, permissionsAdjusted: false });
    recordAudit(tx, clock, {
      ...actorOf(actor, ctx),
      action: 'user.access_changed',
      targetType: 'user',
      targetId: user.id,
      before,
      after: accessSnapshot(tx, updated),
    });
  });
}

// ── Account actions (US6, FR-035 – FR-040) ─────────────────────────────────

/** A worker the Owner may act on: not deleted (rejected or deleted accounts answer 404). */
function requireLiveTarget(tx: Executor, id: string): UserRow {
  const user = requireTarget(tx, id);
  if (user.status === 'deleted') throw notFound();
  return user;
}

const auditUser = (tx: Executor, clock: Clock, actor: UserRow, ctx: RequestCtx, action: Parameters<typeof recordAudit>[2]['action'], user: UserRow, before?: Record<string, unknown>, after?: Record<string, unknown>) =>
  recordAudit(tx, clock, { ...actorOf(actor, ctx), action, targetType: 'user', targetId: user.id, before, after });

export function updateUser(deps: Deps, id: string, patch: { displayName?: string; language?: UserRow['language'] }, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const user = requireLiveTarget(tx, id);
    const values: Partial<UserRow> = {};
    if (patch.displayName !== undefined) values.displayName = patch.displayName;
    if (patch.language !== undefined) values.language = patch.language;
    if (Object.keys(values).length === 0) return;
    tx.update(users).set({ ...values, updatedAt: clock.now() }).where(eq(users.id, user.id)).run();
    auditUser(tx, clock, actor, ctx, 'user.updated', user, { displayName: user.displayName, language: user.language }, { displayName: values.displayName ?? user.displayName, language: values.language ?? user.language });
  });
}

/** FR-036: sessions end at once; sign-in is refused until reactivated. */
export function suspendUser(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const user = requireLiveTarget(tx, id);
    if (user.status !== 'active') throw new AppError(409, 'already_decided');
    tx.update(users).set({ status: 'suspended', updatedAt: clock.now() }).where(eq(users.id, user.id)).run();
    revokeAllForUser(tx, clock, user.id, 'owner_action');
    auditUser(tx, clock, actor, ctx, 'user.suspended', user, { status: 'active' }, { status: 'suspended' });
  });
}

export function reactivateUser(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const user = requireLiveTarget(tx, id);
    if (user.status !== 'suspended') throw new AppError(409, 'already_decided');
    tx.update(users).set({ status: 'active', updatedAt: clock.now() }).where(eq(users.id, user.id)).run();
    auditUser(tx, clock, actor, ctx, 'user.reactivated', user, { status: 'suspended' }, { status: 'active' });
  });
}

/** FR-037: a temporary password (001 rules), every session ended, and a new password required first. */
export async function resetUserPassword(deps: Deps, id: string, temporaryPassword: string, actor: UserRow, ctx: RequestCtx): Promise<void> {
  const { db, clock } = deps;
  requireLiveTarget(db, id);
  const policyError = checkPasswordPolicy(temporaryPassword);
  if (policyError) throw new AppError(400, 'validation_failed', { fields: { temporaryPassword: policyError } });
  const passwordHash = await hashPassword(temporaryPassword);
  db.transaction((tx) => {
    const user = requireLiveTarget(tx, id);
    const now = clock.now();
    tx.update(users).set({ passwordHash, passwordChangedAt: now, mustChangePassword: true, updatedAt: now }).where(eq(users.id, user.id)).run();
    revokeAllForUser(tx, clock, user.id, 'owner_action');
    // The password itself is never written to the audit log.
    auditUser(tx, clock, actor, ctx, 'user.password_reset', user);
  });
}

/** FR-038: every session of the worker ends at once. */
export function signOutEverywhere(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const user = requireLiveTarget(tx, id);
    const ended = revokeAllForUser(tx, clock, user.id, 'owner_action');
    auditUser(tx, clock, actor, ctx, 'user.signed_out_everywhere', user, undefined, { sessionsEnded: ended });
  });
}

/** FR-039: final. Records keep the name, the audit log keeps the actions, and the username is never reused. */
export function deleteUser(deps: Deps, id: string, actor: UserRow, ctx: RequestCtx): void {
  const { db, clock } = deps;
  db.transaction((tx) => {
    const user = requireLiveTarget(tx, id);
    const now = clock.now();
    tx.update(users).set({ status: 'deleted', deletedAt: now, updatedAt: now }).where(eq(users.id, user.id)).run();
    revokeAllForUser(tx, clock, user.id, 'owner_action');
    tx.delete(orderAssignments).where(eq(orderAssignments.userId, user.id)).run();
    tx.delete(userCustomers).where(eq(userCustomers.userId, user.id)).run();
    auditUser(tx, clock, actor, ctx, 'user.deleted', user, { status: user.status, username: user.username });
  });
}
