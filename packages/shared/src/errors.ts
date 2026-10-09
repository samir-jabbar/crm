import type { CurrencyCode } from './enums';

/** Every error code the API can return. The client translates codes; the server never sends sentences. */
export const ERROR_CODES = [
  // generic
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation_failed',
  'csrf_rejected',
  'internal_error',
  'network_error',
  // auth & setup
  'invalid_credentials',
  'too_many_attempts',
  'setup_code_invalid',
  'setup_unavailable',
  'current_password_invalid',
  'owner_protected',
  'audit_append_only',
  // field validation
  'username_invalid',
  'username_taken',
  'display_name_invalid',
  'password_too_short',
  'password_too_long',
  'password_too_common',
  'password_same_as_current',
  'language_invalid',
  'company_name_invalid',
  'timeout_out_of_range',
  'unknown_field',
  'invalid_value',
  // 002: customers, suppliers, orders
  'name_invalid',
  'text_too_long',
  'email_invalid',
  'title_invalid',
  'customer_invalid',
  'amount_invalid',
  'currency_invalid',
  'incoterm_invalid',
  'status_invalid',
  'date_invalid',
  'product_name_invalid',
  'quantity_invalid',
  'year_invalid',
  'hs_code_invalid',
  'supplier_invalid',
  'note_invalid',
  'prefix_invalid',
  'customer_name_exists',
  'in_use',
  'customer_deleted',
  // 003: expenses and exchange rates
  'category_invalid',
  'rate_invalid',
  'rate_required',
  'receipt_invalid',
  'file_too_large',
  'file_type_invalid',
  'rates_unavailable',
  // 004: payments and the order financial summary
  'balance_outstanding',
  'currency_locked',
  'plan_total_invalid',
  'channel_invalid',
  'payment_type_invalid',
  'bank_rate_incomplete',
  'proof_invalid',
  // 005: workers and permissions
  'account_pending',
  'account_suspended',
  'access_ended',
  'registration_closed',
  'password_change_required',
  'permission_conflict',
  'purchase_hidden',
  'already_decided',
  'scope_customers_required',
  'template_invalid',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    details?: {
      fields?: Record<string, ErrorCode>;
      retryAfterSeconds?: number;
      /** customer_name_exists: the customer that already has this name. */
      existingId?: string;
      /** in_use: how many records still use the one being deleted. */
      count?: number;
      /** balance_outstanding: what remains to collect, in the order's currency. */
      remaining?: string;
      currency?: CurrencyCode;
      /** access_ended: the last day of access (YYYY-MM-DD, China time). */
      date?: string;
      /** permission_conflict: which rule the permission set breaks. */
      reason?: string;
    };
  };
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
