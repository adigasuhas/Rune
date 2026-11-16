import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';
import { nextWorkingDay, parseDayEntries } from '../src/lib/timeOff';

/**
 * Regression: Duplicate posted the original's stored date (local midnight as
 * a UTC timestamp), which the server cut to its UTC date - so in any zone
 * east of UTC the copy landed on the PREVIOUS day. Duplicate now confirms the
 * copy's date with the Move dialog (starting on the next working day), and
 * the server reads timestamps in the account's zone.
 *
 * Runs with the account in Asia/Kolkata (UTC+5:30), where the old bug showed,
 * and puts the original zone back afterwards.
 */

const created: string[] = [];
let originalTz = 'UTC';

test.beforeAll(async ({ request }) => {
  originalTz = ((await (await request.get('/api/settings')).json()).timezone as string) || 'UTC';
  await request.post('/api/settings', { data: { timezone: 'Asia/Kolkata' } });
});
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
  await request.post('/api/settings', { data: { timezone: originalTz } });
});

const IST = 'Asia/Kolkata';
const dayIn = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const shift = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** What the dialog should open on: the next working day after today or the original's day, whichever is later. */
async function expectedDefault(page: Page, origDay: string) {
  const s = await (await page.request.get('/api/settings')).json();
  const today = dayIn(new Date().toISOString());
  return nextWorkingDay(origDay > today ? origDay : today, parseDayEntries(s.workingDays), { from: s.availableFrom ?? null, until: s.availableUntil ?? null });
}

async function allTasks(page: Page) {
  return (await (await page.request.get('/api/tasks')).json()) as Array<{ id: string; name: string; date: string; status: string; postponeHistory?: string }>;
}

async function selectDay(page: Page, ymd: string) {
  const label = await page.evaluate((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), ymd);
  await expect(page.getByRole('tab', { name: /^All\s*\d+$/ })).toBeVisible();
  const target = page.getByTitle(label, { exact: true });
  for (let i = 0; i < 6 && !(await target.isVisible()); i++) {
    const today = dayIn(new Date().toISOString());
    await page.getByRole('button', { name: ymd < today ? /previous/i : /next/i }).first().click();
  }
  await target.click();
  await expect(page.getByRole('tab', { name: /^All\s*\d+$/ })).toBeVisible();
}

async function duplicateVia(page: Page, taskId: string) {
  const row = page.locator(`#task-row-${taskId}`);
  await row.hover();
  await row.getByRole('button', { name: 'Duplicate task' }).click();
  await expect(page.getByRole('heading', { name: 'Duplicate task' })).toBeVisible();
}

for (const [label, offset] of [['today', 0], ['a future date', 2], ['a past date', -2]] as const) {
  test(`copying a task planned for ${label} opens on the next working day and lands exactly where chosen`, async ({ page }) => {
    const today = dayIn(new Date().toISOString());
    const origDay = shift(today, offset);
    const target = shift(origDay, 1); // never the original's day
    const name = uniqueName(`E2E dup ${label}`);
    const res = await page.request.post('/api/tasks', { data: { name, date: origDay, priority: 'HIGH', estimatedTime: 2, detail: 'details' } });
    const orig = await res.json();
    created.push(orig.id);
    const before = (await allTasks(page)).find((t) => t.id === orig.id)!;

    await page.goto('/tasks');
    await selectDay(page, origDay);
    await duplicateVia(page, orig.id);

    // Opens on the next working day; any other day can be picked.
    await expect(page.getByLabel('Date for the copy')).toHaveValue(await expectedDefault(page, origDay));
    await expect(page.getByRole('button', { name: 'Create copy' })).toBeEnabled();

    await page.getByLabel('Date for the copy').fill(target);
    await page.getByRole('button', { name: 'Create copy' }).click();
    await expect(page.getByText('Task copied')).toBeVisible();

    const after = await allTasks(page);
    const copies = after.filter((t) => t.name === `${name} (Copy)`);
    expect(copies).toHaveLength(1);
    created.push(copies[0].id);
    expect(dayIn(copies[0].date)).toBe(target);
    expect(copies[0].status).toBe('PENDING');
    expect(copies[0].postponeHistory || '[]').toBe('[]');

    // The original is untouched.
    expect(after.find((t) => t.id === orig.id)).toEqual(before);

    // And the list shows the copy on that exact day.
    await selectDay(page, target);
    await expect(page.locator(`#task-row-${copies[0].id}`)).toBeVisible();
  });
}

test('cancelling the date prompt creates nothing', async ({ page }) => {
  const today = dayIn(new Date().toISOString());
  const name = uniqueName('E2E dup cancel');
  const orig = await (await page.request.post('/api/tasks', { data: { name, date: today } })).json();
  created.push(orig.id);
  const countBefore = (await allTasks(page)).length;

  await page.goto('/tasks');
  await selectDay(page, today);
  await duplicateVia(page, orig.id);
  await page.getByLabel('Date for the copy').fill(shift(today, 3));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Duplicate task' })).toHaveCount(0);

  // Re-opening starts on the default again (nothing carried over), and Move still works as before.
  await duplicateVia(page, orig.id);
  await expect(page.getByLabel('Date for the copy')).toHaveValue(await expectedDefault(page, today));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  const after = await allTasks(page);
  expect(after.length).toBe(countBefore);
  expect(after.some((t) => t.name === `${name} (Copy)`)).toBe(false);

  const row = page.locator(`#task-row-${orig.id}`);
  await row.hover();
  await row.getByRole('button', { name: 'Move task' }).click();
  await expect(page.getByRole('heading', { name: 'Move task' })).toBeVisible();
  await expect(page.getByLabel('New date')).toHaveValue(today);
  await expect(page.getByLabel('Reason (optional)')).toBeVisible();
});

test('a copy keeps the objective, session type and contexts, and has no scheduled time', async ({ page }) => {
  const today = dayIn(new Date().toISOString());
  const goals = JSON.stringify([{ id: 'g-e2e-1', text: 'Draft the methods', completed: false }]);
  const project = await (await page.request.post('/api/projects', { data: { name: uniqueName('E2E dup project'), goals } })).json();
  const name = uniqueName('E2E dup details');
  const orig = await (await page.request.post('/api/tasks', {
    data: { name, date: today, projectId: project.id, linkedGoalId: 'g-e2e-1', sessionType: 'DEEP_WORK', context: 'READING,WRITING', estimatedTime: 2, slots: [{ startTime: '09:00', endTime: '11:00' }] },
  })).json();
  created.push(orig.id);

  await page.goto('/tasks');
  await selectDay(page, today);
  await duplicateVia(page, orig.id);
  const day = await expectedDefault(page, today);
  await expect(page.getByLabel('Date for the copy')).toHaveValue(day);
  await page.getByRole('button', { name: 'Create copy' }).click();
  await expect(page.getByText('Task copied')).toBeVisible();

  const copy = (await (await page.request.get('/api/tasks')).json()).find((t: { name: string }) => t.name === `${name} (Copy)`);
  expect(copy).toBeTruthy();
  created.push(copy.id);
  expect(dayIn(copy.date)).toBe(day);
  expect(copy).toMatchObject({ projectId: project.id, linkedGoalId: 'g-e2e-1', sessionType: 'DEEP_WORK', estimatedTime: 2, startTime: null, endTime: null });
  expect(String(copy.context).split(',').sort()).toEqual(['READING', 'WRITING']);
  const slots = (await (await page.request.get('/api/calendar')).json()).filter((e: { taskId?: string }) => e.taskId === copy.id);
  expect(slots).toHaveLength(0);
  await page.request.delete(`/api/projects/${project.id}`);
});
