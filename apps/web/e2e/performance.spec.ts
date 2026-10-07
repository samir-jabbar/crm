import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');
const JS_BUDGET_GZIP_BYTES = 250 * 1024;

test.use({ serviceWorkers: 'allow' });

// T093: performance budget.
test('initial JavaScript stays within 250 KB gzipped', () => {
  const total = readdirSync(ASSETS)
    .filter((f) => f.endsWith('.js'))
    .reduce((sum, f) => sum + gzipSync(readFileSync(join(ASSETS, f))).length, 0);
  test.info().annotations.push({ type: 'js-gzip-bytes', description: String(total) });
  expect(total).toBeLessThanOrEqual(JS_BUDGET_GZIP_BYTES);
});

// SC-007: previously visited screens appear within 2 s on a slow link (~1 Mbps, high latency, as over a VPN).
test('a visited screen re-opens within 2 seconds on a slow connection', async ({ page, context }) => {
  await signIn(page, '/security');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 300,
    downloadThroughput: (1024 * 1024) / 8,
    uploadThroughput: (512 * 1024) / 8,
  });

  const started = Date.now();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const elapsed = Date.now() - started;
  test.info().annotations.push({ type: 'slow-reload-ms', description: String(elapsed) });
  expect(elapsed).toBeLessThan(2000);
});
