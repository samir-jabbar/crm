import { expect, test, type Page } from '@playwright/test';
import { apiCustomer, apiExpense, apiOrder, signIn } from './helpers';

/** A real JPEG made by the browser itself, so the receipt preview can decode it. */
async function jpegFile(page: Page, name = 'receipt.jpg') {
  const bytes = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 80;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#0f3d5e';
        context.fillRect(0, 0, 120, 80);
        canvas.toBlob((blob) => void blob!.arrayBuffer().then((b) => resolve(Array.from(new Uint8Array(b)))), 'image/jpeg', 0.9);
      }),
  );
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(bytes) };
}

/** A CNY order, so these flows do not depend on the agreed rate (US2). */
async function cnyOrder(page: Page, title: string) {
  const customer = await apiCustomer(page, `Expense customer ${title}`);
  return apiOrder(page, { title, customerId: customer.id, agreedPrice: '50000', currency: 'CNY', items: [] });
}

// 003 quickstart X1–X4 / US1, SC-001.
test('record expenses with a receipt from a phone', async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const order = await cnyOrder(page, `Expenses ${tag}`);

  await page.goto(`/orders/${order.id}?tab=expenses`);
  await expect(page.getByText('No expenses yet.', { exact: false })).toBeVisible();
  const started = Date.now();
  await page.getByRole('link', { name: 'Add expense' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Trucking Linyi to Qingdao port');
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Inland transport in China' });
  await page.getByLabel('Amount', { exact: true }).fill('3500');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}\\?tab=expenses$`));
  await expect(page.getByRole('link', { name: /Trucking Linyi to Qingdao port/ })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(30_000); // SC-001

  // A USD expense: the CNY amount shows live, before saving (X2).
  await page.getByRole('link', { name: 'Add expense' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Crane at the yard');
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Inland transport in China' });
  await page.getByLabel('Amount', { exact: true }).fill('1200');
  await page.getByLabel('Currency').selectOption('USD');
  await page.getByLabel('Rate to CNY').fill('7.1');
  await expect(page.getByText('Amount in CNY').locator('..')).toContainText('8,520.00');
  // The receipt photo uploads at once (X3).
  await page.getByLabel('Choose file').setInputFiles(await jpegFile(page));
  await expect(page.getByText('Receipt attached')).toBeVisible();
  await page.getByRole('button', { name: 'Save expense' }).click();

  // Totals add the lines exactly (X1).
  const totals = page.getByText('Total expenses').locator('..');
  await expect(totals).toContainText('12,020.00');
  await expect(page.getByRole('listitem').filter({ hasText: 'Inland transport in China' }).first()).toBeVisible();

  // The receipt opens from the expense.
  await page.getByRole('link', { name: /Crane at the yard/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Crane at the yard');
  await expect(page.getByText('1 USD = 7.100000 CNY')).toBeVisible();
  const receipt = page.getByRole('img', { name: 'Receipt' });
  await expect(receipt).toBeVisible();
  await expect.poll(() => receipt.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

// 003 quickstart X4 / US1 scenario 5.
test('missing fields are highlighted and the typed data and photo are kept', async ({ page }) => {
  await signIn(page);
  const order = await cnyOrder(page, `Validation ${Date.now().toString(36)}`);
  await page.goto(`/orders/${order.id}/expenses/new`);
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByText('Enter a name.')).toBeVisible();
  await expect(page.getByText('Choose a category.')).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('Kept name');
  await page.getByLabel('Amount', { exact: true }).fill('10');
  await page.getByLabel('Currency').selectOption('EUR');
  // Auto-fill brings today's rate (003 FR-017); clear it to check that a rate is required.
  await expect(page.getByLabel('Rate to CNY')).toHaveValue('7.8');
  await page.getByLabel('Rate to CNY').fill('');
  await page.getByLabel('Choose file').setInputFiles(await jpegFile(page));
  await expect(page.getByText('Receipt attached')).toBeVisible();
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByText('Choose a category.')).toBeVisible();
  await expect(page.getByText('Enter the rate to CNY.')).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Kept name');
  await expect(page.getByText('Receipt attached')).toBeVisible();
});

// 003 quickstart X5 / US2, SC-006.
test('profit in CNY uses the agreed rate and follows every expense without a reload', async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const customer = await apiCustomer(page, `Profit customer ${tag}`);

  await page.goto(`/orders/new?customerId=${customer.id}`);
  await page.getByLabel('Title').fill(`Profit ${tag}`);
  await page.getByLabel('Agreed price').fill('190000');
  const item = page.locator('[aria-label="Item 1"]');
  await item.getByLabel('Product name').fill('Excavator');
  await item.getByLabel('Quantity').fill('1');
  await item.getByLabel('Unit price (USD)').fill('190000');
  // A USD order needs its agreed rate (FR-011).
  await page.getByRole('button', { name: 'Create order' }).click();
  await expect(page.getByText('Enter the rate to CNY.')).toBeVisible();
  await page.getByLabel('Agreed rate').fill('7.1');
  await expect(page.getByText('Agreed price in CNY:')).toContainText('1,349,000.00');
  await page.getByRole('button', { name: 'Create order' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);

  const summary = page.getByText('Costs and profit (CNY)').locator('..');
  await expect(summary).toContainText('1 USD = 7.100000 CNY');
  await expect(summary.getByText('Profit', { exact: true }).locator('..')).toContainText('1,349,000.00');

  // Add an expense; the summary updates in place (no page reload).
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  await page.getByRole('tab', { name: 'Expenses' }).click();
  await page.getByRole('link', { name: 'Add expense' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Trucking');
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Inland transport in China' });
  await page.getByLabel('Amount', { exact: true }).fill('3500');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(summary.getByText('Profit', { exact: true }).locator('..')).toContainText('1,345,500.00');
  await expect(summary.getByText('Margin', { exact: true }).locator('..')).toContainText('99.7');
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
});

// 003 quickstart X13 / US4.
test('edit an expense, mark it paid, delete and restore it; totals follow', async ({ page }) => {
  await signIn(page);
  const order = await cnyOrder(page, `Corrections ${Date.now().toString(36)}`);
  await apiExpense(page, order.id, { name: 'Fuel', amount: '500', status: 'to_pay', dueDate: '2026-11-15' });
  await apiExpense(page, order.id, { name: 'Hotel', amount: '1000', categoryId: 'cat-hotel_accommodation' });

  await page.goto(`/orders/${order.id}?tab=expenses`);
  const total = page.getByText('Total expenses').locator('..');
  const unpaid = page.getByText('Unpaid', { exact: true }).locator('..');
  await expect(total).toContainText('1,500.00');
  await expect(unpaid).toContainText('500.00');

  // Correct the amount.
  await page.getByRole('link', { name: /Fuel/ }).click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('600');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fuel');
  await expect(page.getByText('Last changed by', { exact: false })).toBeVisible();

  // Mark it paid.
  await page.getByRole('button', { name: 'Mark paid' }).click();
  await expect(page.getByRole('button', { name: 'Mark to pay' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the order' }).click();
  await expect(total).toContainText('1,600.00');
  await expect(unpaid).toContainText('0.00');

  // Delete one entered by mistake, then restore it.
  await page.getByRole('link', { name: /Hotel/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}\\?tab=expenses$`));
  await expect(page.getByRole('link', { name: /Hotel/ })).toBeHidden();
  await expect(total).toContainText('600.00');

  await page.getByLabel('Show deleted expenses').check();
  await page.getByRole('list', { name: 'Deleted expenses' }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('link', { name: /Hotel/ })).toBeVisible();
  await expect(total).toContainText('1,600.00');
});

