import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * "Time to get started": a To do task's slot begins -> a reminder with
 * Start task / Dismiss. Runs in the open app (no background delivery).
 */

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
});

async function clock(page: Page) {
  const tz = ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
  return (d: Date) => ({
    date: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
    time: new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d),
  });
}

async function make(page: Page, name: string, start: Date, end: Date) {
  const fmt = await clock(page);
  const s = fmt(start), e = fmt(end);
  test.skip(s.date !== e.date, 'too close to midnight for a same-day slot');
  const res = await page.request.post('/api/tasks', { data: { name, date: s.date, slots: [{ startTime: s.time, endTime: e.time }] } });
  expect(res.ok()).toBeTruthy();
  const t = await res.json();
  created.push(t.id);
  return t as { id: string; name: string };
}

const status = async (page: Page, id: string) => (await (await page.request.get(`/api/tasks/${id}`)).json()).status as string;
const toastFor = (page: Page, name: string) => page.getByRole('alertdialog', { name: 'Time to get started' }).filter({ hasText: name });
const remindersFor = async (page: Page, id: string) =>
  ((await (await page.request.get('/api/notifications?all=true')).json()) as Array<{ dedupeKey?: string; dismissedAt?: string | null }>)
    .filter((n) => n.dedupeKey?.startsWith(`task-start:${id}:`));

test('fires at the scheduled start, and Start task moves it to In progress', async ({ page }) => {
  test.setTimeout(150_000);
  const now = new Date();
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + (now.getSeconds() > 45 ? 2 : 1));
  const name = uniqueName('E2E start on time');
  const t = await make(page, name, start, new Date(start.getTime() + 30 * 60_000));

  await page.goto('/');
  await expect(toastFor(page, name)).toHaveCount(0); // not before its time
  await expect(toastFor(page, name)).toBeVisible({ timeout: 130_000 });
  const shownAt = Date.now();
  expect(shownAt).toBeGreaterThanOrEqual(start.getTime());
  expect(shownAt - start.getTime()).toBeLessThan(5_000); // at the start, not up to a minute late
  await expect(toastFor(page, name)).toContainText('is scheduled to start now');

  await toastFor(page, name).getByRole('button', { name: 'Start task' }).click();
  await expect(page.getByText('Task started')).toBeVisible();
  expect(await status(page, t.id)).toBe('IN_PROGRESS');
  // Up next reflects it without a reload.
  await expect(page.locator('div[draggable="true"]').filter({ hasText: name })).toContainText(/elapsed|In progress/);
  expect((await remindersFor(page, t.id)).every((n) => n.dismissedAt)).toBe(true);
});

test('a missed reminder shows once on return; Dismiss leaves the task pending; no duplicates after reloads', async ({ page }) => {
  const name = uniqueName('E2E start missed');
  const t = await make(page, name, new Date(Date.now() - 10 * 60_000), new Date(Date.now() + 40 * 60_000));
  await page.goto('/');
  await expect(toastFor(page, name)).toBeVisible({ timeout: 15_000 });
  await expect(toastFor(page, name)).toContainText('was scheduled to start at');
  await toastFor(page, name).getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(toastFor(page, name)).toHaveCount(0);
  expect(await status(page, t.id)).toBe('PENDING');

  for (let i = 0; i < 2; i++) {
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(toastFor(page, name)).toHaveCount(0);
  }
  const all = await remindersFor(page, t.id);
  expect(all).toHaveLength(1);
  expect(all[0].dismissedAt).toBeTruthy();
});

test('no reminder for tasks already started, done, or rescheduled; several at once each get one', async ({ page }) => {
  const from = new Date(Date.now() - 5 * 60_000), to = new Date(Date.now() + 30 * 60_000);
  const started = await make(page, uniqueName('E2E start already'), from, to);
  const done = await make(page, uniqueName('E2E start done'), from, to);
  const moved = await make(page, uniqueName('E2E start moved'), from, to);
  const x = await make(page, uniqueName('E2E start same X'), from, to);
  const y = await make(page, uniqueName('E2E start same Y'), from, to);
  await page.request.put(`/api/tasks/${started.id}`, { data: { status: 'IN_PROGRESS' } });
  await page.request.put(`/api/tasks/${done.id}`, { data: { status: 'COMPLETED' } });
  const fmt = await clock(page);
  const later = fmt(new Date(Date.now() + 120 * 60_000)), later2 = fmt(new Date(Date.now() + 150 * 60_000));
  test.skip(later2.date !== fmt(new Date()).date, 'too close to midnight');
  await page.request.put(`/api/tasks/${moved.id}`, { data: { slots: [{ startTime: later.time, endTime: later2.time }] } });

  await page.goto('/');
  await expect(toastFor(page, x.name)).toBeVisible({ timeout: 15_000 });
  await expect(toastFor(page, y.name)).toBeVisible();
  for (const t of [started, done, moved]) await expect(toastFor(page, t.name)).toHaveCount(0);
  for (const t of [started, done, moved]) expect(await remindersFor(page, t.id)).toHaveLength(0);

  // Both are also in the bell, each with its own Start / Dismiss.
  await page.getByRole('button', { name: /notifications/i }).first().click();
  for (const t of [x, y]) {
    const item = page.locator('div').filter({ hasText: t.name }).filter({ has: page.getByRole('button', { name: 'Start task' }) }).last();
    await expect(item).toBeVisible();
  }
});

test('a reminder is withdrawn when the task stops being pending, and Start re-checks first', async ({ page }) => {
  const from = new Date(Date.now() - 3 * 60_000), to = new Date(Date.now() + 30 * 60_000);
  const gone = await make(page, uniqueName('E2E start withdrawn'), from, to);
  const raced = await make(page, uniqueName('E2E start raced'), from, to);
  await page.goto('/');
  await expect(toastFor(page, gone.name)).toBeVisible({ timeout: 15_000 });
  await expect(toastFor(page, raced.name)).toBeVisible();

  // Finished elsewhere -> withdrawn on the next look (here: a tasks-changed signal).
  await page.request.put(`/api/tasks/${gone.id}`, { data: { status: 'COMPLETED' } });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('rune-tasks-changed')));
  await expect(toastFor(page, gone.name)).toHaveCount(0, { timeout: 10_000 });
  expect((await remindersFor(page, gone.id)).every((n) => n.dismissedAt)).toBe(true);

  // Started in another tab before the click -> Start doesn't touch it again.
  await page.request.put(`/api/tasks/${raced.id}`, { data: { status: 'IN_PROGRESS' } });
  await toastFor(page, raced.name).getByRole('button', { name: 'Start task' }).click();
  await expect(page.getByText('Nothing to start')).toBeVisible();
  expect(await status(page, raced.id)).toBe('IN_PROGRESS');
});
