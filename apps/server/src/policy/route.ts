import type { Handler, Hono, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { authorize, describePolicy, type Policy } from './authorize';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RegisteredRoute {
  method: Method;
  path: string;
  policy: string;
}

const registries = new WeakMap<Hono<AppEnv>, Map<string, RegisteredRoute>>();

function registryFor(app: Hono<AppEnv>): Map<string, RegisteredRoute> {
  let registry = registries.get(app);
  if (!registry) {
    registry = new Map();
    registries.set(app, registry);
  }
  return registry;
}

/**
 * The only way to add an API route: the policy is mandatory and is checked before any handler runs.
 * Middlewares (e.g. validation) may precede the final handler.
 */
export function route(
  app: Hono<AppEnv>,
  method: Method,
  path: string,
  policy: Policy,
  ...handlers: [...MiddlewareHandler<AppEnv>[], Handler<AppEnv>]
): void {
  registryFor(app).set(`${method} ${path}`, { method, path, policy: describePolicy(policy) });
  app.on(method, path, authorize(policy), ...(handlers as Handler<AppEnv>[]));
}

export function registeredRoutes(app: Hono<AppEnv>): RegisteredRoute[] {
  return [...registryFor(app).values()];
}

/** Deny by default: fail at startup if any /api route was added without going through route(). */
export function assertAllApiRoutesHavePolicy(app: Hono<AppEnv>): void {
  const registry = registryFor(app);
  const missing = app.routes
    .filter((r) => r.path.startsWith('/api') && r.method !== 'ALL')
    .filter((r) => !registry.has(`${r.method} ${r.path}`))
    .map((r) => `${r.method} ${r.path}`);
  if (missing.length > 0) {
    throw new Error(`API routes registered without a policy: ${[...new Set(missing)].join(', ')}`);
  }
}
