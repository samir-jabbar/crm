import { and, asc, desc, eq, inArray, isNotNull, isNull, max, ne, sql } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import {
  customers,
  orderAssignments,
  orders,
  registrations,
  roleTemplates,
  signInAttempts,
  userCustomers,
  users,
  type OrderRow,
  type RegistrationRow,
  type RoleTemplateRow,
  type UserRow,
} from '../db/schema';
import { accessEnded } from '../policy/access';

/** A worker account with what the Users area shows next to it (005 FR-034). */
export interface UserListRow {
  user: UserRow;
  template: Pick<RoleTemplateRow, 'id' | 'defaultKey' | 'name' | 'deletedAt'> | null;
  lastSignInAt: number | null;
  registration: RegistrationRow | null;
}

export interface UserDetailRow extends UserListRow {
  customers: { id: string; name: string }[];
  assignedOrders: Pick<OrderRow, 'id' | 'number' | 'title' | 'status'>[];
}

export type UserFilter = 'pending' | 'active' | 'suspended' | 'ended';

/** Rejected registrations are never listed; deleted workers only on request. The Owner is not a worker. */
const listable = (deleted: boolean) =>
  and(eq(users.role, 'worker'), isNull(users.rejectedAt), deleted ? eq(users.status, 'deleted') : ne(users.status, 'deleted'));

function decorate(db: Executor, rows: UserRow[]): UserListRow[] {
  if (rows.length === 0) return [];
  const ids = rows.map((u) => u.id);
  const templateIds = [...new Set(rows.map((u) => u.templateId).filter((id): id is string => id !== null))];
  const templates = new Map(
    (templateIds.length
      ? db.select({ id: roleTemplates.id, defaultKey: roleTemplates.defaultKey, name: roleTemplates.name, deletedAt: roleTemplates.deletedAt }).from(roleTemplates).where(inArray(roleTemplates.id, templateIds)).all()
      : []
    ).map((t) => [t.id, t]),
  );
  const lastSignIns = new Map(
    db
      .select({ userId: signInAttempts.userId, at: max(signInAttempts.occurredAt) })
      .from(signInAttempts)
      .where(and(inArray(signInAttempts.userId, ids), eq(signInAttempts.outcome, 'success')))
      .groupBy(signInAttempts.userId)
      .all()
      .map((r) => [r.userId, r.at]),
  );
  const regs = new Map(
    db.select().from(registrations).where(inArray(registrations.userId, ids)).orderBy(asc(registrations.createdAt)).all().map((r) => [r.userId, r]),
  );
  return rows.map((user) => ({
    user,
    template: user.templateId ? (templates.get(user.templateId) ?? null) : null,
    lastSignInAt: lastSignIns.get(user.id) ?? null,
    registration: regs.get(user.id) ?? null,
  }));
}

/** Pending registrations first (oldest first), then the others by name. */
export function listUsers(db: Executor, clock: Clock, options: { filter?: UserFilter; deleted?: boolean } = {}): UserListRow[] {
  const rows = db
    .select()
    .from(users)
    .where(listable(options.deleted ?? false))
    .orderBy(sql`case when ${users.status} = 'pending' then 0 else 1 end`, asc(users.createdAt))
    .all()
    .filter((u) => {
      const ended = u.status === 'active' && accessEnded(u, clock.now());
      switch (options.filter) {
        case undefined:
          return true;
        case 'ended':
          return ended;
        case 'active':
          return u.status === 'active' && !ended;
        default:
          return u.status === options.filter;
      }
    });
  return decorate(db, rows);
}

export function pendingCount(db: Executor): number {
  return db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.status, 'pending'), eq(users.role, 'worker'))).get()?.n ?? 0;
}

/** A listed worker (not the Owner, not a rejected registration), or undefined. */
export function findWorker(db: Executor, id: string): UserRow | undefined {
  return db.select().from(users).where(and(eq(users.id, id), eq(users.role, 'worker'), isNull(users.rejectedAt))).get();
}

export function getUserDetail(db: Executor, id: string): UserDetailRow | undefined {
  const user = findWorker(db, id);
  if (!user) return undefined;
  const [row] = decorate(db, [user]);
  return {
    ...row!,
    customers: db
      .select({ id: customers.id, name: customers.name })
      .from(userCustomers)
      .innerJoin(customers, eq(customers.id, userCustomers.customerId))
      .where(eq(userCustomers.userId, id))
      .orderBy(asc(customers.name))
      .all(),
    assignedOrders: db
      .select({ id: orders.id, number: orders.number, title: orders.title, status: orders.status })
      .from(orderAssignments)
      .innerJoin(orders, eq(orders.id, orderAssignments.orderId))
      .where(and(eq(orderAssignments.userId, id), isNull(orders.deletedAt)))
      .orderBy(desc(orders.createdAt))
      .all(),
  };
}

/** A template that can still be applied. */
export function findLiveTemplate(db: Executor, id: string): RoleTemplateRow | undefined {
  return db.select().from(roleTemplates).where(and(eq(roleTemplates.id, id), isNull(roleTemplates.deletedAt))).get();
}

export function templateUsage(db: Executor): Map<string, number> {
  return new Map(
    db
      .select({ id: users.templateId, n: sql<number>`count(*)` })
      .from(users)
      .where(and(isNotNull(users.templateId), ne(users.status, 'deleted')))
      .groupBy(users.templateId)
      .all()
      .map((r) => [r.id!, r.n]),
  );
}
