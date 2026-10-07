import { expect, test } from '@playwright/test';
import { apiOrder, signIn } from './helpers';

// 002 quickstart V9, V10 / US3.
test('customers: Arabic name, duplicate warning, search, and their orders', async ({ page }) => {
  await signIn(page, '/customers/new');
  const tag = Date.now().toString(36);
  const name = `شركة الدار البيضاء للمعدات ${tag}`;

  await page.getByLabel('Name').fill(name);
  await page.getByLabel('City').fill('Casablanca');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  const customerId = page.url().split('/').pop()!;

  // Same name again → warning → create anyway.
  await page.goto('/customers/new');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('A customer with this name already exists.')).toBeVisible();
  await page.getByRole('button', { name: 'Create anyway' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);

  // Search the list by an Arabic fragment.
  await page.goto('/customers');
  await page.getByRole('searchbox').fill(`الدار البيضاء للمعدات ${tag}`);
  await expect(page.getByRole('link', { name: new RegExp(tag) })).toHaveCount(2);

  // The customer page lists their orders.
  await apiOrder(page, { title: `Order for ${tag}`, customerId, agreedPrice: '1000', currency: 'MAD' });
  await page.goto(`/customers/${customerId}`);
  await expect(page.getByRole('link', { name: new RegExp(`Order for ${tag}`) })).toBeVisible();
  await page.getByRole('link', { name: 'New order for this customer' }).click();
  await expect(page.getByText(name)).toBeVisible(); // preselected in the form
});

test('suppliers: create with WeChat and contact person', async ({ page }) => {
  await signIn(page, '/suppliers/new');
  const tag = Date.now().toString(36);
  await page.getByLabel('Name').fill(`临沂重工 ${tag}`);
  await page.getByLabel('Contact person').fill('Mr. Wang');
  await page.getByLabel('WeChat ID').fill('wang_linyi');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`临沂重工 ${tag}`);
  await expect(page.getByText('wang_linyi')).toBeVisible();
  await expect(page.getByText('China')).toBeVisible();
});
