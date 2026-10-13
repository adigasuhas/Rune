import { Page, expect } from '@playwright/test';

/**
 * Signs in as the built-in developer account through the normal sign-in
 * form - there is no separate "developer login" surface any more. The
 * account (src/lib/devAccount.ts) is created automatically the first time
 * the server boots against a fresh database, so this always has valid
 * credentials to use (RUNE_DEVELOPER_PASSWORD can override the default
 * before that first boot; see .env.example).
 */
export async function signInAsDevUser(page: Page) {
  const email = 'developer_adiga@rune.io';
  const password = process.env.RUNE_DEVELOPER_PASSWORD || 'developer12345';

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/(tasks|onboarding)?$/, { timeout: 15_000 });
}

/** A name unique enough not to collide with anything already in the shared dev-seeded account, and identifiable as E2E-created if it's ever left behind. */
export function uniqueName(prefix: string): string {
  return `${prefix} [e2e ${Date.now()}]`;
}
