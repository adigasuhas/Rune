import { test, expect as baseExpect, Page } from '@playwright/test';

/**
 * Account creation, sign-in/out, session persistence, and secret-question
 * recovery - end to end through the real forms against a real database.
 * Starts logged out (overrides the suite's shared storageState).
 *
 * Kept to two sign-ups per run: /api/auth/signup allows 10 per client per
 * hour, and a local run shares one client key.
 */
test.use({ storageState: { cookies: [], origins: [] } });
// First hits compile routes on a dev server, and every auth check runs a
// deliberate ~200ms PBKDF2 hash - give assertions room.
test.setTimeout(90_000);
const expect = baseExpect.configure({ timeout: 15_000 });

const stamp = Date.now();
const PASSWORD = 'orchard-lamp-and-kettle';
const NEW_PASSWORD = 'quiet-library-at-noon';

const email = (p: Page) => p.getByLabel('Email', { exact: true });
const password = (p: Page) => p.getByLabel('Password', { exact: true });

async function signIn(page: Page, addr: string, pw: string) {
  await page.goto('/login');
  await email(page).fill(addr);
  await password(page).fill(pw);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe.serial('accounts', () => {
  const addr = `mira.${stamp}@example.org`;

  test('sign-up validates inline, then creates the account and starts a session', async ({ page }) => {
    await page.goto('/login?mode=signup');
    await expect(page.getByRole('heading', { name: 'Create your Rune account' })).toBeVisible();

    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Choose a password.')).toBeVisible();
    await expect(page.getByText('Choose a recovery question.')).toBeVisible();
    await expect(email(page)).toBeFocused(); // focus jumps to the first problem

    await email(page).fill('not-an-email');
    await password(page).fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('That doesn’t look like an email address.')).toBeVisible();
    await expect(page.getByText('Use at least 10 characters.')).toBeVisible();

    await page.getByLabel('Name').fill('Mira');
    await email(page).fill(addr);
    await password(page).fill(PASSWORD);
    await page.getByLabel('Recovery question').selectOption('emergency-coffee');
    await page.getByLabel('Your answer').fill('Filter coffee, extra strong');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });
    await page.reload(); // the session survives a reload
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('a taken email is refused with a way forward', async ({ page }) => {
    await page.goto('/login?mode=signup');
    await email(page).fill(addr.toUpperCase());
    await password(page).fill(PASSWORD);
    await page.getByLabel('Recovery question').selectOption('first-pet');
    await page.getByLabel('Your answer').fill('Biscuit');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'already exists' })).toBeVisible();
  });

  test('sign out, wrong password, then sign back in', async ({ page }) => {
    await signIn(page, addr, PASSWORD);
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 15_000 });

    await page.request.post('/api/auth/logout');
    await page.goto('/tasks');
    await expect(page).toHaveURL(/\/login\?redirect=%2Ftasks/);

    await email(page).fill(addr);
    await password(page).fill('not-my-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password.' })).toBeVisible();

    await password(page).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // Not onboarded yet, so the app sends them on to onboarding regardless of ?redirect.
    await expect(page).toHaveURL(/\/(onboarding|tasks)$/, { timeout: 15_000 });
  });

  test('forgot password: recovery question, new password, old one stops working', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/); // used to bounce back to /login

    await page.getByLabel('Email').fill(addr);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('What’s your emergency coffee order?')).toBeVisible();

    await page.getByLabel('Answer').fill('tea');
    await page.getByRole('button', { name: 'Verify answer' }).click();
    await expect(page.getByText(/doesn’t match what we have on file/)).toBeVisible();

    await page.getByLabel('Answer').fill('  FILTER coffee — extra strong ');
    await page.getByRole('button', { name: 'Verify answer' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();

    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD + 'x');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByText('These don’t match yet.')).toBeVisible();

    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByText('Password updated.')).toBeVisible();

    await email(page).fill(addr);
    await password(page).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password.' })).toBeVisible();

    await password(page).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/(onboarding|tasks)?$/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('an unknown email still gets a question, and the answer just fails', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(`nobody.${stamp}@example.org`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Your question')).toBeVisible();
    await page.getByLabel('Answer').fill('anything');
    await page.getByRole('button', { name: 'Verify answer' }).click();
    await expect(page.getByText(/doesn’t match what we have on file/)).toBeVisible();
  });

  test('an emailed reset link opens its page instead of bouncing to sign-in', async ({ page }) => {
    await page.goto('/reset-password?token=not-a-real-token');
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /invalid or has expired/ })).toBeVisible();
  });
});
