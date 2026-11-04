import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uniqueName } from './helpers';

/**
 * A project's page: its facts (status, priority, dates, tasks, hours) sit in
 * one row and are each said once; hours never show more than two decimals;
 * objectives are added in place.
 */

const cleanup: string[] = [];
test.afterAll(async ({ request }) => {
  for (const url of cleanup.reverse()) await request.delete(url).catch(() => {});
});

test('project facts read once, in one row, with tidy numbers', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const now = new Date();
  const start = new Date(now.getTime() - 20 * 86400000).toISOString().slice(0, 10);
  const deadline = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const project = await (await page.request.post('/api/projects', {
    data: {
      name: uniqueName('E2E project page'),
      description: 'Checks the project page.',
      priority: 'HIGH',
      startDate: start,
      deadline,
      goals: JSON.stringify([{ id: 'a', text: 'First objective', completed: true }, { id: 'b', text: 'Second objective', completed: false }]),
    },
  })).json();
  cleanup.push(`/api/projects/${project.id}`);
  const open = await (await page.request.post('/api/tasks', { data: { name: uniqueName('E2E thirds'), projectId: project.id, date: today, estimatedTime: 2.3333333 } })).json();
  cleanup.push(`/api/tasks/${open.id}`);
  const blocked = await (await page.request.post('/api/tasks', { data: { name: uniqueName('E2E waiting'), projectId: project.id, date: today, estimatedTime: 1 } })).json();
  cleanup.push(`/api/tasks/${blocked.id}`);
  await page.request.put(`/api/tasks/${blocked.id}`, { data: { status: 'BLOCKED', blockedReason: 'Facility manager' } });

  await page.goto(`/projects/${project.id}`);
  const facts = page.locator('dl[aria-label="Project details"]');
  await expect(facts).toBeVisible({ timeout: 15_000 });
  await expect(facts).toContainText('Active');
  await expect(facts).toContainText('High');
  await expect(facts).toContainText('0 of 2');
  await expect(facts).toContainText('of 3.33h');

  // The deadline, the notebook and the project's status each appear once.
  const rel = (await facts.locator('dd').nth(2).innerText()).match(/in \d+ (weeks|days)/)?.[0];
  expect(rel).toBeTruthy();
  await expect(page.getByText(rel!, { exact: false })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /notebook/i })).toHaveCount(1);
  await expect(page.getByText('Active', { exact: true })).toHaveCount(1);

  // Rows: the estimate is rounded; a blocked task says who it waits on, once.
  const tasks = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Tasks', exact: true }) });
  await expect(tasks.getByRole('listitem').filter({ hasText: open.name })).toContainText('2.33h');
  await expect(tasks.getByRole('listitem').filter({ hasText: blocked.name })).toHaveText(new RegExp(`${blocked.name.replace(/[[\]]/g, '\\$&')}\\s*Waiting on Facility manager$`));

  // No number anywhere on the page with three or more decimals.
  expect(await page.locator('main').innerText()).not.toMatch(/\d\.\d{3,}/);

  // Objectives: counted once, added in place.
  const objectives = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Objectives', exact: true }) });
  await expect(objectives).toContainText('1 of 2');
  await objectives.getByLabel('New objective').fill('Third objective');
  await objectives.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(objectives).toContainText('1 of 3');
  await expect.poll(async () => (await (await page.request.get(`/api/projects/${project.id}`)).json()).goals).toContain('Third objective');

  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
});
