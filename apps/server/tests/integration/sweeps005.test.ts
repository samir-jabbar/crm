import type { HiddenGroup, PermissionSet } from '@hanjing/shared';
import { describe, expect, it } from 'vitest';
import { registeredRoutes } from '../../src/policy/route';
import { createTestContext, seedCustomer, seedExpense, seedOrder, seedPayment, seedSupplier, TINY_JPEG, type TestClient, type TestContext } from '../helpers';

/**
 * 005 SC-001, SC-003 (research R12): call every registered GET route as a restricted worker, with the ids of the
 * seeded records, and check that no response contains a hidden value or anything from an order out of scope.
 * New routes are swept automatically: nothing here lists them by hand.
 */
const SENTINEL = {
  agreedPrice: '777123.45',
  unitPrice: '654321.09',
  budget: '5500000',
  purchase: '88888.88',
  bankPayment: '31415.92',
  directPayment: '20000.13',
  phone: '600 99 88 77',
  email: 'achat@atlas.ma',
  supplier: 'Shandong Lingong',
  // Not in the default bank list (generic reference data): only the payment names it.
  bankName: 'Hang Seng Shenzhen',
  secretTitle: 'SECRET-ORDER-C',
};

async function seed(owner: TestClient) {
  const customer = await seedCustomer(owner, { name: 'Atlas Engins', phone: `+212 ${SENTINEL.phone}`, email: SENTINEL.email });
  const supplier = await seedSupplier(owner, { name: SENTINEL.supplier });
  const order = await seedOrder(owner, {
    title: 'Order A',
    customerId: customer.id,
    agreedPrice: SENTINEL.agreedPrice,
    budgetCny: SENTINEL.budget,
    items: [{ productName: 'Excavator', quantity: 1, unitPrice: SENTINEL.unitPrice, supplierId: supplier.id }],
  });
  const orderB = await seedOrder(owner, { title: 'Order B', customerId: customer.id });
  const secret = await seedOrder(owner, { title: SENTINEL.secretTitle });
  const receipt = await owner.upload('/api/receipts', { bytes: TINY_JPEG, filename: 'r.jpg', type: 'image/jpeg' });
  const purchase = await seedExpense(owner, order.id, {
    name: 'Machine',
    categoryId: 'cat-equipment_purchase',
    amount: SENTINEL.purchase,
    currency: 'CNY',
    paidToSupplierId: supplier.id,
    receiptId: receipt.body.id,
    advancedBy: 'Ahmed',
  });
  const proof = await owner.upload('/api/payment-proofs', { bytes: TINY_JPEG, filename: 'p.jpg', type: 'image/jpeg' });
  const bank = await seedPayment(owner, order.id, {
    channel: 'bank',
    amount: SENTINEL.bankPayment,
    bank: { rate: '7.05', name: SENTINEL.bankName, rateType: 'buying', at: '2026-10-07T02:30:00.000Z' },
    proofId: proof.body.id,
  });
  const direct = await seedPayment(owner, order.id, { channel: 'direct', type: 'deposit', amount: SENTINEL.directPayment });
  const secretExpense = await seedExpense(owner, secret.id, { name: 'Secret hotel', categoryId: 'cat-hotel_accommodation', amount: '1', currency: 'CNY' });
  return { customer, supplier, order, orderB, secret, purchase, bank, direct, secretExpense };
}
type Seed = Awaited<ReturnType<typeof seed>>;

/** Fill each route's `:id` from what it addresses; fixed paths need no ids. */
function idsFor(path: string, s: Seed, target: 'visible' | 'secret'): string | null {
  const order = target === 'visible' ? s.order.id : s.secret.id;
  const rules: [RegExp, string][] = [
    [/^\/api\/orders\/:id/, order],
    [/^\/api\/expenses\/:id/, target === 'visible' ? s.purchase.id : s.secretExpense.id],
    [/^\/api\/payments\/:id/, target === 'visible' ? s.bank.id : s.direct.id],
    [/^\/api\/customers\/:id/, s.customer.id],
    [/^\/api\/suppliers\/:id/, s.supplier.id],
  ];
  if (!path.includes(':')) return path;
  for (const [pattern, id] of rules) if (pattern.test(path)) return path.replace(/:[A-Za-z]+/g, id);
  return null; // Owner-only routes with ids (users, templates): refused anyway, covered by policies005
}

const QUERY: Record<string, string> = { '/api/expenses/to-reimburse': '?person=Ahmed', '/api/rates': '?currency=USD' };

