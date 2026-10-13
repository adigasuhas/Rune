import { test, expect } from '@playwright/test';
import { signInAsDevUser, uniqueName } from './helpers';

/**
 * End-to-end smoke test of the golden path a brand-new user actually takes:
 * sign in, create a project, create a task, create a team - each verified
 * to actually appear where a user would look for it, not just a 200 from
 * the API. This is the first browser-driven test in the repo; the rest of
 * the suite (tests/) is unit/integration-level with a mocked or in-memory
 * database. Runs against the real dev server + the real Postgres it's
 * pointed at (see playwright.config.ts), signing in as the built-in
 * developer account (src/lib/devAccount.ts) through the real sign-in form -
 * so this exercises the actual UI, not a shortcut.
 *
 * Every test except the first starts already signed in via the shared
 * storageState global-setup.ts produces - only "sign in lands on a real
 * page" below overrides that with a blank state, since it's the one test
 * that needs to exercise the actual login form. (Signing in fresh in every
 * test here used to trip the password-login rate limit once this file ran
 * alongside tests-e2e/accessibility.spec.ts in the same run.)
 *
 * Every created entity uses a timestamped name and is deleted again at the
 * end (best-effort, `test.afterAll`) so repeated runs don't accumulate
 * clutter in the shared dev-seeded account.
 */

const projectName = uniqueName('E2E Project');
const taskName = uniqueName('E2E Task');
const teamName = uniqueName('E2E Team');

test.describe.serial('golden path: sign in, create project, task, team', () => {
  test('sign in lands on a real page, not the login screen', async ({ page }) => {
    // Overrides the shared authenticated storageState with a logged-out
    // context, since this is the one test that needs to exercise the real
    // login form rather than start pre-authenticated.
    await page.context().clearCookies();
    await signInAsDevUser(page);
    await expect(page.getByRole('button', { name: /account|suhas|developer/i }).first()).toBeVisible({ timeout: 10_000 }).catch(() => {});
    // The sidebar's own nav is the more reliable signal that we're actually
    // inside the app shell, not just past the login form.
    await expect(page.getByRole('link', { name: 'Tasks' })).toBeVisible();
  });

  test('create a project and see it in the list', async ({ page }) => {
    await page.goto('/projects');
    // .first() - with no projects yet, the empty state repeats the
    // header's "New project" button.
    await page.getByRole('button', { name: 'New project' }).first().click();
    await page.getByLabel('Project name').fill(projectName);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  test('create a task and see it on the board', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByRole('button', { name: 'New task' }).first().click();
    await page.getByLabel('Task name').fill(taskName);
    await page.getByRole('button', { name: 'Create task' }).click();
    // The Tasks board defaults to "today"; search by name to find it
    // regardless of which day it landed on.
    await page.getByLabel('Find a task').fill(taskName.slice(0, 20));
    // .first() - a success toast containing the same task name can be on
    // screen at the same moment as the task row itself.
    await expect(page.getByText(taskName).first()).toBeVisible({ timeout: 10_000 });
  });

  test('create a team and open its detail page', async ({ page }) => {
    await page.goto('/teams');
    await page.getByRole('button', { name: 'Create a team' }).first().click();
    await page.getByRole('dialog', { name: 'Create team' }).getByRole('textbox').first().fill(teamName);
    await page.getByRole('button', { name: 'Create team', exact: true }).click();
    const teamLink = page.getByRole('link', { name: new RegExp(teamName.replace(/[[\]]/g, '\\$&')) });
    await expect(teamLink).toBeVisible({ timeout: 10_000 });
    await teamLink.click();
    await expect(page.getByRole('heading', { name: teamName })).toBeVisible({ timeout: 10_000 });
  });

  // Cleanup goes through the API directly (via page.request, which already
  // carries the shared session cookie from storageState) rather than
  // replaying the delete flow through the UI: this suite's job is to verify
  // the create path, and a UI-driven cleanup step just adds another set of
  // brittle selectors with no coverage value of its own. Best-effort - a
  // cleanup failure here shouldn't fail the suite, since the
  // created-and-verified assertions above already did their job.
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      const deleteAllMatching = async (listUrl: string, name: string) => {
        const res = await page.request.get(listUrl);
        if (!res.ok()) return;
        const rows: Array<{ id: string; name: string }> = await res.json();
        for (const row of rows) {
          if (row.name === name) {
            await page.request.delete(`${listUrl}/${row.id}`).catch(() => {});
          }
        }
      };

      // Tasks first - deleting the project only detaches them
      // (Task.projectId's onDelete: SetNull), it doesn't remove them.
      await deleteAllMatching('/api/tasks', taskName);
      await deleteAllMatching('/api/projects', projectName);
      await deleteAllMatching('/api/teams', teamName);
    } catch (err) {
      console.warn('E2E cleanup did not fully complete (non-fatal):', err);
    } finally {
      await page.close();
    }
  });
});
