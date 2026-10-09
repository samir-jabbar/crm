import { expect, test } from '@playwright/test';
import { apiCustomer, apiOrder, setLanguage, signIn } from './helpers';

// 003 quickstart X15 / US6, FR-021, FR-022.
test('add a category, use it, rename it, hide it; defaults follow the language', async ({ page }) => {
  await signIn(page, '/settings');
  const tag = Date.now().toString(36);
  const added = `Spare parts ${tag}`;
  const renamed = `Hydraulic parts ${tag}`;
  const section = page.getByRole('region', { name: 'Expense categories' });

  await section.getByLabel('New category').fill(added);
  await section.getByRole('button', { name: 'Add category' }).click();
  await expect(section.getByText(added)).toBeVisible();

  // Use it on an expense.
  const customer = await apiCustomer(page, `Category customer ${tag}`);
  const order = await apiOrder(page, { title: `Categories ${tag}`, customerId: customer.id, agreedPrice: '1000', currency: 'CNY', items: [] });
  await page.goto(`/orders/${order.id}/expenses/new`);
  await page.getByLabel('Name', { exact: true }).fill('Hydraulic hoses');
  await page.getByLabel('Category', { exact: true }).selectOption({ label: added });
  await page.getByLabel('Amount', { exact: true }).fill('450');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByRole('link', { name: /Hydraulic hoses/ })).toContainText(added);

  // Rename: the expense shows the new name.
  await page.goto('/settings');
  await section.getByRole('button', { name: `Rename ${added}` }).click();
  await section.getByLabel('New name').fill(renamed);
  await section.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(section.getByText(renamed)).toBeVisible();
  await page.goto(`/orders/${order.id}?tab=expenses`);
  await expect(page.getByRole('link', { name: /Hydraulic hoses/ })).toContainText(renamed);

  // Hide: no longer offered, still on the existing expense.
  await page.goto('/settings');
  await section.getByRole('button', { name: `Hide ${renamed}` }).click();
  await expect(section.getByRole('button', { name: `Show ${renamed}` })).toBeVisible();
  await page.goto(`/orders/${order.id}/expenses/new`);
  await expect(page.getByLabel('Category', { exact: true }).locator('option', { hasText: renamed })).toHaveCount(0);
  await page.goto(`/orders/${order.id}?tab=expenses`);
  await expect(page.getByRole('link', { name: /Hydraulic hoses/ })).toContainText(renamed);

  // Default categories follow the user's language.
  await setLanguage(page, 'fr');
  try {
    await page.goto(`/orders/${order.id}/expenses/new`);
    await expect(page.getByLabel('Catégorie', { exact: true }).locator('option', { hasText: 'Transport intérieur en Chine' })).toHaveCount(1);
  } finally {
    await setLanguage(page, 'en');
  }
});
