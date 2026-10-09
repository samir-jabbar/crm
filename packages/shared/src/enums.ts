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
  // 005: ended by the Owner (suspension, deletion, password reset, force logout)
  'owner_action',
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
  // 005: a correct password on an account that may not sign in (yet)
  'account_pending',
  'account_suspended',
  'access_ended',
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
  // 005: workers and permissions
  'user.registered',
  'user.approved',
  'user.rejected',
  'user.access_changed',
  'user.updated',
  'user.suspended',
  'user.reactivated',
  'user.deleted',
  'user.password_reset',
  'user.signed_out_everywhere',
  'template.created',
  'template.updated',
  'template.deleted',
  'order.assignees_changed',
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
export const POLICY_MODULES = ['orders', 'customers', 'suppliers', 'expenses', 'payments'] as const;
export type PolicyModule = (typeof POLICY_MODULES)[number];

export const DEFAULT_ORDER_NUMBER_PREFIX = 'HJ';
export const ORDER_NUMBER_PREFIX_PATTERN = /^[A-Za-z0-9-]{1,10}$/;
/** Order-number years follow China time, where the company is registered. */
export const ORDER_NUMBER_TIME_ZONE = 'Asia/Shanghai';

/** Decimal amount as typed or sent over the API: up to 12 digits and 2 decimals. */
export const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
/** Largest amount stored, in minor units (mirrors the database CHECK). */
export const MAX_AMOUNT_MINOR = 100_000_000_000_000;

// ── Feature 003: expenses and exchange rates ───────────────────────────────

/** Currencies that need a rate to CNY: every supported currency except the base. */
export const FOREIGN_CURRENCIES = ['USD', 'MAD', 'EUR'] as const satisfies readonly Exclude<CurrencyCode, 'CNY'>[];
export type ForeignCurrency = (typeof FOREIGN_CURRENCIES)[number];

export const EXPENSE_STATUSES = ['paid', 'to_pay'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const PAYMENT_METHODS = ['cash', 'bank', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Where an expense's rate came from: typed, fetched, or fetched then changed (FR-004). */
export const RATE_SOURCES = ['manual', 'auto', 'auto_edited'] as const;
export type RateSource = (typeof RATE_SOURCES)[number];

/** Rate providers offered in Settings (research R1). `manual` means no automatic rates. */
export const RATE_PROVIDERS = ['currency_api', 'exchangerate_api_open', 'manual'] as const;
export type RateProviderId = (typeof RATE_PROVIDERS)[number];

/** The brief's default expense categories, in display order (FR-021). Labels come from translations. */
export const DEFAULT_CATEGORY_KEYS = [
  'equipment_purchase',
  'inland_transport_china',
  'port_loading',
  'sea_freight',
  'insurance',
  'customs_clearance_china',
  'customs_duties_morocco',
  'labor',
  'hotel_accommodation',
  'local_travel',
  'commission',
  'bank_fees',
  'other',
] as const;
export type DefaultCategoryKey = (typeof DEFAULT_CATEGORY_KEYS)[number];

/** Rate as typed or sent: "1 unit = X CNY", up to 7 digits and 6 decimals (research R2). */
export const RATE_PATTERN = /^\d{1,7}(\.\d{1,6})?$/;
/** Rates are stored as integer micro-units: rate × 1,000,000. */
export const RATE_SCALE = 1_000_000;
/** A typed rate further than this from the latest known rate gets a warning (FR-005). */
export const RATE_TYPO_THRESHOLD = 0.2;

export const RECEIPT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const;
export type ReceiptMime = (typeof RECEIPT_MIME_TYPES)[number];
export const MAX_RECEIPT_BYTES = 10_485_760;

// ── Feature 004: payments and the order financial summary ──────────────────

/** The two ways a customer pays the same agreed price (ROADMAP D3). Display names are configurable. */
export const PAYMENT_CHANNELS = ['direct', 'bank'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const PAYMENT_TYPES = ['deposit', 'balance', 'other'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

/** Which of its rates the Chinese bank applied when converting a payment to CNY. */
export const BANK_RATE_TYPES = ['buying', 'selling', 'other'] as const;
export type BankRateType = (typeof BANK_RATE_TYPES)[number];

/** Permission scopes of the two channels, separately restrictable (feature 005 limits Direct to the Owner). */
export const PAYMENT_CHANNEL_SCOPES = { direct: 'payments.direct', bank: 'payments.bank' } as const satisfies Record<
  PaymentChannel,
  string
>;

/** What a stored file is for. */
export const FILE_KINDS = ['receipt', 'payment_proof'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** The banks offered first in the bank-rate field; the Owner edits the list in Settings. */
export const DEFAULT_BANKS = ['Bank of China', 'ICBC', 'ABC', 'CCB'] as const;

/** Plan percentages are stored in basis points: 30% = 3000, 100% = 10,000 (004 research R4). */
export const BASIS_POINTS = 10_000;
export const MAX_PLAN_STAGES = 10;
/** A plan percentage as typed: up to 100 with at most 2 decimals. */
export const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

// ── Feature 005: workers and permissions ───────────────────────────────────

/** The permission matrix's modules (FR-007). `payments.*` are the two separately restrictable channels. */
export const MODULES = [
  'orders',
  'customers',
  'suppliers',
  'expenses',
  'payments.direct',
  'payments.bank',
  'shipments',
  'documents',
  'invoices',
  'dashboard',
  'advisor',
  'rates',
  'settings',
] as const;
export type Module = (typeof MODULES)[number];

/** The actions each module offers (FR-007). */
export const MODULE_ACTIONS: Record<Module, readonly PolicyAction[]> = {
  orders: POLICY_ACTIONS,
  customers: POLICY_ACTIONS,
  suppliers: POLICY_ACTIONS,
  expenses: POLICY_ACTIONS,
  'payments.direct': POLICY_ACTIONS,
  'payments.bank': POLICY_ACTIONS,
  shipments: POLICY_ACTIONS,
  documents: POLICY_ACTIONS,
  invoices: POLICY_ACTIONS,
  dashboard: ['view', 'export'],
  advisor: ['view'],
  rates: ['view', 'edit'],
  settings: ['view', 'edit'],
};

/** Modules that live inside an order: any of them gives the basic view of the orders in scope (FR-010). */
export const ORDER_BOUND_MODULES = ['expenses', 'payments.direct', 'payments.bank', 'shipments', 'documents', 'invoices'] as const satisfies readonly Module[];

/** Groups of values the Owner can hide per worker (FR-025). */
export const HIDDEN_GROUPS = [
  'sellingPrice',
  'supplierPrices',
  'supplierIdentity',
  'customerContacts',
  'paymentAmounts',
  'bankDetails',
] as const;
export type HiddenGroup = (typeof HIDDEN_GROUPS)[number];

/** Which orders a worker can reach (FR-018). */
export const ORDER_SCOPES = ['all', 'assigned', 'customers'] as const;
export type OrderScope = (typeof ORDER_SCOPES)[number];

/** The five default role templates (FR-015). */
export const TEMPLATE_KEYS = ['logistics', 'site_assistant', 'accountant', 'sales_assistant', 'read_only'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Registrations from one network origin (FR-006). */
export const REGISTRATION_THROTTLE = { max: 5, windowMs: 60 * 60 * 1000 } as const;

/** Supplier purchases: hidden with `supplierPrices` (FR-025). */
export const PURCHASE_CATEGORY_ID = 'cat-equipment_purchase';
export const MAX_TEMPLATE_NAME_LENGTH = 60;
