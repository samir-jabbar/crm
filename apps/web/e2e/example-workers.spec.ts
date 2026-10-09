import { expect, test } from '@playwright/test';
import { apiCustomer, apiExpense, apiOrder, apiPayment, apiWorker, ORIGIN, signIn, signInAs } from './helpers';

// 005 quickstart W20 / US5: the brief's example workers, set up from the default templates.
test('a site/trip assistant adds an expense to their order and sees only their own entries', async ({ page, browser }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const customer = await apiCustomer(page, `Site customer ${tag}`);
  const order = await apiOrder(page, { title: `Site order ${tag}`, customerId: customer.id, agreedPrice: '100000', currency: 'CNY', items: [] });
  await apiExpense(page, order.id, { name: 'Machine purchase', categoryId: 'cat-equipment_purchase', amount: '88888.88' });
  const worker = await apiWorker(page, 'site', 'tpl-site_assistant');
  expect((await page.request.put(`/api/users/${worker.id}/orders`, { data: { orderIds: [order.id] }, headers: ORIGIN })).status()).toBe(200);

  const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const phone = await context.newPage();
  await signInAs(phone, worker.username, `/orders/${order.id}`);
  await expect(phone.getByRole('tab')).toHaveText(['Expenses']);
  await phone.getByRole('link', { name: 'Add expense' }).click();
  await phone.getByLabel('Name').fill('Hôtel Linyi');
  await phone.getByLabel('Category').selectOption({ label: 'Hotel and accommodation' });
  await expect(phone.getByLabel('Category').locator('option', { hasText: 'Equipment purchase' })).toHaveCount(0);
  await phone.getByLabel('Amount', { exact: true }).fill('450');
  await phone.getByRole('button', { name: 'Save expense' }).click();
  await expect(phone).toHaveURL(new RegExp(`/orders/${order.id}\\?tab=expenses`));
  await expect(phone.getByText('Your entries')).toBeVisible();
  await expect(phone.getByText('Hôtel Linyi')).toBeVisible();
  await expect(phone.locator('main')).not.toContainText('Machine purchase');
  await expect(phone.locator('main')).not.toContainText('88');
  await context.close();
});

test('an accountant sees a read-only Payments tab with the Bank channel only', async ({ page, browser }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const customer = await apiCustomer(page, `Accountant customer ${tag}`);
  const order = await apiOrder(page, { title: `Accountant order ${tag}`, customerId: customer.id, agreedPrice: '190000', currency: 'USD', agreedRate: '7.1', items: [] });
  await apiPayment(page, order.id, { channel: 'direct', type: 'deposit', amount: '57000' });
  await apiPayment(page, order.id, { channel: 'bank', amount: '133000' });
  const worker = await apiWorker(page, 'accountant', 'tpl-accountant');

  const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const phone = await context.newPage();
  await signInAs(phone, worker.username, `/orders/${order.id}?tab=payments`);
  await expect(phone.getByRole('region', { name: 'Bank payments (invoiced)' })).toContainText('133,000.00');
  await expect(phone.getByRole('region', { name: 'Direct payments' })).toHaveCount(0);
  await expect(phone.locator('main')).not.toContainText('57,000');
  await expect(phone.getByRole('link', { name: /Add a payment/ })).toHaveCount(0);
  await expect(phone.getByRole('link', { name: 'Edit plan' })).toHaveCount(0);
  await expect(phone.getByLabel('Status')).toHaveCount(0);
  await context.close();
});
