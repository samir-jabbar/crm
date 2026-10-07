import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Quickstart Q18 / US5.
test('the Owner sets the company name and the session timeout', async ({ page }) => {
  await signIn(page, '/settings');
  await expect(page.getByRole('heading', { level: 1, name: /settings/i })).toBeVisible();

  const name = 'HANJING MACHINERY 汉景';
  await page.getByLabel(/company name/i).fill(name);
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByText(/settings saved/i)).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(name);

  const currencies = page.getByRole('region', { name: /currencies/i });
  await expect(currencies).toContainText('CNY');
  await expect(currencies).toContainText(/base currency/i);
  for (const code of ['USD', 'MAD', 'EUR']) await expect(currencies).toContainText(code);

  await page.getByLabel(/^session timeout$/i).fill('8');
  await page.getByLabel(/unit/i).selectOption('hours');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByText(/settings saved/i)).toBeVisible();
  const saved = await page.request.get('/api/settings');
  expect((await saved.json()).sessionIdleTimeoutMinutes).toBe(480);

  // Restore the default for other specs.
  await page.getByLabel(/^session timeout$/i).fill('12');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(page.getByText(/settings saved/i)).toBeVisible();
});
