import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/api/http';

/**
 * Non-blocking notice when the device is offline or requests cannot reach the server (FR-032).
 * Screens stay usable from the cached shell; nothing typed is lost.
 */
export function ConnectionBanner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      setUnreachable(false);
      void queryClient.invalidateQueries();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    const isNetworkError = (e: unknown) => e instanceof ApiError && e.code === 'network_error';
    const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const state = event.query.state;
      if (state.status === 'error' && isNetworkError(state.error)) setUnreachable(true);
      if (state.status === 'success') setUnreachable(false);
    });
    const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
      const state = event.mutation?.state;
      if (state?.status === 'error' && isNetworkError(state.error)) setUnreachable(true);
      if (state?.status === 'success') setUnreachable(false);
    });
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      unsubQueries();
      unsubMutations();
    };
  }, [queryClient]);

  if (!offline && !unreachable) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-warning/50 bg-warning/15 px-4 py-3 text-center text-sm text-foreground backdrop-blur"
    >
      {offline ? t('connection.offline') : t('connection.unreachable')}
    </div>
  );
}
