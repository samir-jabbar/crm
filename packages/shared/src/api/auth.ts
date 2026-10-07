import { z } from 'zod';

/** Sign-in accepts any non-empty strings: shape checks would leak which part was wrong. */
export const signInRequestSchema = z.strictObject({
  username: z.string({ error: 'invalid_credentials' }).max(64, 'invalid_credentials'),
  password: z.string({ error: 'invalid_credentials' }).max(1024, 'invalid_credentials'),
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;
