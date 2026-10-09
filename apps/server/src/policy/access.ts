import { ownerAccess, permissionSetSchema, type Access, type PermissionSet } from '@hanjing/shared';
import type { UserRow } from '../db/schema';

const NO_PERMISSIONS: PermissionSet = { modules: {}, hidden: [] };

/** A stored permission set, or none at all if it is missing or invalid (deny by default). */
export function parsePermissions(json: string | null): PermissionSet {
  if (!json) return NO_PERMISSIONS;
  try {
    const parsed = permissionSetSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : NO_PERMISSIONS;
  } catch {
    return NO_PERMISSIONS;
  }
}

/**
 * What one viewer may reach (005 research R2). Built once per request from the user row, which the session check
 * reloads on every request, so a permission change applies at the next request (FR-014).
 */
export function accessFor(user: UserRow): Access {
  if (user.role === 'owner') return ownerAccess(user.id);
  const permissions = parsePermissions(user.permissions);
  return {
    owner: false,
    userId: user.id,
    modules: permissions.modules,
    hidden: permissions.hidden,
    orderScope: user.orderScope,
    ownEntriesOnly: user.ownEntriesOnly,
  };
}

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Today's date in China (UTC+8, no daylight saving), as `YYYY-MM-DD`. */
export function chinaToday(ms: number): string {
  return new Date(ms + CHINA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Has the worker's access ended? The end date is inclusive: access lasts until the end of that day, China time. */
export function accessEnded(user: Pick<UserRow, 'accessEndsOn'>, now: number): boolean {
  return user.accessEndsOn !== null && chinaToday(now) > user.accessEndsOn;
}
