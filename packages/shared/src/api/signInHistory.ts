import { z } from 'zod';
import type { SignInOutcome, SignInReason } from '../enums';

export interface SignInHistoryItem {
  id: string;
  occurredAt: string;
  outcome: SignInOutcome;
  reason: SignInReason;
  deviceLabel: string;
  ip: string;
  location: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const pageQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;
