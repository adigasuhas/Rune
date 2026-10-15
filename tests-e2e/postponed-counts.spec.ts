import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Regression: postponing today's task to tomorrow showed Postponed 0 on today
 * and 1 on tomorrow. A postponement belongs to the day it was moved FROM; the
 * task itself is scheduled (and listed) on its new date.
 */

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
});

const tabCount = async (page: Page, label: string) =>
  Number((await page.getByRole('tab', { name: new RegExp(`^${label}\\s*\\d+$`) }).innerText()).replace(/\D+/g, ''));

async function days(page: Page) {
  const tz = ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const plus = (n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  return { today, tomorrow: plus(1), later: plus(3) };
}

async function selectDay(page: Page, ymd: string) {
  const label = await page.evaluate((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), ymd);
  await page.getByTitle(label, { exact: true }).click();
  await expect(page.getByRole('tab', { name: /^All\s*\d+$/ })).toBeVisible();
}

test('postponing today -> tomorrow counts on today, schedules on tomorrow', async ({ page }) => {
  const { today, tomorrow, later } = await days(page);
  const name = uniqueName('E2E postpone');
  const res = await page.request.post('/api/tasks', { data: { name, date: today, priority: 'MEDIUM' } });
  expect(res.ok()).toBeTruthy();
  const task = await res.json();
  created.push(task.id);

  await page.goto('/tasks');
  await selectDay(page, tomorrow);
  const tomorrowBefore = { all: await tabCount(page, 'All'), postponed: await tabCount(page, 'Postponed') };
  await selectDay(page, today);
  const todayBefore = { all: await tabCount(page, 'All'), postponed: await tabCount(page, 'Postponed') };

  // Postpone through the real Move dialog.
  const row = page.locator(`#task-row-${task.id}`);
  await row.hover();
  await row.getByRole('button', { name: 'Move task' }).click();
  await page.getByLabel('New date').fill(tomorrow);
  await page.getByLabel('Reason (optional)').fill('waiting on samples');
  await page.getByRole('button', { name: 'Move task', exact: true }).last().click();

  await expect.poll(() => tabCount(page, 'Postponed')).toBe(todayBefore.postponed + 1);
  expect(await tabCount(page, 'All')).toBe(todayBefore.all - 1);

  // Today's Postponed tab lists it, marked with where it went.
  await page.getByRole('tab', { name: /^Postponed\s*\d+$/ }).click();
  await expect(page.locator(`#task-row-${task.id}`)).toContainText('moved to');

  // Tomorrow: scheduled there, but not "postponed" there.
  await selectDay(page, tomorrow);
  expect(await tabCount(page, 'Postponed')).toBe(tomorrowBefore.postponed);
  expect(await tabCount(page, 'All')).toBe(tomorrowBefore.all + 1);
  await page.getByRole('tab', { name: /^All\s*\d+$/ }).click();
  await expect(page.locator(`#task-row-${task.id}`)).toBeVisible();

  // Same after a reload.
  await page.reload();
  await selectDay(page, today);
  expect(await tabCount(page, 'Postponed')).toBe(todayBefore.postponed + 1);

  // Postpone again, tomorrow -> later: attributed to tomorrow, today unchanged.
  const again = await page.request.put(`/api/tasks/${task.id}`, { data: { date: later, postpone: {} } });
  expect(again.ok()).toBeTruthy();
  const history = JSON.parse((await again.json()).postponeHistory);
  expect(history.map((e: { originalDate: string; newDate: string }) => [e.originalDate, e.newDate])).toEqual([[today, tomorrow], [tomorrow, later]]);
  await page.reload();
  await selectDay(page, today);
  expect(await tabCount(page, 'Postponed')).toBe(todayBefore.postponed + 1);
  await selectDay(page, tomorrow);
  expect(await tabCount(page, 'Postponed')).toBe(tomorrowBefore.postponed + 1);
  expect(await tabCount(page, 'All')).toBe(tomorrowBefore.all);
});
