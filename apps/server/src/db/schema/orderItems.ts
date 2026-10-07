import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { orders } from './orders';
import { suppliers } from './suppliers';

/** Equipment lines of an order. Replaced as part of an order edit; history lives in the order's audit entries. */
export const orderItems = sqliteTable(
  'order_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    position: integer('position').notNull(),
    productName: text('product_name').notNull(),
    brandModel: text('brand_model'),
    year: integer('year'),
    quantity: integer('quantity').notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    hsCode: text('hs_code'),
    specs: text('specs'),
    supplierId: text('supplier_id').references(() => suppliers.id),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId, t.position),
    index('order_items_supplier_idx').on(t.supplierId),
    check('order_items_quantity_check', sql`quantity BETWEEN 1 AND 100000`),
    check('order_items_price_check', sql`unit_price_minor BETWEEN 0 AND 100000000000000`),
    check('order_items_year_check', sql`year IS NULL OR year BETWEEN 1950 AND 2100`),
  ],
);

export type OrderItemRow = typeof orderItems.$inferSelect;