// 003 quickstart X14 / US5.
test('see what to reimburse to whom, mark it, and reuse names already entered', async ({ page }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const ahmed = `Ahmed ${tag}`;
  const li = `Driver Li ${tag}`;
  const orderA = await cnyOrder(page, `Trip A ${tag}`);
  const orderB = await cnyOrder(page, `Trip B ${tag}`);
  await apiExpense(page, orderA.id, { name: 'Hotel Linyi', amount: '2000', advancedBy: ahmed });
  await apiExpense(page, orderB.id, { name: 'Taxi', amount: '1500', advancedBy: ahmed });
  await apiExpense(page, orderB.id, { name: 'Diesel', amount: '800', advancedBy: li });

  await page.goto('/');
  const block = page.getByText('To reimburse', { exact: true }).locator('..');
  await expect(block.getByRole('link', { name: new RegExp(ahmed) })).toContainText('3,500.00');
  await expect(block.getByRole('link', { name: new RegExp(li) })).toContainText('800.00');

  await block.getByRole('link', { name: new RegExp(ahmed) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(ahmed);
  const items = page.getByRole('list', { name: 'Expenses to reimburse' }).getByRole('listitem');
  await expect(items).toHaveCount(2);
  await items.filter({ hasText: 'Taxi' }).getByRole('button', { name: 'Mark reimbursed' }).click();
  await expect(items).toHaveCount(1);
  await expect(page.getByText('Still owed').locator('..')).toContainText('2,000.00');

  // The order's tab shows the per-person totals.
  await page.goto(`/orders/${orderB.id}?tab=expenses`);
  await expect(page.getByRole('region', { name: 'Advanced by' })).toContainText(li);

  // Names already used are suggested, so the same person is not typed twice.
  await page.getByRole('link', { name: 'Add expense' }).click();
  await page.getByRole('combobox', { name: 'Advanced by' }).fill(ahmed.slice(0, -2));
  await page.getByRole('option', { name: ahmed }).click();
  await expect(page.getByRole('combobox', { name: 'Advanced by' })).toHaveValue(ahmed);
  await expect(page.getByLabel('Already reimbursed')).not.toBeChecked();
});
