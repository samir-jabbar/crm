import type { ExpenseCategoryRef } from '@hanjing/shared';
import type { TFunction } from 'i18next';

/** A typed or renamed name wins; default categories otherwise follow the user's language (003 FR-021). */
export function categoryLabel(category: Pick<ExpenseCategoryRef, 'key' | 'name'>, t: TFunction): string {
  if (category.name) return category.name;
  return category.key ? t(`expenseCategory.${category.key}`) : '';
}
