import type { Hono } from 'hono';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { registerAuditRoutes } from './audit';
import { registerAuthRoutes } from './auth';
import { registerCustomerRoutes } from './customers';
import { registerExpenseCategoryRoutes } from './expenseCategories';
import { registerExpenseRoutes } from './expenses';
import { registerPaymentProofRoutes } from './paymentProofs';
import { registerPaymentSettingsRoutes } from './paymentSettings';
import { registerPaymentRoutes } from './payments';
import { registerRateRoutes } from './rates';
import { registerReceiptRoutes } from './receipts';
import { registerOrderRoutes } from './orders';
import { registerSupplierRoutes } from './suppliers';
import { registerMeRoutes } from './me';
import { registerSessionRoutes } from './sessions';
import { registerSettingsRoutes } from './settings';
import { registerSetupRoutes } from './setup';
import { registerSignInHistoryRoutes } from './signInHistory';
import { registerRegistrationRoutes } from './register';
import { registerUserRoutes } from './users';
import { registerRoleTemplateRoutes } from './roleTemplates';

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
  // 003
  registerExpenseRoutes(app, deps);
  registerReceiptRoutes(app, deps);
  registerExpenseCategoryRoutes(app, deps);
  registerRateRoutes(app, deps);
  // 004
  registerPaymentRoutes(app, deps);
  registerPaymentProofRoutes(app, deps);
  registerPaymentSettingsRoutes(app, deps);
  // 005
  registerRegistrationRoutes(app, deps);
  registerUserRoutes(app, deps);
  registerRoleTemplateRoutes(app, deps);
}
