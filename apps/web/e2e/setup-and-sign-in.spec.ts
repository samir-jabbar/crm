import { expect, test } from '@playwright/test';
import { E2E_SETUP_CODE, OWNER } from './helpers';

// Quickstart Q1 / US1 — runs first (the "setup" project); every other project depends on it.
test.describe.serial('first launch', () => {
  test('setup creates the Owner, then sign-out and sign-in work', async ({ page }) => {
    const started = Date.now();
    await page.goto('/');
    await expect(page).toHaveURL(/\/setup$/);

    await page.getByLabel(/setup code/i).fill(E2E_SETUP_CODE);
    await page.getByLabel(/^username/i).fill(OWNER.username);
    await page.getByLabel(/display name/i).fill(OWNER.displayName);
    await page.getByLabel(/^password/i).fill(OWNER.password);
    await page.getByRole('button', { name: /create owner account/i }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: new RegExp(OWNER.displayName) })).toBeVisible();
    expect(Date.now() - started).toBeLessThan(120_000); // SC-001

    await page.getByRole('button', { name: /menu/i }).click();
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.getByLabel(/username/i).fill(OWNER.username);
    await page.getByLabel(/password/i).fill(OWNER.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('setup is closed once the Owner exists', async ({ page }) => {
    await page.goto('/setup');
    await expect(page).toHaveURL(/\/(sign-in)?$/);
  });
});
