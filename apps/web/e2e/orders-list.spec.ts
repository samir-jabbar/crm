import { expect, test } from '@playwright/test';
import { apiCustomer, apiOrder, expectNoHorizontalScroll, signIn } from './helpers';

// 002 quickstart V5, V7, V8 / US2.
test('find an order, change its status, browse tabs and edit an item', async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const customer = await apiCustomer(page, `Société Éloïse ${tag}`);
  const order = await apiOrder(page, {
    title: `Doosan pair ${tag}`,
    customerId: customer.id,
    agreedPrice: '190000',
    currency: 'USD',
    status: 'confirmed',
    items: [{ productName: 'Excavator', brandModel: `DX225-${tag}`, quantity: 2, unitPrice: '85000' }],
  });

  // Search by item model, then by customer without accents.
  await page.goto('/orders');
  await page.getByRole('searchbox').fill(`dx225-${tag}`);
  await expect(page.getByRole('link', { name: new RegExp(`Doosan pair ${tag}`) })).toBeVisible();
  await page.getByRole('searchbox').fill(`societe eloise ${tag}`);
  await expect(page.getByRole('link', { name: new RegExp(`Doosan pair ${tag}`) })).toBeVisible();

  // Status filter.
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByRole('checkbox', { name: 'Delivered' }).check();
  await expect(page.getByRole('link', { name: new RegExp(`Doosan pair ${tag}`) })).toBeHidden();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('link', { name: new RegExp(`Doosan pair ${tag}`) })).toBeVisible();

  // Open it and change the status from the header.
  await page.getByRole('link', { name: new RegExp(`Doosan pair ${tag}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}`));
  await page.getByLabel('Status').selectOption('purchased');
  await expect(page.getByText('Purchased').first()).toBeVisible();

  // Every tab fits a phone; unbuilt ones say "coming soon".
  for (const name of ['Expenses', 'Payments', 'Shipment', 'Documents', 'Invoices', 'Reminders']) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByText(/available in a coming update/i)).toBeVisible();
    await expectNoHorizontalScroll(page);
  }

  // Edit: change the quantity; totals follow.
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.locator('[aria-label="Item 1"]').getByLabel('Quantity').fill('3');
  await page.getByRole('button', { name: 'Save order' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await expect(page.getByText(/255,000\.00/).first()).toBeVisible();
});
