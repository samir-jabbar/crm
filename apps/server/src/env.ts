import type { SessionRow, UserRow } from './db/schema';
import type { RequestCtx } from './lib/requestContext';

/** Hono context variables set by the request pipeline (see app.ts). */
export interface AppEnv {
  Variables: {
    user: UserRow | null;
    session: SessionRow | null;
    reqCtx: RequestCtx;
  };
}
