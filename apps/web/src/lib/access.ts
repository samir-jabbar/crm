import {
  figureVisible,
  hasAction,
  isHidden,
  reachesOrders,
  type Access,
  type Figure,
  type HiddenGroup,
  type Module,
  type PolicyAction,
} from '@hanjing/shared';
import { useMe } from '@/api/queries';

export interface AccessHelpers {
  owner: boolean;
  /** May the user do `action` in `module`? `'payments'` means either channel. */
  can(module: Module | 'payments', action?: PolicyAction): boolean;
  /** Is this value group hidden from the user? */
  hidden(group: HiddenGroup): boolean;
  /** Is this derived figure shown to the user? (D6 inheritance, same table as the server) */
  figure(name: Figure): boolean;
  /** Can the user open orders at all (full or basic view)? */
  reachesOrders: boolean;
  /** Orders shown with number, title, customer and status only (005 FR-010). */
  basicOrdersOnly: boolean;
  ownEntriesOnly: boolean;
  /** The user does not see every order or every entry: cross-order totals cover only what they see (FR-028). */
  partialView: boolean;
}

/**
 * What the signed-in user may reach (005). Layout only: the server enforces every rule and leaves hidden values
 * out of its responses, so screens must also cope with fields that are simply absent.
 */
export function useAccess(): AccessHelpers {
  const me = useMe();
  const data = me.data;
  const access: Access | null = data
    ? {
        owner: data.access.owner,
        userId: data.user.id,
        modules: data.access.modules,
        hidden: data.access.hidden,
        orderScope: data.access.orderScope,
        ownEntriesOnly: data.access.ownEntriesOnly,
      }
    : null;
  const can = (module: Module | 'payments', action: PolicyAction = 'view') => {
    if (!access) return false;
    if (access.owner) return true;
    if (module === 'payments') return hasAction(access, 'payments.direct', action) || hasAction(access, 'payments.bank', action);
    return hasAction(access, module, action);
  };
  return {
    owner: access?.owner ?? false,
    can,
    hidden: (group) => (access ? isHidden(access, group) : true),
    figure: (name) => (access ? figureVisible(access, name) : false),
    reachesOrders: access ? reachesOrders(access) : false,
    basicOrdersOnly: data?.access.basicOrdersOnly ?? false,
    ownEntriesOnly: access?.ownEntriesOnly ?? false,
    partialView: access ? !access.owner && (access.orderScope !== 'all' || access.ownEntriesOnly) : false,
  };
}
