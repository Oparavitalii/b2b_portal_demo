import { tmpdir } from 'node:os';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

import {
  ADMIN,
  API_DIR,
  DEMO,
  ORDER_EMAIL,
  SAMPLE_PRODUCTS,
  STORAGE_DIR,
} from './e2e/helpers';

// E2E against the real stack: PHP API (php -S) + Vite dev server — the same two
// processes scripts/Dev_Start.mjs starts, launched here separately so the web
// server gets its own port (E2E_PORT, default 5183) and never collides with a
// `npm run dev` on 5173. The API gets its own port too (E2E_API_PORT, default
// 8091), passed to this Vite as API_PORT, so an E2E run never takes over or
// stops the dev API on 8080 (B-09).
// Before the API starts, a fresh SQLite database is built in the temp dir
// (Migrate --fresh, Seed, import of the 4-product sample), so the developer
// database in Apps/Api_Php/storage is never touched. Mails go to
// Apps/Api_Php/storage/mail.log (MAIL_DRIVER=log), where the specs read them.
const webPort = Number(process.env.E2E_PORT || 5183);
const baseURL = `http://127.0.0.1:${webPort}`;
const apiPort = Number(process.env.E2E_API_PORT || 8091);
const apiHost = `127.0.0.1:${apiPort}`;
const dbPath = path.join(tmpdir(), 'catalog_portal_e2e', 'katalog_e2e.sqlite');
const php = process.env.PHP_BIN || 'php';
const q = (p: string) => `"${p}"`;

const prepareDb = [
  `${php} ${q(path.join(API_DIR, 'database', 'Migrate.php'))} --fresh`,
  `${php} ${q(path.join(API_DIR, 'database', 'Seed.php'))}`,
  `${php} ${q(path.join(API_DIR, 'database', 'Import_Products.php'))} ${q(SAMPLE_PRODUCTS)}`,
];
const startApi = `${php} -S ${apiHost} -t public ${q(path.join('public', 'index.php'))}`;

const apiEnv = {
  APP_ENV: 'development',
  APP_URL: baseURL,
  DB_PATH: dbPath,
  STORAGE_PATH: STORAGE_DIR,
  MAIL_DRIVER: 'log',
  // Every spec logs in from 127.0.0.1; the login bucket (5 / 15 min) would
  // refuse the sixth login. Rate limiting is covered by the PHP smoke tests.
  RATE_LIMIT: 'off',
  ORDER_EMAIL,
  ADMIN_EMAIL: ADMIN.email,
  ADMIN_PASSWORD: ADMIN.password,
  DEMO_PASSWORD: DEMO.password,
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // One PHP built-in server (single-threaded) and one shared database.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    locale: 'pl-PL',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: [...prepareDb, startApi].join(' && '),
      cwd: API_DIR,
      url: `http://${apiHost}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      // php -S logs every request on stderr
      stderr: 'ignore',
      env: apiEnv,
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      env: { API_PORT: String(apiPort) },
      url: `${baseURL}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
