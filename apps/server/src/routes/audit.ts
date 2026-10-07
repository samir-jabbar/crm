import {
  AUDIT_ACTIONS,
  auditQuerySchema,
  type AuditActionsResponse,
  type AuditActorsResponse,
  type AuditEntryItem,
  type Page,
} from '@hanjing/shared';
import type { Hono } from 'hono';
import { listAudit, listAuditActors } from '../audit/query';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { parseWith } from '../lib/validate';
import { presentAuditEntry } from '../policy/present';
import { route } from '../policy/route';

/** FR-019, FR-023: read-only, Owner-only. There is deliberately no create, update or delete route. */
export function registerAuditRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db } = deps;

  route(app, 'GET', '/api/audit', 'owner', (c) => {
    const viewer = c.get('user')!;
    const page = listAudit(db, parseWith(auditQuerySchema, c.req.query()));
    return c.json<Page<AuditEntryItem>>({
      items: page.items.map((row) => presentAuditEntry(row, { viewer })),
      nextCursor: page.nextCursor,
    });
  });

  route(app, 'GET', '/api/audit/actions', 'owner', (c) => c.json<AuditActionsResponse>({ items: [...AUDIT_ACTIONS] }));

  route(app, 'GET', '/api/audit/actors', 'owner', (c) => c.json<AuditActorsResponse>({ items: listAuditActors(db) }));
}
