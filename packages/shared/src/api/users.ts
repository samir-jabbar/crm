import { z } from 'zod';
import { MAX_TEMPLATE_NAME_LENGTH, type Language, type OrderScope, type OrderStatus, type TemplateKey, type UserStatus } from '../enums';
import { orderScopeSchema, permissionSetSchema, type PermissionSet } from '../permissions';
import { displayNameSchema, languageSchema, passwordSchema, usernameSchema } from '../validation';

// ── Registration (005 FR-001 – FR-006, D9) ─────────────────────────────────

export const registerRequestSchema = z.strictObject({
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  language: languageSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export interface RegistrationStatusResponse {
  open: boolean;
}

// ── Access of a worker (FR-007 – FR-023) ───────────────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const idSchema = z.string().min(1).max(64);

export const accessInputSchema = z.strictObject({
  permissions: permissionSetSchema,
  orderScope: orderScopeSchema,
  /** Required (at least one) for the "customers" scope. */
  customerIds: z.array(idSchema).max(500).optional(),
  ownEntriesOnly: z.boolean(),
  /** Last day of access, `YYYY-MM-DD` (China time); null for no end. */
  accessEndsOn: z.string().regex(DATE_PATTERN, 'date_invalid').nullable(),
});
export type AccessInput = z.input<typeof accessInputSchema>;

export const approveRequestSchema = z.strictObject({
  templateId: z.string({ error: 'template_invalid' }).min(1, 'template_invalid').max(64, 'template_invalid'),
  access: accessInputSchema.optional(),
});
export type ApproveRequest = z.input<typeof approveRequestSchema>;

export const applyTemplateRequestSchema = z.strictObject({ templateId: approveRequestSchema.shape.templateId });

export const updateUserRequestSchema = z.strictObject({
  displayName: displayNameSchema.optional(),
  language: languageSchema.optional(),
});

export const resetPasswordRequestSchema = z.strictObject({ temporaryPassword: passwordSchema });

export const userOrdersRequestSchema = z.strictObject({ orderIds: z.array(idSchema).max(1000) });
export const orderAssigneesRequestSchema = z.strictObject({ userIds: z.array(idSchema).max(100) });

export interface TemplateRef {
  id: string;
  defaultKey: TemplateKey | null;
  name: string | null;
  deleted: boolean;
}

export interface UserListItem {
  id: string;
  username: string;
  displayName: string;
  language: Language;
  status: UserStatus;
  /** Active, but past the access end date (FR-023). */
  accessEnded: boolean;
  template: TemplateRef | null;
  /** The access was changed after the template was applied. */
  adjusted: boolean;
  lastSignInAt: string | null;
  registeredAt: string;
  /** Pending registrations: where and when they registered (FR-003). */
  registration: { deviceLabel: string | null; location: string | null; at: string } | null;
}

export interface UserDetail extends UserListItem {
  permissions: PermissionSet;
  orderScope: OrderScope;
  customers: { id: string; name: string }[];
  ownEntriesOnly: boolean;
  accessEndsOn: string | null;
  assignedOrders: { id: string; number: string; title: string; status: OrderStatus }[];
  mustChangePassword: boolean;
}

export interface UsersResponse {
  items: UserListItem[];
  pendingCount: number;
}

export interface OrderAssignee {
  userId: string;
  displayName: string;
}

// ── Role templates (FR-015 – FR-017) ───────────────────────────────────────

const templateNameSchema = z
  .string({ error: 'name_invalid' })
  .trim()
  .min(1, 'name_invalid')
  .max(MAX_TEMPLATE_NAME_LENGTH, 'name_invalid');

export const templateInputSchema = z.strictObject({
  name: templateNameSchema.nullable(),
  permissions: permissionSetSchema,
  orderScope: orderScopeSchema,
  ownEntriesOnly: z.boolean(),
});
export type TemplateInput = z.input<typeof templateInputSchema>;

export const createTemplateRequestSchema = templateInputSchema.extend({ name: templateNameSchema });

export interface RoleTemplate {
  id: string;
  defaultKey: TemplateKey | null;
  name: string | null;
  permissions: PermissionSet;
  orderScope: OrderScope;
  ownEntriesOnly: boolean;
  /** Workers who started from this template. */
  usedBy: number;
}
