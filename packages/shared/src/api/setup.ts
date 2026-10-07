import { z } from 'zod';
import { displayNameSchema, languageSchema, passwordSchema, usernameSchema } from '../validation';

export const setupRequestSchema = z.strictObject({
  setupCode: z.string({ error: 'setup_code_invalid' }).trim().min(1, 'setup_code_invalid').max(64, 'setup_code_invalid'),
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  language: languageSchema,
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;

export interface SetupStatusResponse {
  setupRequired: boolean;
}
