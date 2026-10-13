import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Automated accessibility pass (axe-core) across the main authenticated
 * pages and the public login page - the full pass the pre-launch audit's
 * manual contrast spot-check stood in for. Scoped to WCAG 2.0/2.1 A and AA
 * rules (axe's own "wcag2a"/"wcag2aa"/"wcag21a"/"wcag21aa" tags), which is
 * the same bar the manual review was checking against.
 *
 * A finding here is a real, tool-verified violation (axe only flags things
 * it's confident about - it doesn't guess) - not a style preference.
 *
 * Every test here starts already signed in via the shared storageState
 * global-setup.ts produces, except "login page" - the login screen itself
 * redirects an already-authenticated visitor straight back to the
 * dashboard (src/app/login/page.tsx), so that one test clears cookies
 * first to actually land on, and scan, the logged-out page.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scanCurrentPage(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
}

function formatViolations(violations: import('axe-core').Result[]): string {
  return violations
    .map((v) => `\n[${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`)
    .join('\n');
}

test.describe('accessibility (axe-core, WCAG 2.1 A/AA)', () => {
  test('login page', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/login');
    const results = await scanCurrentPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('tasks page', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
    const results = await scanCurrentPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('projects page', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    const results = await scanCurrentPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('notebook library page', async ({ page }) => {
    await page.goto('/notebook');
    await page.waitForLoadState('networkidle');
    const results = await scanCurrentPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('teams page', async ({ page }) => {
    await page.goto('/teams');
    await page.waitForLoadState('networkidle');
    const results = await scanCurrentPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('settings page', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    const results = await scanCurrentPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test('onboarding page', async ({ page }) => {
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
    const results = await scanCurrentPage(page);
    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });
});

/**
 * The public pages (landing, features, why-free, docs, account recovery), in
 * both themes. Signed out, with reduced motion so scroll-in animations can't
 * leave content mid-fade while axe measures contrast.
 */
test.describe('accessibility: public pages, light and dark', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  const PUBLIC = ['/', '/features', '/pricing', '/docs', '/docs/getting-started', '/login?mode=signup', '/forgot-password'];

  for (const theme of ['light', 'dark'] as const) {
    for (const path of PUBLIC) {
      test(`${path} (${theme})`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addInitScript((t) => localStorage.setItem('rune_theme_v2', t), theme);
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const results = await scanCurrentPage(page);
        expect(results.violations, formatViolations(results.violations)).toEqual([]);
      });
    }
  }
});
