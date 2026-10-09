import { expect, test, type Page } from '@playwright/test';
import { setFakeRatesMode } from './fake-rates.mjs';
import { apiCustomer, apiOrder, ORIGIN, signIn } from './helpers';

async function cnyOrder(page: Page, title: string) {
  const customer = await apiCustomer(page, `Rates customer ${title}`);
  return apiOrder(page, { title, customerId: customer.id, agreedPrice: '1000', currency: 'CNY', items: [] });
}

/** The e2e server is shared by every test: put the rate settings back as they were. */
async function resetRateSettings(page: Page) {
  const res = await page.request.patch('/api/settings/exchange-rates', {
    data: { provider: 'currency_api', autoFill: true },
    headers: ORIGIN,
  });
  expect(res.status()).toBe(200);
}

// 003 quickstart X10, X11 / US3, FR-005, FR-015 – FR-018, SC-004.
test('rates are filled automatically, stay editable, warn on typos and never block saving', async ({ page }) => {
  await signIn(page);
  const order = await cnyOrder(page, `Auto rates ${Date.now().toString(36)}`);

  await page.goto(`/orders/${order.id}/expenses/new`);
  await page.getByLabel('Name', { exact: true }).fill('Crane hire');
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Port and loading' });
  await page.getByLabel('Amount', { exact: true }).fill('100');
  await page.getByLabel('Currency').selectOption('USD');
  const rate = page.getByLabel('Rate to CNY');
  await expect(rate).toHaveValue('7.1');
  await expect(page.getByText(/^Automatic · .+ · Currency API$/)).toBeVisible();

  await rate.fill('7.15');
  await expect(page.getByText('Automatic, then edited')).toBeVisible();
  await rate.fill('71');
  await expect(page.getByText('This is far from the latest rate')).toBeVisible(); // X11
  await rate.fill('7.15');
  await expect(page.getByText('This is far from the latest rate')).toBeHidden();
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}\\?tab=expenses$`));

  // The provider is down: a clear message within 5 s, and the expense saves with a typed rate (X10).
  await setFakeRatesMode('down');
  try {
    await page.getByRole('link', { name: 'Add expense' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Customs broker');
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Customs and duties (Morocco)' });
    await page.getByLabel('Amount', { exact: true }).fill('2000');
    await page.getByLabel('Date', { exact: true }).fill('2026-03-03'); // a day not cached yet
    await page.getByLabel('Currency').selectOption('MAD');
    await expect(page.getByText('Automatic rates are unavailable right now.', { exact: false })).toBeVisible({ timeout: 6_000 });
    await page.getByLabel('Rate to CNY').fill('0.72');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByRole('link', { name: /Customs broker/ })).toBeVisible();
  } finally {
    await setFakeRatesMode('ok');
  }
});

// 003 quickstart X16 / US3, FR-014, FR-017.
test('the Owner chooses the provider, refreshes rates and turns auto-fill off', async ({ page }) => {
  await signIn(page, '/settings');
  try {
    const section = page.getByRole('region', { name: 'Exchange rates' });
    await section.getByLabel('Rate provider').selectOption({ label: 'ExchangeRate-API (open access)' });
    await section.getByRole('button', { name: 'Save rate settings' }).click();
    await expect(section.getByRole('link', { name: 'Rates By Exchange Rate API' })).toBeVisible();

    await section.getByRole('button', { name: 'Refresh rates' }).click();
    await expect(section.getByText('1 USD = 7.100000 CNY')).toBeVisible();
    await expect(section.getByText('Last fetched:')).not.toContainText('never');

    await section.getByLabel('Fill rates automatically').uncheck();
    await section.getByRole('button', { name: 'Save rate settings' }).click();
    await expect(section.getByText('Saved', { exact: false })).toBeVisible();

    const order = await cnyOrder(page, `No auto-fill ${Date.now().toString(36)}`);
    await page.goto(`/orders/${order.id}/expenses/new`);
    await page.getByLabel('Currency').selectOption('USD');
    await expect(page.getByRole('button', { name: 'Fetch rate' })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByLabel('Rate to CNY')).toHaveValue('');
    // "Fetch rate" still works on demand, with the provider's attribution.
    await page.getByRole('button', { name: 'Fetch rate' }).click();
    await expect(page.getByLabel('Rate to CNY')).toHaveValue('7.1');
    await expect(page.getByRole('link', { name: 'Rates By Exchange Rate API' })).toBeVisible();
  } finally {
    await resetRateSettings(page);
  }
});
