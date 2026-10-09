import type { Access } from '@hanjing/shared';
import { and } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { openDb, runMigrations } from '../../src/db/client';
import { customers, expenses, orders, suppliers } from '../../src/db/schema';
import { customerVisible, orderVisible, ownEntries, supplierVisible } from '../../src/policy/scope';

const access = (orderScope: Access['orderScope'], ownEntriesOnly = false): Access => ({
  owner: false,
  userId: 'w1',
  modules: {},
  hidden: [],
  orderScope,
  ownEntriesOnly,
});

const { db, sqlite } = openDb(':memory:');

beforeAll(() => {
  runMigrations(db);
  sqlite.exec(`
    insert into users (id, username, username_normalized, display_name, password_hash, role, status, language, password_changed_at, created_at, updated_at)
      values ('own', 'hicham', 'hicham', 'H', 'x', 'owner', 'active', 'en', 0, 0, 0),
             ('w1', 'youssef', 'youssef', 'Y', 'x', 'worker', 'active', 'en', 0, 0, 0);
    insert into customers (id, name, created_at, updated_at, created_by) values
      ('c-atlas', 'Atlas', 0, 0, 'own'), ('c-sahara', 'Sahara', 0, 0, 'own'), ('c-mine', 'Mine', 0, 0, 'w1');
    insert into suppliers (id, name, created_at, updated_at, created_by) values
      ('s-item', 'Lingong', 0, 0, 'own'), ('s-paid', 'Weichai', 0, 0, 'own'), ('s-other', 'Other', 0, 0, 'own'), ('s-mine', 'Mine', 0, 0, 'w1');
    insert into orders (id, number, number_year, number_seq, title, customer_id, agreed_price_minor, currency, created_at, updated_at, created_by) values
      ('o1', 'HJ-2026-001', 2026, 1, 'A', 'c-atlas', 1, 'CNY', 0, 0, 'own'),
      ('o2', 'HJ-2026-002', 2026, 2, 'B', 'c-sahara', 1, 'CNY', 0, 0, 'own'),
      ('o3', 'HJ-2026-003', 2026, 3, 'C', 'c-atlas', 1, 'CNY', 0, 0, 'own');
    insert into order_items (id, order_id, position, product_name, quantity, unit_price_minor, supplier_id) values
      ('i1', 'o1', 0, 'Excavator', 1, 1, 's-item'), ('i2', 'o2', 0, 'Loader', 1, 1, 's-other');
    insert into expenses (id, order_id, name, category_id, amount_minor, currency, rate_micro, rate_source, cny_minor, expense_date, paid_to_supplier_id, created_at, updated_at, created_by, updated_by) values
      ('e1', 'o1', 'Engine', 'cat-other', 1, 'CNY', 1000000, 'manual', 1, '2026-10-01', 's-paid', 0, 0, 'own', 'own'),
      ('e2', 'o1', 'Hotel', 'cat-other', 1, 'CNY', 1000000, 'manual', 1, '2026-10-01', null, 0, 0, 'w1', 'w1');
    insert into order_assignments (order_id, user_id, assigned_at) values ('o1', 'w1', 0);
    insert into user_customers (user_id, customer_id) values ('w1', 'c-atlas');
  `);
});

const orderIds = (a: Access) => db.select({ id: orders.id }).from(orders).where(orderVisible(a)).all().map((r) => r.id).sort();
const customerIds = (a: Access) => db.select({ id: customers.id }).from(customers).where(customerVisible(a)).all().map((r) => r.id).sort();
const supplierIds = (a: Access) => db.select({ id: suppliers.id }).from(suppliers).where(supplierVisible(a)).all().map((r) => r.id).sort();

// 005 FR-018 – FR-022, research R3.
describe('scope predicates', () => {
  it('lets the "all orders" scope and the Owner through', () => {
    expect(orderVisible(access('all'))).toBeUndefined();
    expect(orderIds(access('all'))).toEqual(['o1', 'o2', 'o3']);
  });

  it('limits to assigned orders, and to the customers and suppliers linked to them', () => {
    expect(orderIds(access('assigned'))).toEqual(['o1']);
    expect(customerIds(access('assigned'))).toEqual(['c-atlas', 'c-mine']);
    expect(supplierIds(access('assigned'))).toEqual(['s-item', 's-mine', 's-paid']);
  });

  it("limits to the selected customers' orders, including later ones", () => {
    expect(orderIds(access('customers'))).toEqual(['o1', 'o3']);
    expect(customerIds(access('customers'))).toEqual(['c-atlas', 'c-mine']);
  });

  it('filters records inside orders by their order, and by author for own entries', () => {
    const rows = (a: Access) =>
      db.select({ id: expenses.id }).from(expenses).where(and(orderVisible(a, expenses.orderId), ownEntries(a, expenses.createdBy))).all().map((r) => r.id).sort();
    expect(rows(access('assigned'))).toEqual(['e1', 'e2']);
    expect(rows(access('assigned', true))).toEqual(['e2']);
    expect(rows(access('customers', true))).toEqual(['e2']);
  });
});
