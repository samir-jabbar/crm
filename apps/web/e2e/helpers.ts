import { expect, type Page } from '@playwright/test';

export const E2E_SETUP_CODE = 'E2E-SETUP-CODE';
export const OWNER = {
  username: 'hicham',
  displayName: 'Hicham Jabbar',
  password: 'Correct-Horse-Battery-9',
};

/** Sign in through the API (shares cookies with the page) and open a path. */
export async function signIn(page: Page, path = '/') {
  const res = await page.request.post('/api/auth/sign-in', {
    data: { username: OWNER.username, password: OWNER.password },
    headers: { origin: new URL(page.url() === 'about:blank' ? 'http://localhost:3100' : page.url()).origin },
  });
  expect(res.status(), await res.text()).toBe(200);
  await page.goto(path);
}

/** Set the account language through the API so every test starts from a known language. */
export async function setLanguage(page: Page, language: 'en' | 'fr' | 'ar') {
  const res = await page.request.patch('/api/me', {
    data: { language },
    headers: { origin: 'http://localhost:3100' },
  });
  expect(res.status()).toBe(200);
}

/** No sideways scrolling (SC-008). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

// ── 002: fast API setup for tests that are not about the forms ──

export const ORIGIN = { origin: 'http://localhost:3100' };

/** Create a customer through the API (fast setup for tests that are not about the form). */
export async function apiCustomer(page: Page, name: string) {
  const res = await page.request.post('/api/customers', { data: { name, city: 'Casablanca', confirmDuplicate: true }, headers: ORIGIN });
  expect(res.status()).toBe(201);
  return res.json();
}

export async function apiOrder(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/orders', { data, headers: ORIGIN });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

