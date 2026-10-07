import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Quickstart Q16, Q17 / US4.
test('the Owner reads and filters the audit log; nothing can be edited', async ({ page }) => {
  // Make sure there is a failed sign-in to filter for.
  const failed = await page.request.post('/api/auth/sign-in', {
    data: { username: 'hicham', password: 'wrong-audit-guess' },
    headers: { origin: 'http://localhost:3100' },
  });
  expect(failed.status()).toBe(401);
  await signIn(page, '/audit');
  await expect(page.getByRole('heading', { level: 1, name: /audit log/i })).toBeVisible();
  const list = page.getByRole('list', { name: /audit entries/i });
  await expect(list.getByRole('listitem').first()).toBeVisible();
  await expect(list.getByText('Signed in').first()).toBeVisible();

  await page.getByLabel(/action/i).selectOption('auth.sign_in_failed');
  await expect(list.getByRole('listitem').first()).toBeVisible();
  for (const item of await list.getByRole('listitem').all()) {
    await expect(item).toContainText('Failed sign-in');
  }

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await page.getByLabel(/^from/i).fill(iso);
  await page.getByLabel(/^to/i).fill(iso);
  await expect(list.getByRole('listitem').first()).toBeVisible();

  await expect(page.getByRole('button', { name: /edit|delete/i })).toHaveCount(0);
});
