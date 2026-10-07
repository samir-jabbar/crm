import { isErrorCode, type ApiErrorBody, type ErrorCode } from '@hanjing/shared';

type Details = NonNullable<ApiErrorBody['error']['details']>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly details: Details = {},
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

/** Same-origin JSON API call. Errors always surface as ApiError with a translatable code. */
export async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | T | null;
  if (!res.ok) {
    const error = (data as Partial<ApiErrorBody> | null)?.error;
    const code = isErrorCode(error?.code) ? error.code : res.status >= 500 ? 'internal_error' : 'network_error';
    throw new ApiError(res.status, code, error?.details ?? {});
  }
  return data as T;
}

export const isApiError = (e: unknown, status?: number): e is ApiError =>
  e instanceof ApiError && (status === undefined || e.status === status);
