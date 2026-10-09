import { expect, test } from '@playwright/test';
import { apiCustomer, apiOrder, signIn } from './helpers';

// 002 quickstart V1 / US1, SC-001.
test('create an order on a phone with a new customer and a new supplier', async ({ page }) => {
  const started = Date.now();
  const suffix = Date.now().toString(36);
  await signIn(page, '/orders/new');

  await page.getByLabel('Title').fill('2 Doosan excavators');

  // Customer created on the spot.
  await page.getByRole('combobox', { name: 'Customer' }).fill(`Atlas Équipements ${suffix}`);
  await page.getByRole('button', { name: /^Create “Atlas/ }).click();
  const customerDialog = page.getByRole('dialog', { name: 'New customer' });
  await expect(customerDialog.getByLabel('Name')).toHaveValue(`Atlas Équipements ${suffix}`);
  await customerDialog.getByLabel('City').fill('Casablanca');
  await customerDialog.getByRole('button', { name: 'Save' }).click();
  await expect(customerDialog).toBeHidden();
  await expect(page.getByLabel('Delivery city')).toHaveValue('Casablanca');

  // Price, Incoterm, port.
  await page.getByLabel('Agreed price').fill('190000');
  await page.getByLabel('Agreed rate').fill('7.1'); // 003: required for non-CNY orders
  await page.getByLabel('Incoterm').selectOption('CIF');
  await page.getByLabel('Destination port').fill('Casablanca');

  // Item 1.
  const item1 = page.locator('[aria-label="Item 1"]');
  await item1.getByLabel('Product name').fill('Excavator');
  await item1.getByLabel('Brand / model').fill('Doosan DX225LC');
  await item1.getByLabel('Quantity').fill('2');
  await item1.getByLabel('Unit price (USD)').fill('85000');

  // Item 2 with a supplier created on the spot.
  await page.getByRole('button', { name: 'Add item' }).click();
  const item2 = page.locator('[aria-label="Item 2"]');
  await item2.getByLabel('Product name').fill('Breaker hammer');
  await item2.getByLabel('Unit price (USD)').fill('12500');
  await item2.getByRole('combobox', { name: 'Supplier' }).fill(`Linyi Heavy ${suffix}`);
  await item2.getByRole('button', { name: /^Create “Linyi/ }).click();
  const supplierDialog = page.getByRole('dialog', { name: 'New supplier' });
  await supplierDialog.getByRole('button', { name: 'Save' }).click();
  await expect(supplierDialog).toBeHidden();

  // Live totals before saving.
  await expect(page.getByText(/182,500\.00/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Create order' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^HJ-\d{4}-\d{3,}$/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2 Doosan excavators');
  await expect(page.getByText(/182,500\.00/).first()).toBeVisible(); // items total
  await expect(page.getByText(/\+.*7,500\.00/).first()).toBeVisible(); // difference
  await expect(page.getByText(`Linyi Heavy ${suffix}`)).toBeVisible();
  expect(Date.now() - started).toBeLessThan(120_000);
});

test('missing fields are highlighted and nothing typed is lost', async ({ page }) => {
  await signIn(page, '/orders/new');
  await page.getByLabel('Title').fill('Kept title');
  await page.getByRole('button', { name: 'Create order' }).click();
  await expect(page.getByText('Choose a customer.')).toBeVisible();
  await expect(page.getByText('Enter the product name.')).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Kept title');
});

// 002 quickstart V11, V12 / US4.
test('duplicate an order, then add and delete notes', async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const customer = await apiCustomer(page, `Repeat buyer ${tag}`);
  const original = await apiOrder(page, {
    title: `Three machines ${tag}`,
    customerId: customer.id,
    agreedPrice: '50000',
    currency: 'EUR',
    agreedRate: '7.8',
    items: [
      { productName: 'Forklift', quantity: 1, unitPrice: '20000' },
      { productName: 'Crusher', quantity: 1, unitPrice: '25000' },
      { productName: 'Spare parts', quantity: 5, unitPrice: '1000' },
    ],
  });

  await page.goto(`/orders/${original.id}`);
  const started = Date.now();
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Three machines ${tag} (copy)`);
  expect(page.url()).not.toContain(original.id);
  expect(Date.now() - started).toBeLessThan(15_000); // SC-004
  await expect(page.getByText('Draft').first()).toBeVisible();
  await expect(page.getByText('Spare parts')).toBeVisible();

  await page.getByRole('tab', { name: 'Notes' }).click();
  await expect(page.getByText('No notes yet.')).toBeVisible(); // notes are not copied
  const notes = page.getByRole('list', { name: 'Notes' }).getByRole('listitem');
  await page.getByLabel('New note').fill('Customer asked for an extra bucket');
  await page.getByRole('button', { name: 'Add note' }).click();
  // Type the next note right away, while the first may still be saving: it must not be wiped.
  await page.getByLabel('New note').fill('Deliver before the end of the month');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(notes).toHaveCount(2);
  await expect(notes.first()).toContainText('Deliver before the end of the month');

  await notes.nth(1).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(notes).toHaveCount(1);
});

// 002 quickstart V13, V14 / US5.
test('delete and restore an order; a customer in use cannot be deleted', async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const customer = await apiCustomer(page, `Busy customer ${tag}`);
  const order = await apiOrder(page, { title: `Mistake ${tag}`, customerId: customer.id, agreedPrice: '10', currency: 'USD', agreedRate: '7.1' });

  // A customer with orders cannot be deleted.
  await page.goto(`/customers/${customer.id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog')).toContainText('Still used by 1 order(s)');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Delete the order.
  await page.goto(`/orders/${order.id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await page.getByRole('searchbox').fill(`Mistake ${tag}`);
  await expect(page.getByText('No orders match.')).toBeVisible();

  // Restore it from the deleted orders.
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByLabel('Show deleted orders').check();
  await expect(page.getByText(`Mistake ${tag}`)).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText(`Mistake ${tag}`)).toBeHidden();
  await page.getByLabel('Show deleted orders').uncheck();
  await expect(page.getByRole('link', { name: new RegExp(`Mistake ${tag}`) })).toBeVisible();
});
