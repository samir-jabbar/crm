import type {
  AccessInput,
  ApproveRequest,
  OrderAssignee,
  RegistrationStatusResponse,
  RoleTemplate,
  SessionItem,
  SignInHistoryItem,
  TemplateInput,
  UserDetail,
  UsersResponse,
} from '@hanjing/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './http';

/** 005: registration, the Users area and role templates. */
export const userKeys = {
  registration: ['registration-status'] as const,
  users: (filters: object) => ['users', filters] as const,
  user: (id: string) => ['user', id] as const,
  userSessions: (id: string) => ['user', id, 'sessions'] as const,
  userHistory: (id: string) => ['user', id, 'history'] as const,
  templates: ['role-templates'] as const,
  assignees: (orderId: string) => ['order-assignees', orderId] as const,
};

export function useRegistrationStatus() {
  return useQuery({
    queryKey: userKeys.registration,
    queryFn: () => api<RegistrationStatusResponse>('GET', '/api/auth/registration'),
    staleTime: 60_000,
  });
}

export function useUsers(filters: { deleted?: boolean } = {}, enabled = true) {
  return useQuery({
    queryKey: userKeys.users(filters),
    queryFn: () => api<UsersResponse>('GET', `/api/users${filters.deleted ? '?deleted=true' : ''}`),
    enabled,
  });
}

export function useUser(id: string) {
  return useQuery({ queryKey: userKeys.user(id), queryFn: () => api<UserDetail>('GET', `/api/users/${id}`) });
}

export function useUserSessions(id: string) {
  return useQuery({ queryKey: userKeys.userSessions(id), queryFn: () => api<SessionItem[]>('GET', `/api/users/${id}/sessions`) });
}

export function useUserSignInHistory(id: string) {
  return useQuery({
    queryKey: userKeys.userHistory(id),
    queryFn: () => api<{ items: SignInHistoryItem[]; nextCursor: string | null }>('GET', `/api/users/${id}/sign-in-history`),
  });
}

export function useTemplates() {
  return useQuery({ queryKey: userKeys.templates, queryFn: () => api<RoleTemplate[]>('GET', '/api/role-templates') });
}

/** Everything about workers changes together: lists, details, templates' usage, and the order pages' assignees. */
export async function invalidateUserData(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['users'] }),
    queryClient.invalidateQueries({ queryKey: ['user'] }),
    queryClient.invalidateQueries({ queryKey: userKeys.templates }),
    queryClient.invalidateQueries({ queryKey: ['order-assignees'] }),
  ]);
}

function useUserMutation<Vars, Result>(request: (vars: Vars) => Promise<Result>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: request, onSuccess: () => invalidateUserData(queryClient) });
}

export const useApproveUser = (id: string) => useUserMutation((body: ApproveRequest) => api<UserDetail>('POST', `/api/users/${id}/approve`, body));
export const useRejectUser = (id: string) => useUserMutation(() => api<void>('POST', `/api/users/${id}/reject`));
export const useSetUserAccess = (id: string) => useUserMutation((body: AccessInput) => api<UserDetail>('PUT', `/api/users/${id}/access`, body));
export const useApplyTemplate = (id: string) =>
  useUserMutation((templateId: string) => api<UserDetail>('POST', `/api/users/${id}/apply-template`, { templateId }));
export const useSetUserOrders = (id: string) =>
  useUserMutation((orderIds: string[]) => api<UserDetail>('PUT', `/api/users/${id}/orders`, { orderIds }));
export const useUpdateUser = (id: string) =>
  useUserMutation((body: { displayName?: string; language?: string }) => api<UserDetail>('PATCH', `/api/users/${id}`, body));
export const useSuspendUser = (id: string) => useUserMutation(() => api<UserDetail>('POST', `/api/users/${id}/suspend`));
export const useReactivateUser = (id: string) => useUserMutation(() => api<UserDetail>('POST', `/api/users/${id}/reactivate`));
export const useResetUserPassword = (id: string) =>
  useUserMutation((temporaryPassword: string) => api<void>('POST', `/api/users/${id}/password`, { temporaryPassword }));
export const useSignOutEverywhere = (id: string) => useUserMutation(() => api<void>('POST', `/api/users/${id}/sign-out-everywhere`));
export const useDeleteUser = (id: string) => useUserMutation(() => api<void>('DELETE', `/api/users/${id}`));

export const useCreateTemplate = () => useUserMutation((body: TemplateInput & { name: string }) => api<RoleTemplate>('POST', '/api/role-templates', body));
export const useUpdateTemplate = (id: string) => useUserMutation((body: TemplateInput) => api<RoleTemplate>('PUT', `/api/role-templates/${id}`, body));
export const useDeleteTemplate = (id: string) => useUserMutation(() => api<void>('DELETE', `/api/role-templates/${id}`));

export function useOrderAssignees(orderId: string, enabled = true) {
  return useQuery({
    queryKey: userKeys.assignees(orderId),
    queryFn: () => api<OrderAssignee[]>('GET', `/api/orders/${orderId}/assignees`),
    enabled,
  });
}

export const useSetOrderAssignees = (orderId: string) =>
  useUserMutation((userIds: string[]) => api<OrderAssignee[]>('PUT', `/api/orders/${orderId}/assignees`, { userIds }));
