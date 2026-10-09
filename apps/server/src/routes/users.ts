import {
  accessInputSchema,
  applyTemplateRequestSchema,
  approveRequestSchema,
  orderAssigneesRequestSchema,
  pageQuerySchema,
  resetPasswordRequestSchema,
  updateUserRequestSchema,
  type Page,
  type SessionItem,
  type SignInHistoryItem,
  userOrdersRequestSchema,
  type OrderAssignee,
  type UserDetail,
  type UsersResponse,
} from '@hanjing/shared';
import type { Context, Hono } from 'hono';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { notFound } from '../lib/errors';
import { parseWith, readJsonBody } from '../lib/validate';
import { presentSession, presentSignInAttempt, presentUserDetail, presentUserListItem } from '../policy/present';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { sessions, signInAttempts } from '../db/schema';
import { isSessionActive } from '../auth/sessions';
import { getIdleTimeoutMs } from '../settings/service';
import { decodeCursor, olderThan, toPage } from '../lib/pagination';
import { route } from '../policy/route';
import { getUserDetail, listUsers, pendingCount, type UserFilter } from '../users/query';
import { orderAssignees, setOrderAssignees, setUserOrders } from '../users/assignments';
import {
  applyTemplate,
  approveUser,
  deleteUser,
  reactivateUser,
  rejectUser,
  requireTarget,
  resetUserPassword,
  setUserAccess,
  signOutEverywhere,
  suspendUser,
  updateUser,
} from '../users/service';

const FILTERS = new Set<UserFilter>(['pending', 'active', 'suspended', 'ended']);

/** 005 FR-003 – FR-005, FR-017, FR-034 – FR-039: the Users area, for the Owner only (FR-011). */
export function registerUserRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db, clock } = deps;
  const id = (c: Context<AppEnv>) => c.req.param('id')!;
  const detail = (c: Context<AppEnv>, userId: string) => {
    const row = getUserDetail(db, userId);
    if (!row) throw notFound();
    return c.json<UserDetail>(presentUserDetail(row, clock.now(), { viewer: c.get('user')! }));
  };

  route(app, 'GET', '/api/users', 'owner', (c) => {
    const status = c.req.query('status') as UserFilter | undefined;
    const rows = listUsers(db, clock, { filter: status && FILTERS.has(status) ? status : undefined, deleted: c.req.query('deleted') === 'true' });
    const viewer = c.get('user')!;
    return c.json<UsersResponse>({ items: rows.map((r) => presentUserListItem(r, clock.now(), { viewer })), pendingCount: pendingCount(db) });
  });

  route(app, 'GET', '/api/users/:id', 'owner', (c) => detail(c, id(c)));

  route(app, 'POST', '/api/users/:id/approve', 'owner', async (c) => {
    const input = parseWith(approveRequestSchema, await readJsonBody(c));
    approveUser(deps, id(c), input, c.get('user')!, c.get('reqCtx'));
    return detail(c, id(c));
  });

  route(app, 'POST', '/api/users/:id/reject', 'owner', (c) => {
    rejectUser(deps, id(c), c.get('user')!, c.get('reqCtx'));
    return c.body(null, 204);
  });

  route(app, 'PUT', '/api/users/:id/access', 'owner', async (c) => {
    const input = parseWith(accessInputSchema, await readJsonBody(c));
    setUserAccess(deps, id(c), input, c.get('user')!, c.get('reqCtx'));
    return detail(c, id(c));
  });

  route(app, 'POST', '/api/users/:id/apply-template', 'owner', async (c) => {
    const { templateId } = parseWith(applyTemplateRequestSchema, await readJsonBody(c));
    applyTemplate(deps, id(c), templateId, c.get('user')!, c.get('reqCtx'));
    return detail(c, id(c));
  });

  // FR-019: assignments, for the "assigned orders" scope. Only the Owner sees and changes them.
  route(app, 'PUT', '/api/users/:id/orders', 'owner', async (c) => {
    const { orderIds } = parseWith(userOrdersRequestSchema, await readJsonBody(c));
    setUserOrders(deps, id(c), orderIds, c.get('user')!, c.get('reqCtx'));
    return detail(c, id(c));
  });

  route(app, 'GET', '/api/orders/:id/assignees', 'owner', (c) => c.json<OrderAssignee[]>(orderAssignees(db, id(c))));

  route(app, 'PUT', '/api/orders/:id/assignees', 'owner', async (c) => {
    const { userIds } = parseWith(orderAssigneesRequestSchema, await readJsonBody(c));
    setOrderAssignees(deps, id(c), userIds, c.get('user')!, c.get('reqCtx'));
    return c.json<OrderAssignee[]>(orderAssignees(db, id(c)));
  });

  // ── Account actions (US6, FR-035 – FR-039) ──

  route(app, 'PATCH', '/api/users/:id', 'owner', async (c) => {
    const patch = parseWith(updateUserRequestSchema, await readJsonBody(c));
    updateUser(deps, id(c), patch, c.get('user')!, c.get('reqCtx'));
    return detail(c, id(c));
  });

  route(app, 'POST', '/api/users/:id/suspend', 'owner', (c) => {
    suspendUser(deps, id(c), c.get('user')!, c.get('reqCtx'));
    return detail(c, id(c));
  });

  route(app, 'POST', '/api/users/:id/reactivate', 'owner', (c) => {
    reactivateUser(deps, id(c), c.get('user')!, c.get('reqCtx'));
    return detail(c, id(c));
  });

  route(app, 'POST', '/api/users/:id/password', 'owner', async (c) => {
    const { temporaryPassword } = parseWith(resetPasswordRequestSchema, await readJsonBody(c));
    await resetUserPassword(deps, id(c), temporaryPassword, c.get('user')!, c.get('reqCtx'));
    return c.body(null, 204);
  });

  route(app, 'POST', '/api/users/:id/sign-out-everywhere', 'owner', (c) => {
    signOutEverywhere(deps, id(c), c.get('user')!, c.get('reqCtx'));
    return c.body(null, 204);
  });

  route(app, 'DELETE', '/api/users/:id', 'owner', (c) => {
    deleteUser(deps, id(c), c.get('user')!, c.get('reqCtx'));
    return c.body(null, 204);
  });

  route(app, 'GET', '/api/users/:id/sessions', 'owner', (c) => {
    const user = requireTarget(db, id(c));
    const now = clock.now();
    const idle = getIdleTimeoutMs(db);
    const rows = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
      .orderBy(desc(sessions.lastActiveAt))
      .all()
      .filter((s) => isSessionActive(s, now, idle));
    const viewer = c.get('user')!;
    return c.json<SessionItem[]>(rows.map((s) => presentSession(s, '', { viewer })));
  });

  route(app, 'GET', '/api/users/:id/sign-in-history', 'owner', (c) => {
    const user = requireTarget(db, id(c));
    const query = parseWith(pageQuerySchema, c.req.query());
    const cursor = decodeCursor(query.cursor);
    const rows = db
      .select()
      .from(signInAttempts)
      .where(and(eq(signInAttempts.userId, user.id), olderThan(signInAttempts.occurredAt, signInAttempts.id, cursor)))
      .orderBy(desc(signInAttempts.occurredAt), desc(signInAttempts.id))
      .limit(query.limit + 1)
      .all();
    const page = toPage(rows, query.limit, (r) => r.occurredAt);
    const viewer = c.get('user')!;
    return c.json<Page<SignInHistoryItem>>({ items: page.items.map((r) => presentSignInAttempt(r, { viewer })), nextCursor: page.nextCursor });
  });
}
