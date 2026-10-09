import { expect, test } from '@playwright/test';
import { apiCustomer, apiOrder, apiWorker, ORIGIN, signIn, signInAs } from './helpers';

// 005 quickstart W19 / US5, brief §9 AC6 (Phase 1 part): a worker allowed only Shipments and Documents, with
// prices hidden and two assigned orders, sees those two orders and nothing else.
test('AC6: two orders, two tabs, no prices', async ({ page, browser }) => {
  await signIn(page);
  const tag = Date.now().toString(36);
  const customer = await apiCustomer(page, `AC6 customer ${tag}`);
  const order = (title: string) => apiOrder(page, { title, customerId: customer.id, agreedPrice: '777123.45', currency: 'CNY', items: [] });
  const a = await order(`AC6 first ${tag}`);
  const b = await order(`AC6 second ${tag}`);
  const c = await order(`AC6 hidden ${tag}`);
  const worker = await apiWorker(page, 'ac6', 'tpl-read_only', {
    permissions: { modules: { shipments: ['view', 'edit'], documents: ['view', 'create'] }, hidden: ['sellingPrice'] },
    orderScope: 'assigned',
    ownEntriesOnly: false,
    accessEndsOn: null,
  });
  const assign = await page.request.put(`/api/users/${worker.id}/orders`, { data: { orderIds: [a.id, b.id] }, headers: ORIGIN });
  expect(assign.status()).toBe(200);

  const context = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const phone = await context.newPage();
  await signInAs(phone, worker.username, '/orders');

  // Only the two assigned orders, in the list and in search; no amount anywhere.
  await expect(phone.getByRole('link', { name: new RegExp(`AC6 (first|second) ${tag}`) })).toHaveCount(2);
  await expect(phone.getByText(`AC6 hidden ${tag}`)).toHaveCount(0);
  await phone.getByRole('searchbox').fill(`AC6 hidden ${tag}`);
  await expect(phone.getByText('No orders match')).toBeVisible();
  await expect(phone.locator('main')).not.toContainText('777');

  // The order page: only the Shipment and Documents tabs, both "coming in a later update".
  await phone.goto(`/orders/${a.id}`);
  await expect(phone.getByRole('heading', { level: 1, name: `AC6 first ${tag}` })).toBeVisible();
  await expect(phone.getByRole('tab')).toHaveText(['Shipment', 'Documents']);
  await expect(phone.getByText('This section will be available in a coming update.')).toBeVisible();
  await expect(phone.getByLabel('Status')).toHaveCount(0);
  await expect(phone.locator('main')).not.toContainText('777');

  // The third order, the customers and the settings are out of reach.
  await phone.goto(`/orders/${c.id}`);
  await expect(phone.getByText(/not found|introuvable/i)).toBeVisible();
  await phone.goto('/customers');
  await expect(phone.getByRole('heading', { level: 1, name: 'No access' })).toBeVisible();
  await phone.getByRole('button', { name: 'Menu' }).click();
  await expect(phone.locator('#app-menu').getByRole('link')).toHaveText(['Home', 'Orders', 'Security']);
  await context.close();
});
