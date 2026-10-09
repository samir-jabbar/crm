import {
  hasAction,
  MODULES,
  PAYMENT_CHANNELS,
  PAYMENT_CHANNEL_SCOPES,
  reachesOrders,
  type Access,
  type Module,
  type PaymentChannel,
  type PolicyAction,
  type PolicyKind,
} from '@hanjing/shared';
import type { MiddlewareHandler } from 'hono';
import type { UserRow } from '../db/schema';
import type { AppEnv } from '../env';
import { AppError, forbidden, unauthenticated } from '../lib/errors';
import { accessFor } from './access';

/**
 * Every API route declares exactly one policy (R12). `{ module, action }` is the per-module permission check
 * (005 research R2); `'payments'` means either payment channel, and the handler narrows to the channel.
 */
export type Policy = PolicyKind | { module: Module | 'payments'; action: PolicyAction };

export function describePolicy(policy: Policy): string {
  return typeof policy === 'string' ? policy : `${policy.module}:${policy.action}`;
}

/** The user row is reloaded on every request, so caching per row is caching per request (FR-014). */
const accessCache = new WeakMap<UserRow, Access>();

export function accessOf(user: UserRow): Access {
  let access = accessCache.get(user);
  if (!access) {
    access = accessFor(user);
    accessCache.set(user, access);
  }
  return access;
}

const isModule = (value: string): value is Module => (MODULES as readonly string[]).includes(value);

/** Is `user` allowed `{ module, action }`? `'payments'` is either channel. */
export function can(user: UserRow | null, module: Module | 'payments', action: PolicyAction): boolean {
  if (!user) return false;
  const access = accessOf(user);
  if (access.owner) return true;
  if (module === 'payments') return PAYMENT_CHANNELS.some((ch) => hasAction(access, PAYMENT_CHANNEL_SCOPES[ch], action));
  return isModule(module) && hasAction(access, module, action);
}

/** Extra check inside a handler, for permissions that depend on the request (e.g. `?deleted=true` needs delete). */
export function requirePermission(user: UserRow | null, module: Module | 'payments', action: PolicyAction): void {
  if (!user) throw unauthenticated();
  if (!can(user, module, action)) throw forbidden();
}

/** The Owner, or nobody (FR-011): user management, the audit log, security settings. */
export function requireOwner(user: UserRow | null): void {
  if (!user) throw unauthenticated();
  if (user.role !== 'owner') throw forbidden();
}

/** Payment channels are separately restrictable (004 research R9, 005 FR-016). */
export const channelRules = {
  canUse: (user: UserRow | null, channel: PaymentChannel, action: PolicyAction): boolean =>
    can(user, PAYMENT_CHANNEL_SCOPES[channel], action),
};

/** Every read and write of a payment also checks its channel. */
export function requireChannel(user: UserRow | null, channel: PaymentChannel, action: PolicyAction): void {
  if (!user) throw unauthenticated();
  if (!channelRules.canUse(user, channel, action)) throw forbidden();
}

/** The channels whose payments and figures a viewer may see; lists and summaries leave out the others. */
export function visibleChannels(user: UserRow | null): PaymentChannel[] {
  return PAYMENT_CHANNELS.filter((channel) => channelRules.canUse(user, channel, 'view'));
}

/** While a worker must replace an Owner-set temporary password, only these stay open (FR-037). */
const OPEN_DURING_PASSWORD_CHANGE = new Set(['GET /api/me', 'POST /api/me/password', 'POST /api/auth/sign-out']);

export function authorize(policy: Policy): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (policy === 'public') return next();
    const user = c.get('user');
    if (!user) throw unauthenticated();
    if (user.mustChangePassword && !OPEN_DURING_PASSWORD_CHANGE.has(`${c.req.method} ${c.req.path}`)) {
      throw new AppError(403, 'password_change_required');
    }
    if (policy === 'authenticated') return next();
    if (policy === 'owner') {
      if (user.role !== 'owner') throw forbidden();
      return next();
    }
    // Reading orders is open to any order-bound module, which then gets the basic order view (FR-010).
    const allowed =
      policy.module === 'orders' && policy.action === 'view' ? reachesOrders(accessOf(user)) : can(user, policy.module, policy.action);
    if (!allowed) throw forbidden();
    return next();
  };
}
