export const ROLES = ['owner', 'worker'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['active', 'pending', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const LANGUAGES = ['en', 'fr', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export const CURRENCY_CODES = ['CNY', 'USD', 'MAD', 'EUR'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];
/** ROADMAP D1: every money record converts to CNY. Fixed, never configurable. */
export const BASE_CURRENCY = 'CNY' satisfies CurrencyCode;

export const SESSION_REVOKE_REASONS = [
  'sign_out',
  'timeout',
  'remote',
  'revoke_all',
  'password_change',
  'server_reset',
] as const;
export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];

export const SIGN_IN_OUTCOMES = ['success', 'failure', 'blocked'] as const;
export type SignInOutcome = (typeof SIGN_IN_OUTCOMES)[number];

export const SIGN_IN_REASONS = [
  'ok',
  'invalid_credentials',
  'account_blocked',
  'ip_blocked',
  'account_inactive',
] as const;
export type SignInReason = (typeof SIGN_IN_REASONS)[number];

export const AUDIT_ACTIONS = [
  'setup.owner_created',
  'auth.sign_in',
  'auth.sign_in_failed',
  'auth.sign_in_blocked',
  'auth.sign_out',
  'session.revoked',
  'session.revoked_all',
  'session.timed_out',
  'password.changed',
  'password.server_reset',
  'profile.updated',
  'settings.updated',
  'record.created',
  'record.updated',
  'record.deleted',
  'record.restored',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Permission-gate policy kinds. `{ module, action }` policies are enforced from feature 005. */
export const POLICY_KINDS = ['public', 'authenticated', 'owner'] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];
export const POLICY_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;
export type PolicyAction = (typeof POLICY_ACTIONS)[number];

export const SESSION_IDLE_TIMEOUT_MINUTES = { min: 15, max: 10_080, default: 720 } as const;
export const SESSION_ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const SIGN_IN_THROTTLE = { maxFailures: 5, windowMs: 15 * 60 * 1000 } as const;
export const PASSWORD_LENGTH = { min: 10, max: 128 } as const;
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

// ── Feature 002: customers, suppliers, orders ──────────────────────────────

export const ORDER_STATUSES = [
  'draft',
  'confirmed',
  'purchased',
  'in_production',
  'inland_transport',
  'at_port',
  'on_vessel',
  'arrived',
  'customs_cleared',
  'delivered',
  'closed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Open = still being worked on (FR-026). */
export const OPEN_ORDER_STATUSES = ORDER_STATUSES.filter(
  (s) => s !== 'delivered' && s !== 'closed' && s !== 'cancelled',
) as Exclude<OrderStatus, 'delivered' | 'closed' | 'cancelled'>[];

/** Incoterms 2020. */
export const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] as const;
export type Incoterm = (typeof INCOTERMS)[number];

/** Modules used by `{ module, action }` policies; per-user permissions arrive in 005. */
export const POLICY_MODULES = ['orders', 'customers', 'suppliers'] as const;
export type PolicyModule = (typeof POLICY_MODULES)[number];

export const DEFAULT_ORDER_NUMBER_PREFIX = 'HJ';
export const ORDER_NUMBER_PREFIX_PATTERN = /^[A-Za-z0-9-]{1,10}$/;
/** Order-number years follow China time, where the company is registered. */
export const ORDER_NUMBER_TIME_ZONE = 'Asia/Shanghai';

/** Decimal amount as typed or sent over the API: up to 12 digits and 2 decimals. */
export const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
/** Largest amount stored, in minor units (mirrors the database CHECK). */
export const MAX_AMOUNT_MINOR = 100_000_000_000_000;
