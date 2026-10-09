import { basicOrdersOnly, figureVisible, isPurchaseExpense, ownerAccess, type Access, type PermissionSet } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';

const worker = (modules: PermissionSet['modules'], hidden: PermissionSet['hidden'] = [], ownEntriesOnly = false): Access => ({
  owner: false,
  userId: 'w',
  modules,
  hidden,
  orderScope: 'all',
  ownEntriesOnly,
});

const everything: PermissionSet['modules'] = {
  orders: ['view'],
  expenses: ['view'],
  'payments.direct': ['view'],
  'payments.bank': ['view'],
};

// 005 FR-027, FR-029, research R4 (D6 inheritance).
describe('derived figures', () => {
  it('shows everything to the Owner and to a worker who sees every input', () => {
    expect(figureVisible(ownerAccess('o'), 'profit')).toBe(true);
    expect(figureVisible(worker(everything), 'profit')).toBe(true);
    expect(figureVisible(worker(everything), 'fxResultCny')).toBe(true);
  });

  it('hides profit when any of its inputs is hidden', () => {
    expect(figureVisible(worker(everything, ['sellingPrice']), 'profit')).toBe(false);
    expect(figureVisible(worker(everything, ['paymentAmounts']), 'profit')).toBe(false);
    expect(figureVisible(worker(everything, ['supplierPrices']), 'profit')).toBe(false);
    expect(figureVisible(worker({ ...everything, 'payments.direct': undefined }), 'profit')).toBe(false);
    expect(figureVisible(worker({ ...everything, expenses: undefined }), 'profit')).toBe(false);
    expect(figureVisible(worker(everything, [], true), 'profit')).toBe(false);
  });

  it('keeps per-channel figures that need only that channel', () => {
    const bankOnly = worker({ orders: ['view'], 'payments.bank': ['view'] }, ['sellingPrice']);
    expect(figureVisible(bankOnly, 'channelReceived')).toBe(true);
    expect(figureVisible(bankOnly, 'channelPlanned')).toBe(false);
    expect(figureVisible(bankOnly, 'received')).toBe(false);
    expect(figureVisible(bankOnly, 'averageRates')).toBe(false);
  });

  it('needs both channels and the agreed rate for the exchange result', () => {
    expect(figureVisible(worker(everything, ['sellingPrice']), 'fxResultCny')).toBe(false);
    expect(figureVisible(worker({ ...everything, 'payments.bank': undefined }), 'fxResultCny')).toBe(false);
  });

  it('hides expense totals from a worker who sees only their own entries or no purchase prices', () => {
    expect(figureVisible(worker(everything, [], true), 'expensesTotal')).toBe(false);
    expect(figureVisible(worker(everything, ['supplierPrices']), 'expensesTotal')).toBe(false);
    expect(figureVisible(worker(everything, ['supplierPrices']), 'categoryTotal')).toBe(true);
  });

  it('gives the basic order view to order-bound modules without Orders View', () => {
    expect(basicOrdersOnly(worker({ shipments: ['view'], documents: ['view'] }))).toBe(true);
    expect(basicOrdersOnly(worker({ orders: ['view'], shipments: ['view'] }))).toBe(false);
    expect(basicOrdersOnly(worker({ customers: ['view'] }))).toBe(false);
  });

  it('recognizes supplier purchases', () => {
    expect(isPurchaseExpense({ categoryId: 'cat-equipment_purchase', paidToSupplierId: null })).toBe(true);
    expect(isPurchaseExpense({ categoryId: 'cat-hotel_accommodation', paidToSupplierId: 'sup-1' })).toBe(true);
    expect(isPurchaseExpense({ categoryId: 'cat-hotel_accommodation', paidToSupplierId: null })).toBe(false);
  });
});
