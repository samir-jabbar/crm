import { expect, test, type Page } from '@playwright/test';
import { setFakeRatesMode } from './fake-rates.mjs';
import { apiCustomer, apiExpense, apiOrder, apiPayment, signIn } from './helpers';

/** A real JPEG made by the browser itself, so the proof preview can decode it. */
async function jpegFile(page: Page, name = 'slip.jpg') {
  const bytes = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 80;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#12715b';
        context.fillRect(0, 0, 120, 80);
        canvas.toBlob((blob) => void blob!.arrayBuffer().then((b) => resolve(Array.from(new Uint8Array(b)))), 'image/jpeg', 0.9);
      }),
  );
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(bytes) };
}

/** The worked example: 190,000 USD at an agreed rate of 7.10, default plan (30% Direct, 70% Bank). */
async function usdOrder(page: Page, title: string) {
  const customer = await apiCustomer(page, `Payments customer ${title}`);
  return apiOrder(page, { title, customerId: customer.id, agreedPrice: '190000', currency: 'USD', agreedRate: '7.1', items: [] });
}

// 004 quickstart P1, P3, P4 / US1, AC2, SC-001.
test('record a 30% Direct payment and a 70% Bank payment from a phone', async ({ page }) => {
  await signIn(page);
  const order = await usdOrder(page, `Two channels ${Date.now().toString(36)}`);

  await page.goto(`/orders/${order.id}?tab=payments`);
  const direct = page.getByRole('region', { name: 'Direct payments' });
  const bank = page.getByRole('region', { name: 'Bank payments (invoiced)' });
  await expect(direct).toContainText('57,000.00');
  await expect(bank).toContainText('133,000.00');

  // The 30% deposit, paid directly, with a photo of the receipt.
  const started = Date.now();
  await page.getByRole('link', { name: 'Add a payment to Direct payments' }).click();
  await expect(page.getByLabel('Channel')).toHaveValue('direct');
  await expect(page.getByLabel('Type')).toHaveValue('deposit');
  await page.getByLabel('Amount', { exact: true }).fill('57000');
  await expect(page.getByLabel('USD to CNY')).toHaveValue('7.1'); // filled automatically
  await expect(page.getByLabel('MAD to CNY')).toHaveValue('0.71');
  await page.getByLabel('Choose file').setInputFiles(await jpegFile(page));
  await expect(page.getByText('Proof attached')).toBeVisible();
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}\\?tab=payments$`));
  expect(Date.now() - started).toBeLessThan(30_000); // SC-001

  const summary = page.getByLabel('Received and remaining');
  await expect(direct.getByText('Remaining').locator('..')).toContainText('0.00');
  await expect(bank.getByText('Remaining').locator('..')).toContainText('133,000.00');
  await expect(summary).toContainText('30.0%');

  // The 70% balance, by bank transfer.
  await page.getByRole('link', { name: 'Add a payment to Bank payments (invoiced)' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('133000');
  await expect(page.getByLabel('USD to CNY')).toHaveValue('7.1');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(summary).toContainText('100.0%');
  await expect(bank.getByText('Remaining').locator('..')).toContainText('0.00');

  // The history lists both, and the proof opens from the payment.
  const history = page.getByRole('region', { name: 'Payment history' });
  await expect(history.getByRole('link')).toHaveCount(2);
  await history.getByRole('link').last().click();
  const proof = page.getByRole('img', { name: 'Proof' });
  await expect(proof).toBeVisible();
  await expect.poll(() => proof.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

// 004 quickstart P4 / US1 scenario 5.
test('missing fields are highlighted and the typed data and the proof are kept', async ({ page }) => {
  await signIn(page);
  const order = await usdOrder(page, `Validation ${Date.now().toString(36)}`);
  await page.goto(`/orders/${order.id}/payments/new?channel=bank`);
  await expect(page.getByLabel('USD to CNY')).toHaveValue('7.1');
  await page.getByLabel('USD to CNY').fill('');
  await page.getByLabel('Reference').fill('BOC-778812');
  await page.getByLabel('Choose file').setInputFiles(await jpegFile(page));
  await expect(page.getByText('Proof attached')).toBeVisible();
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText('Please check the highlighted fields.')).toBeVisible();
  await expect(page.getByText('Enter the rate to CNY.')).toBeVisible();
  await expect(page.getByLabel('Reference')).toHaveValue('BOC-778812');
  await expect(page.getByText('Proof attached')).toBeVisible();
});

// 004 quickstart P5, P7 / US2, AC3.
test('the bank rate shows the CNY actually received and the gap from the market; rates fall back to typing', async ({ page }) => {
  await signIn(page);
  const order = await usdOrder(page, `Bank rate ${Date.now().toString(36)}`);
  await page.goto(`/orders/${order.id}/payments/new?channel=bank`);
  await page.getByLabel('Amount', { exact: true }).fill('133000');
  await expect(page.getByLabel('USD to CNY')).toHaveValue('7.1');
  await expect(page.getByText(/^Automatic · .+ · Currency API$/)).toBeVisible();

  await page.getByRole('button', { name: "Add the bank's rate" }).click();
  await page.getByLabel("Bank's rate").fill('7.05');
  await page.getByLabel('Bank', { exact: true }).selectOption('Bank of China');
  await expect(page.getByLabel('Rate type')).toHaveValue('buying');
  const compare = page.getByText('USD/CNY rates').locator('..');
  await expect(compare).toContainText('7.100000');
  await expect(compare).toContainText('7.050000');
  await expect(compare.getByText('CNY actually received').locator('..')).toContainText('937,650.00');
  await expect(compare.getByText('Gap from the market').locator('..')).toContainText('6,650.00');
  await expect(compare).toContainText('-0.7% vs market');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}\\?tab=payments$`));

  // The saved payment keeps the bank's conversion.
  await page.getByRole('region', { name: 'Payment history' }).getByRole('link').first().click();
  await expect(page.getByText('Bank conversion')).toBeVisible();
  await expect(page.getByText('1 USD = 7.05 CNY')).toBeVisible();
  await expect(page.getByText('In CNY').locator('..')).toContainText('937,650.00');

  // The provider is down: a clear message, and the payment saves with typed rates (P7).
  await setFakeRatesMode('down');
  try {
    await page.goto(`/orders/${order.id}/payments/new?channel=direct`);
    await page.getByLabel('Amount', { exact: true }).fill('1000');
    await page.getByLabel('Date', { exact: true }).fill('2026-03-03'); // a day not cached yet
    await page.getByLabel('USD to CNY').fill('');
    await page.getByLabel('MAD to CNY').fill('');
    await page.getByRole('button', { name: 'Fetch rate' }).click();
    await expect(page.getByText('Automatic rates are unavailable right now.', { exact: false })).toBeVisible({ timeout: 6_000 });
    await page.getByLabel('USD to CNY').fill('7.12');
    await page.getByLabel('MAD to CNY').fill('0.72');
    await page.getByRole('button', { name: 'Save payment' }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${order.id}\\?tab=payments$`));
  } finally {
    await setFakeRatesMode('ok');
  }
});

// 004 quickstart P9, P10 / US3, SC-005.
test('the order shows the real profit, updated after each payment without a reload', async ({ page }) => {
  await signIn(page);
  const order = await usdOrder(page, `Real profit ${Date.now().toString(36)}`);
  await apiExpense(page, order.id, { name: 'Machines', amount: '1000000', categoryId: 'cat-equipment_purchase' });
  await apiExpense(page, order.id, { name: 'Freight', amount: '203500', categoryId: 'cat-sea_freight' });

  await page.goto(`/orders/${order.id}`);
  const costs = page.getByLabel('Costs and profit (CNY)');
  await expect(costs.getByText('Profit', { exact: true }).locator('..')).toContainText('145,500.00');
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

  await page.getByRole('tab', { name: 'Payments' }).click();
  await page.getByRole('link', { name: 'Add a payment to Direct payments' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('57000');
  await expect(page.getByLabel('USD to CNY')).toHaveValue('7.1');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await page.getByRole('link', { name: 'Add a payment to Bank payments (invoiced)' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('133000');
  await expect(page.getByLabel('USD to CNY')).toHaveValue('7.1');
  await page.getByRole('button', { name: "Add the bank's rate" }).click();
  await page.getByLabel("Bank's rate").fill('7.05');
  await page.getByLabel('Bank', { exact: true }).selectOption('ICBC');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByLabel('Received and remaining')).toContainText('100.0%');

  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(costs.getByText('Profit', { exact: true }).locator('..')).toContainText('138,850.00');
  await expect(costs.getByText('Remaining to collect').locator('..')).toContainText('0.00');
  await expect(costs.getByText('Exchange loss').locator('..')).toContainText('6,650.00');
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
});

// 004 quickstart P15, P16 / US5, FR-021, FR-022.
test('overpayment warns without blocking, and closing an order still owed money asks first', async ({ page }) => {
  await signIn(page);
  const paid = await usdOrder(page, `Paid ${Date.now().toString(36)}`);
  await apiPayment(page, paid.id, { amount: '190000' });
  await page.goto(`/orders/${paid.id}/payments/new?channel=bank`);
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await expect(page.getByLabel('USD to CNY')).toHaveValue('7.1');
  await expect(page.getByText('Payments exceed the agreed price by', { exact: false })).toContainText('1,000.00');
  await expect(page.getByText('Bank payments exceed the invoice total by', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${paid.id}\\?tab=payments$`));
  await expect(page.getByText('Payments exceed the agreed price by', { exact: false })).toBeVisible();

  const owed = await usdOrder(page, `Owed ${Date.now().toString(36)}`);
  await apiPayment(page, owed.id, { channel: 'direct', type: 'deposit', amount: '57000' });
  await page.goto(`/orders/${owed.id}`);
  const status = page.getByLabel('Status');
  await status.selectOption('closed');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('133,000.00');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(status).toHaveValue('draft');

  await status.selectOption('closed');
  await page.getByRole('dialog').getByRole('button', { name: 'Close anyway' }).click();
  await expect(status).toHaveValue('closed');
  await expect(page.getByRole('dialog')).toBeHidden();
});

