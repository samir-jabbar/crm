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


/** Create an expense through the API (003): fast setup for tests that are not about the form. */
export async function apiExpense(page: Page, orderId: string, data: Record<string, unknown>) {
  const res = await page.request.post(`/api/orders/${orderId}/expenses`, {
    data: { categoryId: 'cat-other', currency: 'CNY', expenseDate: '2026-10-07', ...data },
    headers: ORIGIN,
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

/** Create a payment through the API (004): a Bank balance of 1000 USD at USD 7.1 / MAD 0.71 unless overridden. */
export async function apiPayment(page: Page, orderId: string, data: Record<string, unknown>) {
  const res = await page.request.post(`/api/orders/${orderId}/payments`, {
    data: {
      channel: 'bank',
      type: 'balance',
      amount: '1000',
      currency: 'USD',
      paymentDate: '2026-10-07',
      rates: { USD: '7.1', MAD: '0.71', EUR: null },
      rateSource: 'manual',
      ...data,
    },
    headers: ORIGIN,
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

export const WORKER_PASSWORD = 'Pelle-Doosan-2026';

/**
 * 005: a worker registered through the API and approved by the signed-in Owner (`page`), with a template and an
 * optional access override. Returns the worker's id and username; sign them in with `signInAs` in another context.
 */
export async function apiWorker(page: Page, name: string, templateId: string, access?: Record<string, unknown>) {
  const username = `${name}${Date.now().toString(36)}`.slice(0, 32);
  const reg = await page.request.post('/api/auth/register', {
    data: { username, displayName: name, password: WORKER_PASSWORD, language: 'en' },
    headers: ORIGIN,
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const users = await (await page.request.get('/api/users')).json();
  const user = users.items.find((u: { username: string }) => u.username === username);
  const approved = await page.request.post(`/api/users/${user.id}/approve`, { data: { templateId, ...(access ? { access } : {}) }, headers: ORIGIN });
  expect(approved.status(), await approved.text()).toBe(200);
  return { id: user.id as string, username };
}

/** Sign a worker in through the API in this page's context, then open a path. */
export async function signInAs(page: Page, username: string, path = '/') {
  const res = await page.request.post('/api/auth/sign-in', { data: { username, password: WORKER_PASSWORD }, headers: ORIGIN });
  expect(res.status(), await res.text()).toBe(200);
  await page.goto(path);
}
