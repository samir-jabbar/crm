import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never retry client errors (401/403/404/429); retry network/server errors twice.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
    mutations: { retry: false },
  },
});
