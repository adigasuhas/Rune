import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * A To do task's slot begins -> the task moves to In progress on its own,
 * once per slot, with a "Task started" notice offering Undo. Runs in the
 * open app (no background delivery).
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
const toastFor = (page: Page, name: string) => page.getByRole('alertdialog', { name: 'Task started' }).filter({ hasText: name });
const remindersFor = async (page: Page, id: string) =>
  ((await (await page.request.get('/api/notifications?all=true')).json()) as Array<{ dedupeKey?: string; dismissedAt?: string | null }>)
    .filter((n) => n.dedupeKey?.startsWith(`task-start:${id}:`));

test('at its scheduled start a To do task moves to In progress, and Undo keeps it in To do', async ({ page }) => {
  test.setTimeout(150_000);
  const now = new Date();
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + (now.getSeconds() > 45 ? 2 : 1));
  const name = uniqueName('E2E start on time');
  const t = await make(page, name, start, new Date(start.getTime() + 30 * 60_000));

  await page.goto('/');
  await expect(toastFor(page, name)).toHaveCount(0); // not before its time
  expect(await status(page, t.id)).toBe('PENDING');
  await expect(toastFor(page, name)).toBeVisible({ timeout: 130_000 });
  const shownAt = Date.now();
  expect(shownAt).toBeGreaterThanOrEqual(start.getTime());
  expect(shownAt - start.getTime()).toBeLessThan(5_000); // at the start, not up to a minute late
  await expect(toastFor(page, name)).toContainText('is scheduled now');
  expect(await status(page, t.id)).toBe('IN_PROGRESS');
  // Up next reflects it without a reload.
  await expect(page.locator('div[draggable="true"]').filter({ hasText: name })).toContainText(/elapsed|In progress/);

  // Undo: back to To do, and it stays there for this slot.
  await toastFor(page, name).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Back in To do')).toBeVisible();
  expect(await status(page, t.id)).toBe('PENDING');
  expect((await remindersFor(page, t.id)).every((n) => n.dismissedAt)).toBe(true);
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(toastFor(page, name)).toHaveCount(0);
  expect(await status(page, t.id)).toBe('PENDING');
});

test('opened part-way through a slot, the task is started then, with one notice across reloads', async ({ page }) => {
  const name = uniqueName('E2E start missed');
  const t = await make(page, name, new Date(Date.now() - 10 * 60_000), new Date(Date.now() + 40 * 60_000));
  await page.goto('/');
  await expect(toastFor(page, name)).toBeVisible({ timeout: 15_000 });
  await expect(toastFor(page, name)).toContainText('was scheduled for');
  expect(await status(page, t.id)).toBe('IN_PROGRESS');
  await toastFor(page, name).getByRole('button', { name: 'Got it' }).click();
  await expect(toastFor(page, name)).toHaveCount(0);
  expect(await status(page, t.id)).toBe('IN_PROGRESS');

  for (let i = 0; i < 2; i++) {
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(toastFor(page, name)).toHaveCount(0);
  }
  const all = await remindersFor(page, t.id);
  expect(all).toHaveLength(1);
  expect(all[0].dismissedAt).toBeTruthy();
});

test('started, done, rescheduled or finished slots are left alone; several at once each start', async ({ page }) => {
  const from = new Date(Date.now() - 5 * 60_000), to = new Date(Date.now() + 30 * 60_000);
  const started = await make(page, uniqueName('E2E start already'), from, to);
  const done = await make(page, uniqueName('E2E start done'), from, to);
  const moved = await make(page, uniqueName('E2E start moved'), from, to);
  const over = await make(page, uniqueName('E2E start over'), new Date(Date.now() - 90 * 60_000), new Date(Date.now() - 30 * 60_000));
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
  expect(await status(page, x.id)).toBe('IN_PROGRESS');
  expect(await status(page, y.id)).toBe('IN_PROGRESS');
  for (const t of [started, done, moved, over]) await expect(toastFor(page, t.name)).toHaveCount(0);
  expect(await status(page, done.id)).toBe('COMPLETED');
  expect(await status(page, moved.id)).toBe('PENDING');
  expect(await status(page, over.id)).toBe('PENDING');
  for (const t of [started, done, moved, over]) expect(await remindersFor(page, t.id)).toHaveLength(0);

  // Both are also in the bell, each with its own Undo.
  await page.getByRole('button', { name: /notifications/i }).first().click();
  for (const t of [x, y]) {
    const item = page.locator('div').filter({ hasText: t.name }).filter({ has: page.getByRole('button', { name: 'Undo' }) }).last();
    await expect(item).toBeVisible();
  }
});

test('a slot starts its task only once, and Undo re-checks the task first', async ({ page }) => {
  const t = await make(page, uniqueName('E2E start once'), new Date(Date.now() - 3 * 60_000), new Date(Date.now() + 30 * 60_000));
  // Two tabs looking at the same moment: only one of them starts it.
  const [a, b] = await Promise.all([page.request.post('/api/tasks/auto-start'), page.request.post('/api/tasks/auto-start')]);
  const startedIds = [...(await a.json()).started, ...(await b.json()).started].map((s: { taskId: string }) => s.taskId).filter((id: string) => id === t.id);
  expect(startedIds).toHaveLength(1);
  expect(await status(page, t.id)).toBe('IN_PROGRESS');

  // Finished elsewhere before Undo is clicked: Undo leaves it alone.
  await page.request.put(`/api/tasks/${t.id}`, { data: { status: 'COMPLETED' } });
  await page.goto('/');
  await page.getByRole('button', { name: /notifications/i }).first().click();
  const item = page.locator('div').filter({ hasText: t.name }).filter({ has: page.getByRole('button', { name: 'Undo' }) }).last();
  await item.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Nothing to undo')).toBeVisible();
  expect(await status(page, t.id)).toBe('COMPLETED');
});
