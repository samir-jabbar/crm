import type { RoleTemplate, TemplateRef, UserListItem } from '@hanjing/shared';
import type { TFunction } from 'i18next';

/** A template's name: the Owner's own, or the translated default (005 FR-015). */
export function templateName(template: Pick<RoleTemplate | TemplateRef, 'name' | 'defaultKey'>, t: TFunction): string {
  return template.name ?? (template.defaultKey ? t(`workers.template.${template.defaultKey}`) : '');
}

/** The status shown in the Users area: "Access ended" is derived from the end date (FR-023). */
export function userStatusKey(user: Pick<UserListItem, 'status' | 'accessEnded'>): 'pending' | 'active' | 'suspended' | 'ended' | 'deleted' {
  return user.accessEnded ? 'ended' : user.status;
}

export const STATUS_TONE = { pending: 'warning', active: 'success', suspended: 'danger', ended: 'neutral', deleted: 'neutral' } as const;
