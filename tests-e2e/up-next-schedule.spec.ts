import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Regressions:
 *  - "Give it a time" in Up next reused the last event/task's slots (and the
 *    event being edited, which saving would delete) instead of starting from
 *    the chosen task's own schedule, or empty;
 *  - a scheduled task showed no time at all until it was marked done.
 */

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
});

async function accountClock(page: Page) {
  const tz = ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
  const fmt = (d: Date) => ({
    date: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
    time: new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d),
  });
  return { fmt };
}

async function createTask(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/tasks', { data: { priority: 'MEDIUM', ...data } });
  expect(res.ok()).toBeTruthy();
  const task = await res.json();
  created.push(task.id);
  return task;
}

const card = (page: Page, name: string) =>
  page.locator('div[draggable="true"]').filter({ has: page.getByText(name, { exact: true }) });

test('Up next: elapsed time while ongoing, and scheduling never inherits another task’s slots', async ({ page }) => {
  const { fmt } = await accountClock(page);
  const now = Date.now();
  const start = fmt(new Date(now - 30 * 60_000));
  const end = fmt(new Date(now + 60 * 60_000));
  const today = fmt(new Date(now)).date;
  test.skip(start.date !== today || end.date !== today, 'too close to midnight in the account timezone');

  const nameA = uniqueName('E2E ongoing');
  const nameB = uniqueName('E2E unscheduled');
  const a = await createTask(page, { name: nameA, date: today, slots: [{ startTime: start.time, endTime: end.time }] });
  const b = await createTask(page, { name: nameB, date: today });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(card(page, nameA)).toContainText(/(29|30|31)m so far/, { timeout: 15_000 });
  await expect(card(page, nameB)).not.toContainText(/so far|elapsed/);

  // Same value after a reload - derived from the schedule, not a timer.
  await page.reload();
  await expect(card(page, nameA)).toContainText(/(29|30|31)m so far/, { timeout: 15_000 });

  // Schedule A: opens on A's own saved slot.
  await card(page, nameA).hover();
  await page.getByRole('button', { name: `Schedule ${nameA}` }).click();
  const dialog = page.getByRole('heading', { name: 'Schedule task' }).locator('xpath=ancestor::div[contains(@class,"max-w-md")][1]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Not scheduled yet')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Then B: empty, with the placeholder, and saving is refused.
  await card(page, nameB).hover();
  await page.getByRole('button', { name: `Schedule ${nameB}` }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Not scheduled yet')).toBeVisible();
  await dialog.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByText('Pick a start and end time to schedule this task.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  const events = await (await page.request.get('/api/calendar')).json();
  expect(events.filter((e: { taskId: string }) => e.taskId === b.id)).toHaveLength(0);
  expect(events.filter((e: { taskId: string }) => e.taskId === a.id)).toHaveLength(1);

  // Move A's start into the future: the elapsed time goes away.
  const later = fmt(new Date(now + 90 * 60_000));
  const laterEnd = fmt(new Date(now + 120 * 60_000));
  test.skip(laterEnd.date !== today, 'too close to midnight in the account timezone');
  const res = await page.request.put(`/api/tasks/${a.id}`, { data: { slots: [{ startTime: later.time, endTime: laterEnd.time }] } });
  expect(res.ok()).toBeTruthy();
  await page.reload();
  await expect(card(page, nameA)).toBeVisible({ timeout: 15_000 });
  await expect(card(page, nameA)).not.toContainText(/so far|elapsed/);
});
