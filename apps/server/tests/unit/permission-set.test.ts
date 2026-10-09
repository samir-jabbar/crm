import { permissionConflict, permissionSetSchema, type PermissionSet } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';

const parse = (input: unknown) => permissionSetSchema.parse(input);

// 005 FR-008, FR-032, research R10.
describe('permission sets', () => {
  it('adds View to every other action and drops actions a module does not offer', () => {
    expect(parse({ modules: { expenses: ['create'], dashboard: ['edit'], settings: ['edit'] }, hidden: [] })).toEqual({
      modules: { expenses: ['view', 'create'], settings: ['view', 'edit'] },
      hidden: [],
    });
  });

  it('sorts actions and hidden groups, so equal sets compare equal', () => {
    const a = parse({ modules: { orders: ['delete', 'view', 'edit'] }, hidden: ['paymentAmounts', 'sellingPrice'] });
    const b = parse({ modules: { orders: ['edit', 'delete'] }, hidden: ['sellingPrice', 'paymentAmounts', 'sellingPrice'] });
    expect(a).toEqual(b);
    expect(a).toEqual({ modules: { orders: ['view', 'edit', 'delete'] }, hidden: ['sellingPrice', 'paymentAmounts'] });
  });

  it('refuses unknown modules, actions and groups', () => {
    expect(permissionSetSchema.safeParse({ modules: { users: ['view'] }, hidden: [] }).success).toBe(false);
    expect(permissionSetSchema.safeParse({ modules: { orders: ['approve'] }, hidden: [] }).success).toBe(false);
    expect(permissionSetSchema.safeParse({ modules: {}, hidden: ['profit'] }).success).toBe(false);
  });

  it('names each combination that cannot work', () => {
    const set = (modules: PermissionSet['modules'], hidden: PermissionSet['hidden'] = []) => parse({ modules, hidden });
    expect(permissionConflict(set({ orders: ['create'], customers: ['view'] }, ['sellingPrice']))).toBe('orders_create_needs_prices');
    expect(permissionConflict(set({ orders: ['create'] }))).toBe('orders_create_needs_customers');
    expect(permissionConflict(set({ 'payments.bank': ['edit'] }, ['paymentAmounts']))).toBe('payments_write_needs_amounts');
    expect(permissionConflict(set({ suppliers: ['view'] }, ['supplierIdentity']))).toBe('suppliers_need_identity');
    // Viewing payments without amounts, or orders without prices, is fine.
    expect(permissionConflict(set({ 'payments.bank': ['view'], orders: ['view', 'edit'] }, ['paymentAmounts', 'sellingPrice']))).toBeNull();
  });
});
