import type { Hono } from 'hono';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { registerAuditRoutes } from './audit';
import { registerAuthRoutes } from './auth';
import { registerCustomerRoutes } from './customers';
import { registerOrderRoutes } from './orders';
import { registerSupplierRoutes } from './suppliers';
import { registerMeRoutes } from './me';
import { registerSessionRoutes } from './sessions';
import { registerSettingsRoutes } from './settings';
import { registerSetupRoutes } from './setup';
import { registerSignInHistoryRoutes } from './signInHistory';

/** Each feature registers its routes here, always through `route()` with a policy. */
export function registerRoutes(app: Hono<AppEnv>, deps: Deps): void {
  registerSetupRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerMeRoutes(app, deps);
  registerSessionRoutes(app, deps);
  registerSignInHistoryRoutes(app, deps);
  registerAuditRoutes(app, deps);
  registerSettingsRoutes(app, deps);
  // 002
  registerCustomerRoutes(app, deps);
  registerSupplierRoutes(app, deps);
  registerOrderRoutes(app, deps);
}
