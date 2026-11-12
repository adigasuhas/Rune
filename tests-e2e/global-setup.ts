import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';
import { signInAsDevUser } from './helpers';
import { E2E_BASE_URL } from '../playwright.config';

const LOCAL_SANDBOX_CHROMIUM = '/snap/bin/chromium';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  (!process.env.CI && fs.existsSync(LOCAL_SANDBOX_CHROMIUM) ? LOCAL_SANDBOX_CHROMIUM : undefined);

/**
 * Signs in once before the whole suite runs and saves the resulting session
 * cookie to disk, reused by every test via `use.storageState` in
 * playwright.config.ts. Both spec files used to call signInAsDevUser() in
 * nearly every test - golden-path.spec.ts (4 sign-ins) plus
 * accessibility.spec.ts (6 sign-ins) added up to ~10 logins in one run,
 * which tripped the password-login rate limit (20 per 5 minutes,
 * src/app/api/auth/password-login/route.ts) - a real, correctly-working
 * security control, not a bug, but incompatible with logging in fresh per
 * test. Only the dedicated "sign in" test in golden-path.spec.ts still
 * exercises the real login form from a logged-out state (see its
 * `storageState` override).
 *
 * The built-in developer account (src/lib/devAccount.ts) always exists once
 * the server has booted at least once, so there is nothing to skip here.
 */
export default async function globalSetup() {
  const outPath = path.join(__dirname, '.auth-state.json');

  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ baseURL: E2E_BASE_URL });
  await signInAsDevUser(page);
  await page.context().storageState({ path: outPath });

  // On an empty database (CI) the developer account sees "Create the first
  // user" in place of every page until some other account exists. Specs
  // used to rely on auth.spec.ts signing one up first, which only held while
  // nothing sorted before it alphabetically. Make one up front instead.
  const me = await (await page.request.get('/api/auth/me')).json().catch(() => null);
  if (me?.user?.showCreateFirstUser) {
    await page.request.post('/api/developer/users', {
      headers: { Origin: E2E_BASE_URL },
      data: { name: 'E2E colleague', email: `e2e-first-user-${Date.now()}@example.com`, password: 'e2e-colleague-password-1' },
    });
  }

  // CI runs against a cold `next dev`, which compiles each page and API route
  // the first time it's hit - long enough on a 2-core runner to blow a
  // test's 5-second expectation. Compile the main ones once, up front.
  if (process.env.CI) {
    for (const route of ['/api/tasks', '/api/projects', '/api/calendar', '/api/settings', '/api/accomplishments', '/api/notebooks', '/api/activity-sessions', '/api/reflections', '/api/projects/investment', '/api/notifications']) {
      await page.request.get(route, { timeout: 120_000 }).catch(() => {});
    }
    for (const route of ['/', '/tasks', '/projects', '/analytics', '/wall', '/notebook', '/settings']) {
      await page.goto(route, { timeout: 120_000, waitUntil: 'load' }).catch(() => {});
    }
  }
  await browser.close();
}
