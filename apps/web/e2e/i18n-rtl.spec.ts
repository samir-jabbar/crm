import { expect, test } from '@playwright/test';
import { apiCustomer, apiExpense, apiOrder, apiPayment, apiWorker, expectNoHorizontalScroll, ORIGIN, OWNER, setLanguage, signIn } from './helpers';

/** A 1×1 JPEG, enough for a stored receipt. */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

const SIGNED_IN_SCREENS = ['/', '/security', '/settings', '/audit', '/orders', '/orders/new', '/customers', '/suppliers'];

// Quickstart Q7–Q9 / US2.
test.describe('languages and right-to-left layout', () => {
  for (const lng of ['en', 'fr', 'ar'] as const) {
    test(`every screen in ${lng}: direction, translation, no sideways scroll`, async ({ page }) => {
      await signIn(page);
      // 002 screens that need data (V19): an order with a long mixed-script title and its customer.
      const customer = await apiCustomer(page, `شركة الدار البيضاء للمعدات الثقيلة ${lng}`);
      const order = await apiOrder(page, {
        title: `Deux pelles Doosan DX225LC — 汉景机械 — ${lng}`,
        customerId: customer.id,
        agreedPrice: '1234567.89',
        currency: 'MAD',
        agreedRate: '0.71',
        items: [{ productName: 'Excavator', brandModel: 'Doosan DX225LC', quantity: 2, unitPrice: '617283.94' }],
      });
      // 003 screens (X19): a USD expense with a receipt, advanced by someone with an Arabic name.
      const upload = await page.request.post('/api/receipts', {
        multipart: { file: { name: 'receipt.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG } },
        headers: ORIGIN,
      });
      expect(upload.status()).toBe(201);
      const person = `أحمد بن علي ${lng}`;
      const expense = await apiExpense(page, order.id, {
        name: `Transport Linyi → Qingdao — 汉景 — ${lng}`,
        categoryId: 'cat-inland_transport_china',
        amount: '1234567.89',
        currency: 'USD',
        rate: '7.123456',
        advancedBy: person,
        receiptId: (await upload.json()).id,
      });
      // 004 screens (P20): a USD payment converted by the bank, with an Arabic reference and a proof.
      const proof = await page.request.post('/api/payment-proofs', {
        multipart: { file: { name: 'slip.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG } },
        headers: ORIGIN,
      });
      expect(proof.status()).toBe(201);
      const payment = await apiPayment(page, order.id, {
        amount: '123456.78',
        reference: `تحويل بنكي BOC-77 ${lng}`,
        bank: { rate: '7.05', name: 'Bank of China', rateType: 'buying', at: '2026-10-07T02:30:00.000Z' },
        proofId: (await proof.json()).id,
      });
      // 005 screens (W23): the Users area, a worker's page with the permission editor, and the templates.
      const worker = await apiWorker(page, `rtl${lng}`, 'tpl-logistics');
      const dataScreens = [`/orders/${order.id}`, `/orders/${order.id}?tab=notes`, `/orders/${order.id}?tab=payments`,
        `/orders/${order.id}/edit`, `/customers/${customer.id}`, `/orders/${order.id}?tab=expenses`,
        `/orders/${order.id}/expenses/new`, `/expenses/${expense.id}`, `/expenses/${expense.id}/edit`,
        `/reimbursements?person=${encodeURIComponent(person)}`, `/orders/${order.id}/payments/new?channel=bank`,
        `/payments/${payment.id}`, `/payments/${payment.id}/edit`, `/orders/${order.id}/payment-plan`,
        '/users', `/users/${worker.id}`, '/users/templates', '/users/templates/new', '/users/templates/tpl-logistics'];
      await setLanguage(page, lng);
      try {
        for (const path of [...SIGNED_IN_SCREENS, ...dataScreens]) {
          await page.goto(path);
          await expect(page.locator('html')).toHaveAttribute('lang', lng);
          await expect(page.locator('html')).toHaveAttribute('dir', lng === 'ar' ? 'rtl' : 'ltr');
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await expectNoHorizontalScroll(page);
          // Amounts always use Western digits (FR-025 / 001 FR-029).
          await expect(page.locator('body')).not.toContainText(/[٠-٩۰-۹]/);
        }
      } finally {
        await setLanguage(page, 'en');
      }
    });
  }

  test('the sign-in screen mirrors in Arabic', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    // 005: the Register screen mirrors too.
    await page.getByRole('link', { name: 'التسجيل' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'التسجيل' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('the account language follows the user to a new device', async ({ page, browser }) => {
    await signIn(page);
    await setLanguage(page, 'fr');
    try {
      const other = await browser.newContext();
      const otherPage = await other.newPage();
      await otherPage.goto('/sign-in');
      await otherPage.getByLabel(/username/i).fill(OWNER.username);
      await otherPage.locator('input[autocomplete="current-password"]').fill(OWNER.password);
      await otherPage.getByRole('button', { name: /^sign in$/i }).click();
      await expect(otherPage.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(otherPage.getByRole('heading', { name: /Bienvenue/ })).toBeVisible();
      await other.close();
    } finally {
      await setLanguage(page, 'en');
    }
  });

  test('mixed-script names render exactly as entered', async ({ page }) => {
    await signIn(page);
    const name = '汉景 هانجينغ Élodie';
    const patch = (displayName: string) =>
      page.request.patch('/api/me', { data: { displayName }, headers: { origin: 'http://localhost:3100' } });
    expect((await patch(name)).status()).toBe(200);
    try {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
    } finally {
      await patch(OWNER.displayName);
    }
  });
});
