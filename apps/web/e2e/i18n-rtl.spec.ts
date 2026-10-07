import { expect, test } from '@playwright/test';
import { apiCustomer, apiOrder, expectNoHorizontalScroll, OWNER, setLanguage, signIn } from './helpers';

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
        items: [{ productName: 'Excavator', brandModel: 'Doosan DX225LC', quantity: 2, unitPrice: '617283.94' }],
      });
      const dataScreens = [`/orders/${order.id}`, `/orders/${order.id}?tab=notes`, `/orders/${order.id}?tab=payments`,
        `/orders/${order.id}/edit`, `/customers/${customer.id}`];
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
