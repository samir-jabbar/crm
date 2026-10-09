import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const PASSWORD = 'Pelle-Doosan-2026';

// 005 quickstart W1–W2 / US1, FR-001 – FR-004: a new worker registers on a phone and the Owner lets them in.
test('a worker registers, waits for approval, and signs in once approved', async ({ page, browser }) => {
  const tag = Date.now().toString(36);
  const username = `youssef${tag}`;
  const name = `Youssef ${tag}`;

  // The worker registers from the sign-in screen.
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Register' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Register' })).toBeVisible();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Display name').fill(name);
  await page.locator('input[autocomplete="new-password"]').first().fill(PASSWORD);
  await page.getByLabel('Repeat the password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();

  // Before approval, signing in says why it is refused.
  await page.getByRole('link', { name: 'Go to sign in' }).click();
  await page.getByLabel(/username/i).fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByText("Your account is waiting for the Owner's approval.")).toBeVisible();

  // The Owner approves the registration with the Read-only template, from another device.
  const ownerContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const owner = await ownerContext.newPage();
  await signIn(owner, '/');
  await owner.getByRole('button', { name: 'Menu' }).click();
  await owner.getByRole('link', { name: /Users \(\d+ waiting\)/ }).click();
  const pending = owner.getByRole('region', { name: 'Waiting for approval' });
  await expect(pending).toContainText(username);
  await pending.getByRole('link', { name: `Approve ${name}` }).click();
  await owner.getByRole('radio', { name: /Read-only/ }).check();
  await owner.getByRole('button', { name: 'Approve' }).click();
  await expect(owner.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(owner.getByText('Active', { exact: true })).toBeVisible();
  await ownerContext.close();

  // Now the worker can sign in.
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
});
