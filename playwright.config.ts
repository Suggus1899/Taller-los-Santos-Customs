import { defineConfig, devices } from '@playwright/test';

/**
 * Tests end-to-end: arrancan el build de producción (`dist/`) contra una base de
 * datos propia (E2E_DATABASE_URL) y lo recorren con un navegador real.
 * Requiere `npm run build` antes. En CI: `npx playwright install --with-deps chromium`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3500);
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://taller:taller@localhost:5432/taller_e2e';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node dist/server.js',
    url: `http://127.0.0.1:${PORT}/readyz`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'development', // cookies sin `Secure`: el servidor de pruebas es HTTP
      LOG_LEVEL: 'warn',
      PORT: String(PORT),
      DATABASE_URL: E2E_DATABASE_URL,
      SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-1234',
      SITE_URL: `http://127.0.0.1:${PORT}`,
      EXCHANGE_RATE_API_URL: '',
    },
  },
});
