import { createTemplateRequestSchema, templateInputSchema, type RoleTemplate } from '@hanjing/shared';
import type { Context, Hono } from 'hono';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { parseWith, readJsonBody } from '../lib/validate';
import { presentRoleTemplate } from '../policy/present';
import { route } from '../policy/route';
import { templateUsage } from '../users/query';
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from '../users/templates';

/** 005 FR-015 – FR-017: reusable role templates, for the Owner only. */
export function registerRoleTemplateRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db } = deps;
  const id = (c: Context<AppEnv>) => c.req.param('id')!;

  route(app, 'GET', '/api/role-templates', 'owner', (c) => {
    const usage = templateUsage(db);
    const viewer = c.get('user')!;
    return c.json<RoleTemplate[]>(listTemplates(db).map((row) => presentRoleTemplate(row, usage.get(row.id) ?? 0, { viewer })));
  });

  route(app, 'POST', '/api/role-templates', 'owner', async (c) => {
    const input = parseWith(createTemplateRequestSchema, await readJsonBody(c));
    const row = createTemplate(deps, input, c.get('user')!, c.get('reqCtx'));
    return c.json<RoleTemplate>(presentRoleTemplate(row, 0, { viewer: c.get('user')! }), 201);
  });

  route(app, 'PUT', '/api/role-templates/:id', 'owner', async (c) => {
    const input = parseWith(templateInputSchema, await readJsonBody(c));
    const row = updateTemplate(deps, id(c), input, c.get('user')!, c.get('reqCtx'));
    return c.json<RoleTemplate>(presentRoleTemplate(row, templateUsage(db).get(row.id) ?? 0, { viewer: c.get('user')! }));
  });

  route(app, 'DELETE', '/api/role-templates/:id', 'owner', (c) => {
    deleteTemplate(deps, id(c), c.get('user')!, c.get('reqCtx'));
    return c.body(null, 204);
  });
}
