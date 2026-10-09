import { z } from 'zod';
import {
  HIDDEN_GROUPS,
  MODULE_ACTIONS,
  MODULES,
  ORDER_BOUND_MODULES,
  ORDER_SCOPES,
  POLICY_ACTIONS,
  PURCHASE_CATEGORY_ID,
  type HiddenGroup,
  type Module,
  type OrderScope,
  type PolicyAction,
} from './enums';

// ── Permission sets (005 research R1, R10) ─────────────────────────────────

/** What a worker (or a role template) may do: actions per module, and the value groups hidden from them. */
export interface PermissionSet {
  modules: Partial<Record<Module, PolicyAction[]>>;
  hidden: HiddenGroup[];
}

/**
 * Normalize a permission set (FR-008): Create, Edit, Delete and Export include View; actions a module does not offer
 * are dropped; modules without actions are removed; everything is sorted, so equal sets compare equal.
 */
export function normalizePermissionSet(set: PermissionSet): PermissionSet {
  const modules: PermissionSet['modules'] = {};
  for (const module of MODULES) {
    const asked = new Set(set.modules[module] ?? []);
    const offered = MODULE_ACTIONS[module];
    const kept = POLICY_ACTIONS.filter((a) => asked.has(a) && offered.includes(a));
    if (kept.length === 0) continue;
    if (offered.includes('view') && !kept.includes('view')) kept.unshift('view');
    modules[module] = POLICY_ACTIONS.filter((a) => kept.includes(a));
  }
  const hidden = HIDDEN_GROUPS.filter((g) => set.hidden.includes(g));
  return { modules, hidden };
}

export const permissionSetSchema = z
  .strictObject({
    modules: z.partialRecord(z.enum(MODULES), z.array(z.enum(POLICY_ACTIONS)).max(POLICY_ACTIONS.length)),
    hidden: z.array(z.enum(HIDDEN_GROUPS)).max(HIDDEN_GROUPS.length),
  })
  .transform((set) => normalizePermissionSet(set as PermissionSet));

export const PERMISSION_CONFLICTS = [
  'orders_create_needs_prices',
  'orders_create_needs_customers',
  'payments_write_needs_amounts',
  'suppliers_need_identity',
] as const;
export type PermissionConflict = (typeof PERMISSION_CONFLICTS)[number];

/** Combinations that cannot work (FR-032). Checked by the editor and enforced by the server. */
export function permissionConflict(set: PermissionSet): PermissionConflict | null {
  const has = (m: Module, a: PolicyAction) => (set.modules[m] ?? []).includes(a);
  const hides = (g: HiddenGroup) => set.hidden.includes(g);
  if (has('orders', 'create') && hides('sellingPrice')) return 'orders_create_needs_prices';
  if (has('orders', 'create') && !has('customers', 'view')) return 'orders_create_needs_customers';
  const paymentWrite = (['payments.direct', 'payments.bank'] as const).some((m) => has(m, 'create') || has(m, 'edit'));
  if (paymentWrite && hides('paymentAmounts')) return 'payments_write_needs_amounts';
  if (set.modules.suppliers && hides('supplierIdentity')) return 'suppliers_need_identity';
  return null;
}

export const orderScopeSchema = z.enum(ORDER_SCOPES);

// ── Access: what one viewer may reach, built per request on the server ────

export interface Access extends PermissionSet {
  owner: boolean;
  userId: string;
  orderScope: OrderScope;
  ownEntriesOnly: boolean;
}

export function ownerAccess(userId: string): Access {
  const modules: PermissionSet['modules'] = {};
  for (const module of MODULES) modules[module] = [...MODULE_ACTIONS[module]];
  return { owner: true, userId, modules, hidden: [], orderScope: 'all', ownEntriesOnly: false };
}

export function hasAction(access: Pick<Access, 'modules'>, module: Module, action: PolicyAction): boolean {
  return (access.modules[module] ?? []).includes(action);
}

export function isHidden(access: Pick<Access, 'hidden'>, group: HiddenGroup): boolean {
  return access.hidden.includes(group);
}

export function bothChannels(access: Pick<Access, 'modules'>): boolean {
  return hasAction(access, 'payments.direct', 'view') && hasAction(access, 'payments.bank', 'view');
}

