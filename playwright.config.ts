import 'dotenv/config';
import fs from 'fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the golden-path smoke suite (tests-e2e/).
 *
 * Runs against PLAYWRIGHT_BASE_URL (default http://localhost:3000). If a
 * server is already listening there - your own `npm run dev` - it's reused;
 * otherwise the runner starts one. (It used to always start a second dev
 * server on :3100, which Next 16 refuses while another `next dev` is running
 * in the same folder.)
 *
 * Browser: prefers a normal Playwright-managed install (`npx playwright
 * install chromium`, e.g. in CI, which has network access for it). Falls
 * back to the local sandbox's system Chromium (used for the pre-launch
 * audit's screenshot walkthrough) only when neither a Playwright install
 * nor an explicit override is present - this dev sandbox has no network
 * access for Playwright's own browser download.
 */
const LOCAL_SANDBOX_CHROMIUM = '/snap/bin/chromium';
export const E2E_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const e2ePort = new URL(E2E_BASE_URL).port || '3000';

const explicitChromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  (!process.env.CI && fs.existsSync(LOCAL_SANDBOX_CHROMIUM) ? LOCAL_SANDBOX_CHROMIUM : undefined);

export default defineConfig({
  testDir: './tests-e2e',
  timeout: 30_000,
  fullyParallel: false, // shares one seeded dev-login account across tests
  retries: 0,
  workers: 1,
  reporter: [['list']],
  // Logs in once (global-setup.ts) and every test starts already
  // authenticated via this cookie, rather than each test signing in
  // through the UI - signing in ~10 times across both spec files in one
  // run used to trip /api/auth/login's own rate limit (8/5min). The one
  // test that specifically exercises the login form overrides this with
  // an empty storageState (see golden-path.spec.ts).
  globalSetup: './tests-e2e/global-setup.ts',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    storageState: './tests-e2e/.auth-state.json',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(explicitChromiumPath ? { executablePath: explicitChromiumPath } : {}),
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${e2ePort}`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NODE_ENV: 'development',
    },
  },
});
