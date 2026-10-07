import type { SignInOutcome, SignInReason } from '@hanjing/shared';
import type { Clock } from '../clock';
import type { Executor } from '../db/client';
import { signInAttempts } from '../db/schema';
import { newId } from '../lib/ids';
import type { RequestCtx } from '../lib/requestContext';

/** Placeholder username for failed setup-code attempts: they count toward the per-IP block only. */
export const SETUP_ATTEMPT_USERNAME = '(setup)';

export interface AttemptInput {
  usernameInput: string;
  usernameNormalized: string;
  userId: string | null;
  outcome: SignInOutcome;
  reason: SignInReason;
  ctx: RequestCtx;
}

/** One row per attempt: feeds the sign-in history (FR-016) and the guessing blocks (FR-011). */
export function recordSignInAttempt(tx: Executor, clock: Clock, input: AttemptInput): void {
  tx.insert(signInAttempts)
    .values({
      id: newId(),
      occurredAt: clock.now(),
      usernameInput: input.usernameInput.slice(0, 64),
      usernameNormalized: input.usernameNormalized.slice(0, 64),
      userId: input.userId,
      outcome: input.outcome,
      reason: input.reason,
      ip: input.ctx.ip,
      userAgent: input.ctx.userAgent,
      deviceLabel: input.ctx.deviceLabel,
      location: input.ctx.location,
    })
    .run();
}