/** FR-010: an order-bound module without Orders View gives only the basic view of the orders in scope. */
export function basicOrdersOnly(access: Pick<Access, 'modules' | 'owner'>): boolean {
  if (access.owner || hasAction(access, 'orders', 'view')) return false;
  return ORDER_BOUND_MODULES.some((m) => hasAction(access, m, 'view'));
}

/** Can the viewer reach orders at all (full or basic view)? */
export function reachesOrders(access: Pick<Access, 'modules' | 'owner'>): boolean {
  return access.owner || hasAction(access, 'orders', 'view') || basicOrdersOnly(access);
}

// ── Derived figures (D6 inheritance, research R4) ─────────────────────────

interface FigureRule {
  /** Every one of these groups must be visible. */
  groups: HiddenGroup[];
  /** Combines both payment channels: the viewer must see both. */
  bothChannels?: boolean;
  /** Sums every expense of the order: the viewer must see all of them (Expenses View, not own entries only). */
  allExpenses?: boolean;
  /** Needs every entry, not only the viewer's own (FR-028). */
  allEntries?: boolean;
}

/** Each derived figure and what the viewer must be able to see for it to be shown. */
export const FIGURES = {
  agreedPriceCny: { groups: ['sellingPrice'] },
  expensesTotal: { groups: ['supplierPrices'], allExpenses: true },
  unpaid: { groups: ['supplierPrices'], allExpenses: true },
  categoryTotal: { groups: [], allExpenses: true },
  budgetUsedPercent: { groups: ['sellingPrice', 'supplierPrices'], allExpenses: true },
  profit: { groups: ['sellingPrice', 'paymentAmounts', 'supplierPrices'], bothChannels: true, allExpenses: true },
  marginPercent: { groups: ['sellingPrice', 'paymentAmounts', 'supplierPrices'], bothChannels: true, allExpenses: true },
  received: { groups: ['paymentAmounts'], bothChannels: true },
  receivedCny: { groups: ['paymentAmounts'], bothChannels: true },
  receivedTotals: { groups: ['paymentAmounts'], bothChannels: true },
  averageRates: { groups: ['paymentAmounts'], bothChannels: true },
  remaining: { groups: ['sellingPrice', 'paymentAmounts'], bothChannels: true },
  remainingCny: { groups: ['sellingPrice', 'paymentAmounts'], bothChannels: true },
  percentPaid: { groups: ['sellingPrice', 'paymentAmounts'], bothChannels: true },
  overpaid: { groups: ['sellingPrice', 'paymentAmounts'], bothChannels: true },
  warnings: { groups: ['sellingPrice', 'paymentAmounts'], bothChannels: true },
  fxResultCny: { groups: ['sellingPrice', 'paymentAmounts'], bothChannels: true },
  channelPlanned: { groups: ['sellingPrice'] },
  stageAmount: { groups: ['sellingPrice'] },
  channelReceived: { groups: ['paymentAmounts'] },
  channelRemaining: { groups: ['sellingPrice', 'paymentAmounts'], allEntries: true },
  customerBalance: { groups: ['sellingPrice', 'paymentAmounts'], bothChannels: true },
} as const satisfies Record<string, FigureRule>;
export type Figure = keyof typeof FIGURES;

/** Does the viewer see every expense of an order? */
export function seesAllExpenses(access: Pick<Access, 'modules' | 'ownEntriesOnly'>): boolean {
  return hasAction(access, 'expenses', 'view') && !access.ownEntriesOnly;
}

/** Is a derived figure visible to this viewer? (FR-027) */
export function figureVisible(access: Pick<Access, 'modules' | 'hidden' | 'ownEntriesOnly' | 'owner'>, figure: Figure): boolean {
  if (access.owner) return true;
  const rule: FigureRule = FIGURES[figure];
  if (rule.groups.some((g) => isHidden(access, g))) return false;
  if (rule.bothChannels && (!bothChannels(access) || access.ownEntriesOnly)) return false;
  if (rule.allExpenses && !seesAllExpenses(access)) return false;
  if (rule.allEntries && access.ownEntriesOnly) return false;
  return true;
}

/** A purchase from a supplier: its amounts are hidden with `supplierPrices` (FR-025). */
export function isPurchaseExpense(expense: { categoryId: string; paidToSupplierId: string | null }): boolean {
  return expense.categoryId === PURCHASE_CATEGORY_ID || expense.paidToSupplierId !== null;
}
