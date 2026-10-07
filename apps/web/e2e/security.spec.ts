import { expect, test } from '@playwright/test';
import { OWNER, signIn } from './helpers';

const ORIGIN = { origin: 'http://localhost:3100' };
const NEW_PASSWORD = 'Temporary-E2E-Passphrase-5';

// Quickstart Q12, Q13 / US3.
test('devices, remote sign-out, password change and "log out all devices"', async ({ page, browser }) => {
  // Start from exactly one signed-in device: earlier specs leave sessions open.
  await signIn(page);
  expect((await page.request.post('/api/me/sessions/revoke-all', { headers: ORIGIN })).status()).toBe(204);
  await signIn(page, '/security');
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage);

  // Both devices are listed; this one is marked.
  await page.reload();
  const devices = page.getByRole('region', { name: /signed-in devices/i });
  await expect(devices.getByRole('listitem')).toHaveCount(2);
  await expect(devices.getByText('This device')).toBeVisible();

  // Sign out the other device remotely.
  await devices.getByRole('button', { name: /^sign out$/i }).click();
  await expect(devices.getByRole('listitem')).toHaveCount(1);
  expect((await otherPage.request.get('/api/me')).status()).toBe(401);

  // Change the password: the other device is signed out, this one stays.
  await signIn(otherPage);
  const password = page.getByRole('region', { name: /change password/i });
  await password.getByLabel(/current password/i).fill(OWNER.password);
  await password.getByLabel(/^new password/i).fill(NEW_PASSWORD);
  await password.getByLabel(/repeat new password/i).fill(NEW_PASSWORD);
  await password.getByRole('button', { name: /change password/i }).click();
  await expect(password.getByText(/password changed/i)).toBeVisible();
  expect((await otherPage.request.get('/api/me')).status()).toBe(401);
  expect((await page.request.get('/api/me')).status()).toBe(200);
  await other.close();

  // Restore the shared E2E password for the other specs.
  const restore = await page.request.post('/api/me/password', {
    data: { currentPassword: NEW_PASSWORD, newPassword: OWNER.password },
    headers: ORIGIN,
  });
  expect(restore.status()).toBe(204);

  // Log out all devices, with confirmation.
  await page.getByRole('button', { name: /log out all devices/i }).click();
  await page.getByRole('dialog').getByRole('button', { name: /log out all devices/i }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('sign-in history shows a failed attempt', async ({ page }) => {
  const failed = await page.request.post('/api/auth/sign-in', {
    data: { username: OWNER.username, password: 'wrong-e2e-guess' },
    headers: ORIGIN,
  });
  expect(failed.status()).toBe(401);
  await signIn(page, '/security');
  const history = page.getByRole('region', { name: /sign-in history/i });
  await expect(history.getByText('Failed').first()).toBeVisible();
  await expect(history.getByText(/wrong username or password/i).first()).toBeVisible();
});
