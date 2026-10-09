import { categoriesQuerySchema, createCategorySchema, patchCategorySchema, type ExpenseCategory } from '@hanjing/shared';
import type { Hono } from 'hono';
import type { Deps } from '../deps';
import type { AppEnv } from '../env';
import { createCategory, listCategories, updateCategory } from '../expenses/categories';
import { parseWith, readJsonBody } from '../lib/validate';
import { presentCategory } from '../policy/present';
import { requirePermission } from '../policy/authorize';
import { route } from '../policy/route';

/** 003 FR-021 – FR-022 (expense categories). Reading is expenses:view; changes are owner-only (settings). */
export function registerExpenseCategoryRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const { db, clock } = deps;

  route(app, 'GET', '/api/expense-categories', { module: 'expenses', action: 'view' }, (c) => {
    const viewer = c.get('user')!;
    const { includeHidden } = parseWith(categoriesQuerySchema, c.req.query());
    const items = listCategories(db, { includeHidden }).map((row) => presentCategory(row, { viewer }));
    return c.json<{ items: ExpenseCategory[] }>({ items });
  });

  // 005 FR-009: changing categories needs Settings edit and access to Expenses.
  route(app, 'POST', '/api/expense-categories', { module: 'settings', action: 'edit' }, async (c) => {
    requirePermission(c.get('user'), 'expenses', 'view');
    const viewer = c.get('user')!;
    const { name } = parseWith(createCategorySchema, await readJsonBody(c));
    const row = db.transaction((tx) => createCategory(tx, clock, name, viewer, c.get('reqCtx')));
    return c.json<ExpenseCategory>(presentCategory(row, { viewer }), 201);
  });

  route(app, 'PATCH', '/api/expense-categories/:id', { module: 'settings', action: 'edit' }, async (c) => {
    requirePermission(c.get('user'), 'expenses', 'view');
    const viewer = c.get('user')!;
    const patch = parseWith(patchCategorySchema, await readJsonBody(c));
    const row = db.transaction((tx) => updateCategory(tx, clock, c.req.param('id') ?? '', patch, viewer, c.get('reqCtx')));
    return c.json<ExpenseCategory>(presentCategory(row, { viewer }));
  });
}
