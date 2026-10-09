import type { CurrencyCode, ErrorCode } from '@hanjing/shared';

export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429 | 500 | 503;

export interface AppErrorDetails {
  fields?: Record<string, ErrorCode>;
  retryAfterSeconds?: number;
  existingId?: string;
  count?: number;
  remaining?: string;
  currency?: CurrencyCode;
  date?: string;
  reason?: string;
}

/** An expected failure that maps directly to `{ error: { code, details } }`. */
export class AppError extends Error {
  constructor(
    readonly status: HttpStatus,
    readonly code: ErrorCode,
    readonly details?: AppErrorDetails,
  ) {
    super(code);
    this.name = 'AppError';
  }
}

export const unauthenticated = () => new AppError(401, 'unauthenticated');
export const forbidden = () => new AppError(403, 'forbidden');
export const notFound = () => new AppError(404, 'not_found');
