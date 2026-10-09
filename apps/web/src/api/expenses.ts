import type {
  CreateCategoryRequest,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  ExpenseStatusPatch,
  OrderExpenses,
  PatchCategoryRequest,
  Reimbursement,
  ToReimburse,
} from '@hanjing/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './http';
import { toQueryString } from './orders';

/**
 * Everything an expense change can affect: the order's expense list and its financial summary (SC-006),
 * reimbursements, the supplier "in use" count, and the audit log.
 */
export function invalidateExpenseData(queryClient: QueryClient) {
  for (const key of ['order-expenses', 'expense', 'order', 'reimbursements', 'to-reimburse', 'advanced-by', 'suppliers', 'audit']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function useOrderExpenses(orderId: string | undefined, options: { deleted?: boolean } = {}) {
  return useQuery({
    queryKey: ['order-expenses', orderId, options.deleted ?? false],
    queryFn: () => api<OrderExpenses>('GET', `/api/orders/${orderId}/expenses${options.deleted ? '?deleted=true' : ''}`),
    enabled: Boolean(orderId),
  });
}

export function useExpense(id: string | undefined) {
  return useQuery({
    queryKey: ['expense', id],
    queryFn: () => api<Expense>('GET', `/api/expenses/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateExpense(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpenseInput) => api<Expense>('POST', `/api/orders/${orderId}/expenses`, body),
    onSuccess: () => invalidateExpenseData(queryClient),
  });
}

export function useUpdateExpense(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpenseInput) => api<Expense>('PUT', `/api/expenses/${id}`, body),
    onSuccess: () => invalidateExpenseData(queryClient),
  });
}

export function usePatchExpenseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ExpenseStatusPatch & { id: string }) => api<Expense>('PATCH', `/api/expenses/${id}/status`, body),
    onSuccess: () => invalidateExpenseData(queryClient),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/api/expenses/${id}`),
    onSuccess: () => invalidateExpenseData(queryClient),
  });
}

export function useRestoreExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Expense>('POST', `/api/expenses/${id}/restore`),
    onSuccess: () => invalidateExpenseData(queryClient),
  });
}

// ── Categories ─────────────────────────────────────────────────────────────

export function useExpenseCategories(options: { includeHidden?: boolean } = {}) {
  return useQuery({
    queryKey: ['expense-categories', options.includeHidden ?? false],
    queryFn: () =>
      api<{ items: ExpenseCategory[] }>('GET', `/api/expense-categories${options.includeHidden ? '?includeHidden=true' : ''}`),
    select: (data) => data.items,
    staleTime: 60_000,
  });
}

function invalidateCategories(queryClient: QueryClient) {
  for (const key of ['expense-categories', 'order-expenses', 'expense', 'audit']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) => api<ExpenseCategory>('POST', '/api/expense-categories', body),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

export function usePatchCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: PatchCategoryRequest & { id: string }) =>
      api<ExpenseCategory>('PATCH', `/api/expense-categories/${id}`, body),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

// ── Reimbursements ─────────────────────────────────────────────────────────

export function useAdvancedBySuggestions(q: string) {
  return useQuery({
    queryKey: ['advanced-by', q],
    queryFn: () => api<{ items: string[] }>('GET', `/api/expenses/advanced-by?${toQueryString({ q: q.trim() || undefined })}`),
    select: (data) => data.items,
    staleTime: 30_000,
  });
}

export function useReimbursements() {
  return useQuery({
    queryKey: ['reimbursements'],
    queryFn: () => api<{ items: Reimbursement[] }>('GET', '/api/expenses/reimbursements'),
    select: (data) => data.items,
  });
}

export function useToReimburse(person: string) {
  return useQuery({
    queryKey: ['to-reimburse', person],
    queryFn: () => api<ToReimburse>('GET', `/api/expenses/to-reimburse?${toQueryString({ person })}`),
    enabled: person.trim().length > 0,
  });
}