// 004 quickstart P18 / US6.
test('edit a payment, delete one entered twice, and restore it; totals follow', async ({ page }) => {
  await signIn(page);
  const order = await usdOrder(page, `Corrections ${Date.now().toString(36)}`);
  const deposit = await apiPayment(page, order.id, { channel: 'direct', type: 'deposit', amount: '50000' });
  const twice = await apiPayment(page, order.id, { channel: 'direct', type: 'deposit', amount: '7000' });

  // Correct the deposit to the real 57,000.
  await page.goto(`/payments/${deposit.id}`);
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('50000');
  await page.getByLabel('Amount', { exact: true }).fill('57000');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page).toHaveURL(new RegExp(`/payments/${deposit.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('57,000.00');
  await expect(page.getByText('Last changed by', { exact: false })).toBeVisible();

  // Delete the duplicate, then restore it.
  await page.goto(`/payments/${twice.id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}\\?tab=payments$`));
  const summary = page.getByLabel('Received and remaining');
  await expect(summary).toContainText('30.0%');

  await page.getByLabel('Show deleted payments').check();
  await page.getByRole('list', { name: 'Deleted payments' }).getByRole('button', { name: 'Restore' }).click();
  await expect(summary).toContainText('33.7%'); // 64,000 of 190,000
});