async function sweep(ctx: TestContext, worker: TestClient, s: Seed, target: 'visible' | 'secret' = 'visible') {
  const out: { path: string; status: number; text: string }[] = [];
  for (const r of registeredRoutes(ctx.app).filter((route) => route.method === 'GET')) {
    const path = idsFor(r.path, s, target);
    if (!path) continue;
    const res = await worker.request('GET', path + (QUERY[r.path] ?? ''));
    out.push({ path, status: res.status, text: typeof res.body === 'string' ? res.body : JSON.stringify(res.body) });
  }
  return out;
}

const leaks = (results: { path: string; text: string }[], needles: string[]) =>
  results.flatMap((r) => needles.filter((n) => r.text.includes(n)).map((n) => `${r.path} leaks ${n}`));

const without = (modules: PermissionSet['modules'], key: keyof PermissionSet['modules']) => {
  const { [key]: _gone, ...rest } = modules;
  return rest;
};

const ALL_MODULES: PermissionSet['modules'] = {
  orders: ['view'],
  customers: ['view'],
  suppliers: ['view'],
  expenses: ['view'],
  'payments.direct': ['view'],
  'payments.bank': ['view'],
  dashboard: ['view'],
  rates: ['view'],
  settings: ['view'],
};

describe('sentinel sweeps over every GET route', () => {
  it('AC6: a Shipments + Documents worker with prices hidden sees two orders and nothing else (SC-001)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const s = await seed(owner);
    const worker = await ctx.createWorker({
      permissions: { modules: { shipments: ['view', 'edit'], documents: ['view', 'create'] }, hidden: ['sellingPrice'] },
      orderScope: 'assigned',
      assignedOrderIds: [s.order.id, s.orderB.id],
    });
    const results = await sweep(ctx, worker, s);
    expect(leaks(results, Object.values(SENTINEL).concat([s.secret.id]))).toEqual([]);
    expect((await worker.get('/api/orders')).body.items.map((o: any) => o.title).sort()).toEqual(['Order A', 'Order B']);
    // Everything besides the basic order view, the worker's own account and shared reference data is refused.
    const open = results.filter((r) => r.status === 200).map((r) => r.path);
    for (const path of open) {
      expect(path, path).toMatch(/^\/api\/(orders$|orders\/[^/]+$|me|auth|setup|health|rates|me\/)/);
    }
    expect((await worker.get(`/api/orders/${s.secret.id}`)).status).toBe(404);
  });

  for (const [group, needles] of [
    ['sellingPrice', [SENTINEL.agreedPrice, SENTINEL.unitPrice, SENTINEL.budget]],
    ['supplierPrices', [SENTINEL.purchase]],
    ['supplierIdentity', [SENTINEL.supplier]],
    ['customerContacts', [SENTINEL.phone, SENTINEL.email]],
    ['paymentAmounts', [SENTINEL.bankPayment, SENTINEL.directPayment]],
    ['bankDetails', [SENTINEL.bankName]],
  ] as [HiddenGroup, string[]][]) {
    it(`hiding ${group} removes it from every response (SC-003)`, async () => {
      const ctx = await createTestContext();
      const owner = await ctx.createOwner();
      const s = await seed(owner);
      const modules = group === 'supplierIdentity' ? without(ALL_MODULES, 'suppliers') : ALL_MODULES;
      const worker = await ctx.createWorker({ permissions: { modules, hidden: [group] } });
      const results = await sweep(ctx, worker, s);
      expect(results.some((r) => r.status === 200)).toBe(true);
      expect(leaks(results, needles)).toEqual([]);
    });
  }

  it('a Bank-only worker never receives a Direct payment (FR-029)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const s = await seed(owner);
    const worker = await ctx.createWorker({ permissions: { modules: without(ALL_MODULES, 'payments.direct'), hidden: [] } });
    const results = await sweep(ctx, worker, s);
    expect(leaks(results, [SENTINEL.directPayment, s.direct.id])).toEqual([]);
  });

  it('an assigned-scope worker gets nothing from records out of scope (FR-013)', async () => {
    const ctx = await createTestContext();
    const owner = await ctx.createOwner();
    const s = await seed(owner);
    const worker = await ctx.createWorker({ permissions: { modules: ALL_MODULES, hidden: [] }, orderScope: 'assigned', assignedOrderIds: [s.order.id] });
    const results = await sweep(ctx, worker, s, 'secret');
    expect(leaks(results, [SENTINEL.secretTitle, 'Secret hotel'])).toEqual([]);
    for (const r of results.filter((x) => /\/(orders|expenses)\/[^/]/.test(x.path) && x.path.includes(s.secret.id))) {
      expect([403, 404], r.path).toContain(r.status);
    }
  });
});
