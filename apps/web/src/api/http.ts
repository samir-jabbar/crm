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

/**
 * Multipart upload of one file (field `file`) with progress, for receipts on slow links (003 R7).
 * XMLHttpRequest because fetch cannot report upload progress. Same-origin, so cookies and Origin are sent.
 */
export function uploadFile<T>(path: string, file: File, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;
    xhr.setRequestHeader('accept', 'application/json');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error'));
    xhr.onabort = () => reject(new ApiError(0, 'network_error'));
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
      const error = (data as Partial<ApiErrorBody> | null)?.error;
      const code = isErrorCode(error?.code)
        ? error.code
        : xhr.status === 413
          ? 'file_too_large'
          : xhr.status >= 500
            ? 'internal_error'
            : 'network_error';
      reject(new ApiError(xhr.status, code, error?.details ?? {}));
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
