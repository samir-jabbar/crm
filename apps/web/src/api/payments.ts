import type {
  OrderPayments,
  Payment,
  PaymentInput,
  PaymentPlanInput,
  PaymentSettings,
  PaymentSettingsPatch,
  PaymentsConfig,
  PlanStage,
} from '@hanjing/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './http';

/**
 * Everything a payment or plan change can affect: the order's payments and summary, the order's financial figures
 * on the Overview (SC-005), the payment itself, and the audit log.
 */
export function invalidatePaymentData(queryClient: QueryClient) {
  for (const key of ['order-payments', 'order', 'payment', 'audit']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function useOrderPayments(orderId: string | undefined, options: { deleted?: boolean } = {}) {
  return useQuery({
    queryKey: ['order-payments', orderId, options.deleted ?? false],
    queryFn: () => api<OrderPayments>('GET', `/api/orders/${orderId}/payments${options.deleted ? '?deleted=true' : ''}`),
    enabled: Boolean(orderId),
  });
}

export function usePayment(id: string | undefined) {
  return useQuery({
    queryKey: ['payment', id],
    queryFn: () => api<Payment>('GET', `/api/payments/${id}`),
    enabled: Boolean(id),
  });
}

export function usePaymentsConfig() {
  return useQuery({
    queryKey: ['payments-config'],
    queryFn: () => api<PaymentsConfig>('GET', '/api/payments/config'),
    staleTime: 60_000,
  });
}

export function useCreatePayment(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PaymentInput) => api<Payment>('POST', `/api/orders/${orderId}/payments`, body),
    onSuccess: () => invalidatePaymentData(queryClient),
  });
}

export function useUpdatePayment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PaymentInput) => api<Payment>('PUT', `/api/payments/${id}`, body),
    onSuccess: () => invalidatePaymentData(queryClient),
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/api/payments/${id}`),
    onSuccess: () => invalidatePaymentData(queryClient),
  });
}

export function useRestorePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Payment>('POST', `/api/payments/${id}/restore`),
    onSuccess: () => invalidatePaymentData(queryClient),
  });
}

export function useUpdatePlan(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PaymentPlanInput) => api<{ plan: PlanStage[] }>('PUT', `/api/orders/${orderId}/payment-plan`, body),
    onSuccess: () => invalidatePaymentData(queryClient),
  });
}

export function usePaymentSettings() {
  return useQuery({ queryKey: ['payment-settings'], queryFn: () => api<PaymentSettings>('GET', '/api/settings/payments') });
}

export function usePatchPaymentSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PaymentSettingsPatch) => api<PaymentSettings>('PATCH', '/api/settings/payments', body),
    onSuccess: (data) => {
      queryClient.setQueryData(['payment-settings'], data);
      for (const key of ['payments-config', 'order-payments', 'audit']) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}
