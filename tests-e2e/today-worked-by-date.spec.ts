import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Regressions on Today:
 *  - choosing another date changed the task counts but left "worked" on today;
 *  - work that runs past midnight belongs to the day it started.
 */

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
});

// Days far enough back to be empty in the shared dev account.
const D = '2024-02-28';
const NEXT = '2024-02-29';
const EMPTY = '2024-02-20';

async function completedTask(page: Page, date: string, start: string, end: string) {
  const res = await page.request.post('/api/tasks', { data: { name: uniqueName('E2E worked'), date, priority: 'MEDIUM' } });
  expect(res.ok()).toBeTruthy();
  const t = await res.json();
  created.push(t.id);
  const done = await page.request.put(`/api/tasks/${t.id}`, { data: { status: 'COMPLETED', slots: [{ startTime: start, endTime: end }] } });
  expect(done.ok()).toBeTruthy();
}

const figure = (page: Page, label: RegExp) =>
  page.locator('dl > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');

async function goTo(page: Page, ymd: string) {
  await page.getByLabel('Go to date').fill(ymd);
}

test('worked follows the selected date, and overnight work stays on its start day', async ({ page }) => {
  await completedTask(page, D, '23:30', '01:00'); // runs past midnight -> all on D
  await completedTask(page, NEXT, '09:00', '10:00');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const todayWorked = await figure(page, /^worked$/).innerText();

  await goTo(page, D);
  await expect(figure(page, /^worked · /)).toHaveText('1h 30m');
  await expect(figure(page, /^done · /)).toHaveText('1/1');

  await goTo(page, NEXT);
  await expect(figure(page, /^worked · /)).toHaveText('1h');
  await expect(figure(page, /^done · /)).toHaveText('1/1');

  await goTo(page, EMPTY);
  await expect(figure(page, /^worked · /)).toHaveText('0m');
  await expect(figure(page, /^done · /)).toHaveText('0/0');

  await goTo(page, D);
  await expect(figure(page, /^worked · /)).toHaveText('1h 30m');

  // Same after a reload (which reopens on today), and today's figure is back.
  await page.reload();
  await expect(figure(page, /^worked$/)).toHaveText(todayWorked);
  await goTo(page, D);
  await expect(figure(page, /^worked · /)).toHaveText('1h 30m');
});
