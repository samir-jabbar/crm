import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// Quickstart Q20 / FR-033: nothing is loaded from Google, CDNs or any other host.
test('every screen loads only from the app origin', async ({ page }) => {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost' && url.protocol !== 'data:' && url.protocol !== 'blob:') {
      external.push(url.href);
      return route.abort();
    }
    return route.continue();
  });

  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'العربية' }).click(); // pulls in the Arabic font
  await page.getByRole('button', { name: 'English' }).click();
  await signIn(page);
  for (const path of ['/', '/security', '/settings', '/audit']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(external).toEqual([]);
});

test('the built shell references no external hosts', () => {
  const files = [
    join(DIST, 'index.html'),
    join(DIST, 'manifest.webmanifest'),
    ...readdirSync(join(DIST, 'assets'))
      .filter((f) => f.endsWith('.css'))
      .map((f) => join(DIST, 'assets', f)),
  ];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const hosts = [...content.matchAll(/(?:src|href|url)\s*[=(]\s*["']?(https?:\/\/[^"')\s]+)/g)].map((m) => m[1]);
    expect(hosts, file).toEqual([]);
  }
});
