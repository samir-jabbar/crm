import { pageQuerySchema, type Page, type SignInHistoryItem } from '@hanjing/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { signInAttempts } from '../db/schema';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { decodeCursor, olderThan, toPage } from '../lib/pagination';
import { parseWith } from '../lib/validate';
import { presentSignInAttempt } from '../policy/present';
import { route } from '../policy/route';

/** FR-016: the caller's own sign-in attempts, newest first. */
export function registerSignInHistoryRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db } = deps;

  route(app, 'GET', '/api/me/sign-in-history', 'authenticated', (c) => {
    const user = c.get('user')!;
    const query = parseWith(pageQuerySchema, c.req.query());
    const cursor = decodeCursor(query.cursor);
    const rows = db
      .select()
      .from(signInAttempts)
      .where(and(eq(signInAttempts.userId, user.id), olderThan(signInAttempts.occurredAt, signInAttempts.id, cursor)))
      .orderBy(desc(signInAttempts.occurredAt), desc(signInAttempts.id))
      .limit(query.limit + 1)
      .all();
    const page = toPage(rows, query.limit, (r) => r.occurredAt);
    return c.json<Page<SignInHistoryItem>>({
      items: page.items.map((r) => presentSignInAttempt(r, { viewer: user })),
      nextCursor: page.nextCursor,
    });
  });
}
