import type {
  CreateCustomerRequest,
  CreateSupplierRequest,
  Customer,
  OrderListItem,
  Page,
  Supplier,
  UpdateCustomerRequest,
  UpdateSupplierRequest,
} from '@hanjing/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './http';
import { invalidateOrderData, toQueryString } from './orders';

/**
 * Customers and suppliers share one shape of hooks; `kind` picks the API collection.
 * Typed wrappers below keep call sites explicit.
 */
type Kind = 'customers' | 'suppliers';
type Entity<K extends Kind> = K extends 'customers' ? Customer : Supplier;

function useAddressList<K extends Kind>(kind: K, q: string, deleted = false) {
  return useInfiniteQuery({
    queryKey: [kind, { q, deleted }],
    queryFn: ({ pageParam }) =>
      api<Page<Entity<K>>>(
        'GET',
        `/api/${kind}?${toQueryString({
          limit: '30',
          q: q.trim() || undefined,
          deleted: deleted ? 'true' : undefined,
          cursor: pageParam || undefined,
        })}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function useAddressEntry<K extends Kind>(kind: K, id: string | undefined, deleted = false) {
  return useQuery({
    queryKey: [kind === 'customers' ? 'customer' : 'supplier', id, deleted],
    queryFn: () => api<Entity<K>>('GET', `/api/${kind}/${id}${deleted ? '?deleted=true' : ''}`),
    enabled: Boolean(id),
  });
}

function useRelatedOrders(kind: Kind, id: string | undefined) {
  return useQuery({
    queryKey: [kind === 'customers' ? 'customer-orders' : 'supplier-orders', id],
    queryFn: () => api<{ items: OrderListItem[] }>('GET', `/api/${kind}/${id}/orders`),
    enabled: Boolean(id),
  });
}

function useAddressMutations<K extends Kind>(kind: K) {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    invalidateOrderData(queryClient);
    void queryClient.invalidateQueries({ queryKey: [kind === 'customers' ? 'customer' : 'supplier'] });
  };
  return {
    create: useMutation({
      mutationFn: (body: K extends 'customers' ? CreateCustomerRequest : CreateSupplierRequest) =>
        api<Entity<K>>('POST', `/api/${kind}`, body),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: K extends 'customers' ? UpdateCustomerRequest : UpdateSupplierRequest }) =>
        api<Entity<K>>('PATCH', `/api/${kind}/${id}`, body),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => api<void>('DELETE', `/api/${kind}/${id}`), onSuccess }),
    restore: useMutation({ mutationFn: (id: string) => api<Entity<K>>('POST', `/api/${kind}/${id}/restore`), onSuccess }),
  };
}

export const useCustomers = (q: string, deleted = false) => useAddressList('customers', q, deleted);
export const useSuppliers = (q: string, deleted = false) => useAddressList('suppliers', q, deleted);
export const useCustomer = (id: string | undefined, deleted = false) => useAddressEntry('customers', id, deleted);
export const useSupplier = (id: string | undefined, deleted = false) => useAddressEntry('suppliers', id, deleted);
export const useCustomerOrders = (id: string | undefined) => useRelatedOrders('customers', id);
export const useSupplierOrders = (id: string | undefined) => useRelatedOrders('suppliers', id);
export const useCustomerMutations = () => useAddressMutations('customers');
export const useSupplierMutations = () => useAddressMutations('suppliers');
