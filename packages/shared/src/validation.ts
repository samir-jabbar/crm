import { z } from 'zod';
import { LANGUAGES, PASSWORD_LENGTH, SESSION_IDLE_TIMEOUT_MINUTES, USERNAME_PATTERN } from './enums';

// Every issue message is an ErrorCode (see errors.ts) so the client can translate it.

export const usernameSchema = z
  .string({ error: 'username_invalid' })
  .trim()
  .min(3, 'username_invalid')
  .max(32, 'username_invalid')
  .regex(USERNAME_PATTERN, 'username_invalid');

export const displayNameSchema = z
  .string({ error: 'display_name_invalid' })
  .trim()
  .min(1, 'display_name_invalid')
  .max(80, 'display_name_invalid');

/** Length only; the common-password check runs on the server. */
export const passwordSchema = z
  .string({ error: 'password_too_short' })
  .min(PASSWORD_LENGTH.min, 'password_too_short')
  .max(PASSWORD_LENGTH.max, 'password_too_long');

export const languageSchema = z.enum(LANGUAGES, { error: 'language_invalid' });

export const companyNameSchema = z
  .string({ error: 'company_name_invalid' })
  .trim()
  .max(120, 'company_name_invalid');

export const sessionIdleTimeoutSchema = z
  .number({ error: 'timeout_out_of_range' })
  .int('timeout_out_of_range')
  .min(SESSION_IDLE_TIMEOUT_MINUTES.min, 'timeout_out_of_range')
  .max(SESSION_IDLE_TIMEOUT_MINUTES.max, 'timeout_out_of_range');

/** Username comparison key (FR-007): case-insensitive, trimmed. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
