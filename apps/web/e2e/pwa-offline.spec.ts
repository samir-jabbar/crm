import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test.use({ serviceWorkers: 'allow' });

// Quickstart Q10, Q11 / FR-030, FR-032.
test.describe('installable PWA and offline shell', () => {
  test('manifest makes the app installable', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.name).toBe('HANJING Order Manager');
    const sizes = (manifest.icons as { sizes: string }[]).map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });

  test('after one visit the shell opens offline, and no API data comes from the cache', async ({ page, context }) => {
    const cachedApi: string[] = [];
    page.on('response', (r) => {
      if (r.fromServiceWorker() && new URL(r.url()).pathname.startsWith('/api/')) cachedApi.push(r.url());
    });

    await signIn(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole('status').filter({ hasText: /offline|connection/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await context.setOffline(false);
    }
    expect(cachedApi).toEqual([]);
  });
});
