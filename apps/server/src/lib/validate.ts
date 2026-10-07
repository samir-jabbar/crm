import { isErrorCode, type ErrorCode } from '@hanjing/shared';
import type { Context } from 'hono';
import type { z } from 'zod';
import { AppError } from './errors';

/** Parse with a shared zod schema; issue messages are error codes (see packages/shared/src/validation.ts). */
export function parseWith<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, ErrorCode> = {};
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) fields[key] = 'unknown_field';
      continue;
    }
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_';
    if (!fields[key]) fields[key] = isErrorCode(issue.message) ? issue.message : 'invalid_value';
  }
  throw new AppError(400, 'validation_failed', { fields });
}

export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(400, 'validation_failed', { fields: { _: 'invalid_value' } });
  }
}
