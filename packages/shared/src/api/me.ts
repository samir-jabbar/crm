import { z } from 'zod';
import type { HiddenGroup, Language, OrderScope, Role } from '../enums';
import type { PermissionSet } from '../permissions';
import { displayNameSchema, languageSchema, passwordSchema } from '../validation';

export interface MeUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  language: Language;
  /** 005 FR-037: an Owner-set temporary password must be replaced before anything else. */
  mustChangePassword: boolean;
}

/** 005: what the signed-in user may reach. The interface uses it for layout only; the server enforces it. */
export interface MeAccess {
  owner: boolean;
  modules: PermissionSet['modules'];
  hidden: HiddenGroup[];
  orderScope: OrderScope;
  ownEntriesOnly: boolean;
  accessEndsOn: string | null;
  /** An order-bound module without Orders View: the basic order view (FR-010). */
  basicOrdersOnly: boolean;
}

export interface MeResponse {
  user: MeUser;
  access: MeAccess;
  company: { name: string };
  session: { id: string; idleTimeoutMinutes: number };
}

export const updateMeRequestSchema = z.strictObject({
  displayName: displayNameSchema.optional(),
  language: languageSchema.optional(),
});
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

export const changePasswordRequestSchema = z.strictObject({
  currentPassword: z.string({ error: 'current_password_invalid' }).max(1024, 'current_password_invalid'),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
