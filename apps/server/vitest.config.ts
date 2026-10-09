import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/globalSetup.ts'],
    testTimeout: 20_000,
    passWithNoTests: true,
  },
});
