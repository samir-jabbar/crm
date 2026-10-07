import type { ErrorCode } from '@hanjing/shared';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from './http';

/** Translate any thrown error into a message in the current language. */
export function useErrorMessage() {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown): string | null => {
      if (!error) return null;
      if (error instanceof ApiError) {
        const minutes = Math.max(1, Math.ceil((error.details.retryAfterSeconds ?? 60) / 60));
        return t(`errors.${error.code}`, { minutes, count: error.details.count ?? 0 });
      }
      return t('errors.internal_error');
    },
    [t],
  );
}

/** Per-field error codes from a 400 validation_failed response. */
export function fieldErrors(error: unknown): Partial<Record<string, ErrorCode>> {
  if (error instanceof ApiError && error.code === 'validation_failed') return error.details.fields ?? {};
  return {};
}
