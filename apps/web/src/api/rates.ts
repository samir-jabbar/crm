import type { ForeignCurrency, RateConfig, RateQuote, RateSettings, RateSettingsPatch, RefreshResult } from '@hanjing/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './http';
import { toQueryString } from './orders';

/** Fetch one rate on demand ("Fetch rate"). Not a query: the user decides when to call the provider. */
export function fetchRate(currency: ForeignCurrency, date?: string) {
  return api<RateQuote>('GET', `/api/rates?${toQueryString({ currency, date })}`);
}

/** Auto-fill switch and attribution, readable by every signed-in user. */
export function useRateConfig() {
  return useQuery({
    queryKey: ['rate-config'],
    queryFn: () => api<RateConfig>('GET', '/api/rates/config'),
    staleTime: 60_000,
  });
}

export function useRateSettings() {
  return useQuery({ queryKey: ['rate-settings'], queryFn: () => api<RateSettings>('GET', '/api/settings/exchange-rates') });
}

export function usePatchRateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RateSettingsPatch) => api<RateSettings>('PATCH', '/api/settings/exchange-rates', body),
    onSuccess: (data) => {
      queryClient.setQueryData(['rate-settings'], data);
      for (const key of ['rate-config', 'audit']) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}

export function useRefreshRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<RefreshResult>('POST', '/api/rates/refresh'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['rate-settings'] }),
  });
}
