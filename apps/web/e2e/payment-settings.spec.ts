import { expect, test, type Page } from '@playwright/test';
import { apiCustomer, apiOrder, ORIGIN, signIn } from './helpers';

/** The e2e server is shared by every test: put the payment settings back as seeded. */
async function resetPaymentSettings(page: Page) {
  const res = await page.request.patch('/api/settings/payments', {
    data: {
      channelNames: { direct: null, bank: null },
      defaultPlan: [
        { type: 'deposit', channel: 'direct', percent: '30', dueBeforeStatus: 'in_production' },
        { type: 'balance', channel: 'bank', percent: '70', dueBeforeStatus: 'on_vessel' },
      ],
      banks: ['Bank of China', 'ICBC', 'ABC', 'CCB'],
    },
    headers: ORIGIN,
  });
  expect(res.status()).toBe(200);
}

// 004 quickstart P12–P14 / US4, FR-013, FR-014, FR-027.
test('the Owner renames a channel, changes the default plan and the banks, then adapts one order', async ({ page }) => {
  await signIn(page, '/settings');
  const tag = Date.now().toString(36);
  try {
    const section = page.getByRole('region', { name: 'Payments' });
    await section.getByLabel('Direct payments').fill(`Cash and agents ${tag}`);
    const stage1 = section.getByLabel('Stage 1');
    const stage2 = section.getByLabel('Stage 2');
    await stage1.getByLabel('Share of the price').fill('40');
    await stage2.getByLabel('Share of the price').fill('60');
    await expect(section.getByText('Total:')).toContainText('100%');
    await section.getByRole('button', { name: 'Add a bank' }).click();
    await section.getByLabel('Bank 5').fill('Bank of Communications');
    await section.getByRole('button', { name: 'Save payment settings' }).click();
    await expect(section.getByText('Saved', { exact: false })).toBeVisible();

    // A new order gets the 40/60 plan and the new channel name.
    const customer = await apiCustomer(page, `Plan customer ${tag}`);
    const order = await apiOrder(page, { title: `Plan ${tag}`, customerId: customer.id, agreedPrice: '100000', currency: 'USD', agreedRate: '7.1', items: [] });
    await page.goto(`/orders/${order.id}?tab=payments`);
    const direct = page.getByRole('region', { name: `Cash and agents ${tag}` });
    await expect(direct.getByText('Planned').locator('..')).toContainText('40,000.00');

    // Split this order's deposit across both channels.
    await page.getByRole('link', { name: 'Edit plan' }).click();
    await page.getByLabel('Stage 1').getByLabel('Share of the price').fill('20');
    await expect(page.getByText('Total:')).toContainText('80%');
    await page.getByRole('button', { name: 'Save the plan' }).click();
    await expect(page.getByText('The stages must total exactly 100%.')).toBeVisible();
    await page.getByRole('button', { name: 'Add a stage' }).click();
    const stage3 = page.getByLabel('Stage 3');
    await stage3.getByLabel('Type').selectOption('deposit');
    await stage3.getByLabel('Channel').selectOption('bank');
    await stage3.getByLabel('Share of the price').fill('20');
    await expect(stage3).toContainText('20,000.00');
    await page.getByRole('button', { name: 'Save the plan' }).click();
    await expect(page).toHaveURL(/tab=payments$/);
    await expect(direct.getByText('Planned').locator('..')).toContainText('20,000.00');
    await expect(page.getByRole('region', { name: 'Bank payments (invoiced)' }).getByText('Planned').locator('..')).toContainText('80,000.00');

    // The new bank is offered in the payment form.
    await page.goto(`/orders/${order.id}/payments/new?channel=bank`);
    await page.getByRole('button', { name: "Add the bank's rate" }).click();
    await expect(page.getByLabel('Bank', { exact: true }).locator('option', { hasText: 'Bank of Communications' })).toHaveCount(1);
  } finally {
    await resetPaymentSettings(page);
  }
});
