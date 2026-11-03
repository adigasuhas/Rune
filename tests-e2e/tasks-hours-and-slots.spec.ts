import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uniqueName } from './helpers';

/**
 * Tasks list: the time elapsed beside In progress (and nothing beside To do
 * or Done); a task's time slots always in time order, whichever was added
 * first; an empty time picker starting at the current time; and Analytics /
 * Recent weeks counting only the "When you're available" dates.
 */

const created: string[] = [];
let originalAvailability: { availableFrom: string | null; availableUntil: string | null } | null = null;
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
  if (originalAvailability) await request.post('/api/settings', { data: originalAvailability }).catch(() => {});
});

async function clock(page: Page) {
  const tz = ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
  const date = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const time = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return { tz, date, time };
}

async function make(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/tasks', { data });
  expect(res.ok()).toBeTruthy();
  const t = await res.json();
  created.push(t.id);
  return t as { id: string; name: string; startTime: string | null };
}

test('In progress shows time elapsed beside its heading; To do and Done show only their counts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { date, time } = await clock(page);
  const now = new Date();
  const start = time(new Date(now.getTime() - 60 * 60_000));
  const end = time(new Date(now.getTime() + 60 * 60_000));
  test.skip(start > time(now) || end < time(now), 'the slot would cross midnight');
  const today = date(now);
  await make(page, { name: uniqueName('E2E running'), date: today, status: 'IN_PROGRESS', estimatedTime: 2, slots: [{ startTime: start, endTime: end }] });
  await make(page, { name: uniqueName('E2E finished'), date: today, status: 'COMPLETED', estimatedTime: 1, slots: [{ startTime: '00:00', endTime: '00:30' }] });

  await page.goto('/tasks');
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'List' }).click();
  const section = (name: string) => page.locator('.app-section').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(section('In progress')).toContainText(/\d+h\d{2}m elapsed|\d+m elapsed/);
  await expect(section('In progress')).toContainText(/of \d+(\.\d)?h planned|over/);
  // Done carries only its count.
  await expect(section('Done')).toBeVisible();
  await expect(section('Done')).not.toContainText(/spent|planned|elapsed/);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
});

test('time slots run in time order, even when the morning one was added last', async ({ page }) => {
  const { date } = await clock(page);
  const task = await make(page, {
    name: uniqueName('E2E slots'),
    date: date(new Date()),
    slots: [{ startTime: '14:00', endTime: '15:00' }, { startTime: '09:00', endTime: '10:00' }],
  });
  expect(task.startTime).toBe('09:00');
  const events = ((await (await page.request.get('/api/calendar')).json()) as Array<{ taskId: string; start: string }>).filter((e) => e.taskId === task.id);
  expect(events).toHaveLength(2);
  expect(new Date(events[0].start).getTime()).toBeLessThan(new Date(events[1].start).getTime());

  // Editing it the same way keeps the order too.
  const res = await page.request.put(`/api/tasks/${task.id}`, { data: { slots: [{ startTime: '16:00', endTime: '17:00' }, { startTime: '08:00', endTime: '08:30' }] } });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).startTime).toBe('08:00');
});

test('an empty time starts at the current time when opened', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'New task' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^More options/ }).click();
  await expect(dialog.getByText('Time slots', { exact: true })).toBeVisible();
  const expected = await page.evaluate(() => {
    const f = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/^(\d):/, '0$1:');
    const n = new Date();
    return [f(n), f(new Date(n.getTime() + 60_000))];
  });
  await dialog.getByText('Start', { exact: true }).last().click();
  const shown = await dialog.getByText(/^\d{2}:\d{2} (AM|PM)$/).first().textContent();
  expect(expected).toContain(shown);
});

test('Analytics and Recent weeks count only the available dates', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const s = await (await page.request.get('/api/settings')).json();
  originalAvailability = { availableFrom: s.availableFrom ?? null, availableUntil: s.availableUntil ?? null };
  const { date } = await clock(page);
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 3);
  const from = date(d);
  await page.request.post('/api/settings', { data: { availableFrom: from, availableUntil: null } });

  await page.goto('/analytics');
  await expect(page.getByText('Counting only your available dates:')).toBeVisible({ timeout: 15_000 });
  const graph = page.locator('[role="grid"][aria-label^="Daily working time"]').first();
  await expect(graph).toBeVisible();
  // A day before the window is drawn but holds no time.
  const before = new Date(`${from}T12:00:00Z`);
  before.setUTCDate(before.getUTCDate() - 1);
  const label = before.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  await expect(graph.getByRole('gridcell', { name: `${label}: outside your available dates` })).toHaveCount(1);

  await page.goto('/');
  const recent = page.locator('[role="grid"][aria-label^="Daily working time"]').first();
  await expect(recent).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Counting only your available dates from/)).toBeVisible();
});
