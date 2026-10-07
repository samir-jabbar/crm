import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${PORT}`;

/**
 * E2E runs against a production build served by the real server on a fresh data directory.
 * The `setup` project performs first-launch setup (Q1); every other project depends on it.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /setup-and-sign-in\.spec\.ts/,
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testIgnore: /setup-and-sign-in\.spec\.ts/,
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } },
    },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: /setup-and-sign-in\.spec\.ts|performance\.spec\.ts|pwa-offline\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node e2e/start-server.mjs',
    url: `${E2E_BASE_URL}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
});
