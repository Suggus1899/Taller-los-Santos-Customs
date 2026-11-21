import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // Los tests de integración comparten la base de datos de test: se ejecutan en serie.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
