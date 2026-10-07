import type { MeResponse, SetupStatusResponse } from '@hanjing/shared';
import { useQuery } from '@tanstack/react-query';
import { api, isApiError } from './http';

export const queryKeys = {
  setupStatus: ['setup-status'] as const,
  me: ['me'] as const,
  sessions: ['sessions'] as const,
  signInHistory: ['sign-in-history'] as const,
  audit: (filters: object) => ['audit', filters] as const,
  auditActions: ['audit-actions'] as const,
  settings: ['settings'] as const,
};

export function useSetupStatus() {
  return useQuery({
    queryKey: queryKeys.setupStatus,
    queryFn: () => api<SetupStatusResponse>('GET', '/api/setup/status'),
    staleTime: 60_000,
  });
}

/** The signed-in user, or null when signed out (401 is an expected answer, not an error). */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await api<MeResponse>('GET', '/api/me');
      } catch (error) {
        if (isApiError(error, 401)) return null;
        throw error;
      }
    },
  });
}
