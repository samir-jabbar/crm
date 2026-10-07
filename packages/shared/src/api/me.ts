import { z } from 'zod';
import type { Language, Role } from '../enums';
import { displayNameSchema, languageSchema, passwordSchema } from '../validation';

export interface MeUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  language: Language;
}

export interface MeResponse {
  user: MeUser;
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
