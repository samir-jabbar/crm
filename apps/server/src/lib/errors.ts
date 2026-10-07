import type { ErrorCode } from '@hanjing/shared';

export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500;

export interface AppErrorDetails {
  fields?: Record<string, ErrorCode>;
  retryAfterSeconds?: number;
  existingId?: string;
  count?: number;
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
