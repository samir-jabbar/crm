import type { PolicyAction, PolicyKind } from '@hanjing/shared';
import type { MiddlewareHandler } from 'hono';
import type { UserRow } from '../db/schema';
import type { AppEnv } from '../env';
import { forbidden, unauthenticated } from '../lib/errors';

/**
 * Every API route declares exactly one policy (R12).
 * `{ module, action }` is the per-module permission check that feature 005 implements; until then only the Owner passes.
 */
export type Policy = PolicyKind | { module: string; action: PolicyAction };

export function describePolicy(policy: Policy): string {
  return typeof policy === 'string' ? policy : `${policy.module}:${policy.action}`;
}

/** Is `user` allowed `{ module, action }`? Owner-only until the permission matrix arrives in 005. */
export function can(user: UserRow | null, _module: string, _action: PolicyAction): boolean {
  return user?.role === 'owner';
}

/**
 * Extra check inside a handler, for permissions that depend on the request
 * (e.g. `?deleted=true` needs the module's `delete` action).
 */
export function requirePermission(user: UserRow | null, module: string, action: PolicyAction): void {
  if (!user) throw unauthenticated();
  if (!can(user, module, action)) throw forbidden();
}

export function authorize(policy: Policy): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (policy === 'public') return next();
    const user = c.get('user');
    if (!user) throw unauthenticated();
    if (policy === 'authenticated') return next();
    // 'owner' and module/action policies: Owner-only until the permission matrix arrives in 005.
    if (user.role !== 'owner') throw forbidden();
    return next();
  };
}
