import type { OrderInput, Order, OrderListItem, OrderNote, OrdersSummary, OrderStatus, Page } from '@hanjing/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './http';

export interface OrderFilters {
  q?: string;
  status?: OrderStatus[];
  customerId?: string;
  from?: string;
  to?: string;
  deleted?: boolean;
}

export function toQueryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return search.toString();
}

/** Everything an order change can affect: lists, details, counts, and the next-number preview. */
export function invalidateOrderData(queryClient: QueryClient) {
  for (const key of ['orders', 'order', 'orders-summary', 'customer-orders', 'supplier-orders', 'customers', 'suppliers', 'settings', 'audit']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function useOrders(filters: OrderFilters) {
  return useInfiniteQuery({
    queryKey: ['orders', filters],
    queryFn: ({ pageParam }) =>
      api<Page<OrderListItem>>(
        'GET',
        `/api/orders?${toQueryString({
          limit: '20',
          q: filters.q?.trim() || undefined,
          status: filters.status?.length ? filters.status.join(',') : undefined,
          customerId: filters.customerId,
          from: filters.from,
          to: filters.to,
          deleted: filters.deleted ? 'true' : undefined,
          cursor: pageParam || undefined,
        })}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useOrder(id: string | undefined, options: { deleted?: boolean } = {}) {
  return useQuery({
    queryKey: ['order', id, options.deleted ?? false],
    queryFn: () => api<Order>('GET', `/api/orders/${id}${options.deleted ? '?deleted=true' : ''}`),
    enabled: Boolean(id),
  });
}

export function useOrdersSummary() {
  return useQuery({ queryKey: ['orders-summary'], queryFn: () => api<OrdersSummary>('GET', '/api/orders/summary') });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OrderInput) => api<Order>('POST', '/api/orders', body),
    onSuccess: () => invalidateOrderData(queryClient),
  });
}

export function useUpdateOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OrderInput) => api<Order>('PUT', `/api/orders/${id}`, body),
    onSuccess: () => invalidateOrderData(queryClient),
  });
}

export function useSetOrderStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    /** `confirmOutstanding`: the user confirmed closing an order that is still owed money (004 FR-022). */
    mutationFn: (change: OrderStatus | { status: OrderStatus; confirmOutstanding: true }) =>
      api<Order>('PATCH', `/api/orders/${id}/status`, typeof change === 'string' ? { status: change } : change),
    onSuccess: () => invalidateOrderData(queryClient),
  });
}

export function useDuplicateOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (titleSuffix: string) => api<Order>('POST', `/api/orders/${id}/duplicate`, { titleSuffix }),
    onSuccess: () => invalidateOrderData(queryClient),
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/api/orders/${id}`),
    onSuccess: () => invalidateOrderData(queryClient),
  });
}

export function useRestoreOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Order>('POST', `/api/orders/${id}/restore`),
    onSuccess: () => invalidateOrderData(queryClient),
  });
}

export function useOrderNotes(orderId: string) {
  return useQuery({
    queryKey: ['order-notes', orderId],
    queryFn: () => api<{ items: OrderNote[] }>('GET', `/api/orders/${orderId}/notes`),
  });
}

export function useAddOrderNote(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api<OrderNote>('POST', `/api/orders/${orderId}/notes`, { body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['order-notes', orderId] }),
  });
}

export function useDeleteOrderNote(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => api<void>('DELETE', `/api/orders/${orderId}/notes/${noteId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['order-notes', orderId] }),
  });
}
