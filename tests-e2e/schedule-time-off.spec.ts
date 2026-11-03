import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uniqueName } from './helpers';

/**
 * Settings -> Schedule and time off, and where it shows: leave and sick
 * allowances counting down as days are marked, availability dates, a
 * stretch of leave marked at once; then the Tasks calendar colouring those
 * days and shading by hours worked, and the hours planned on the week strip.
 */

const created: string[] = [];
let original: Record<string, unknown> | null = null;

test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
  if (original) {
    const { workingDays, leaveAllowance, sickLeaveAllowance, leaveAllowancePer, availableFrom, availableUntil } = original;
    await request.post('/api/settings', { data: { workingDays, leaveAllowance, sickLeaveAllowance, leaveAllowancePer, availableFrom, availableUntil } }).catch(() => {});
  }
});

async function clock(page: Page) {
  const s = await (await page.request.get('/api/settings')).json();
  original ??= s;
  const tz = (s.timezone as string) || 'UTC';
  const dateIn = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return { today: dateIn(new Date()), dateIn };
}

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

test('mark a stretch of leave and a sick day; allowances count down; the Tasks calendar colours them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const { today } = await clock(page);
  // Start clean: no allowances, no dates, nothing marked in the weeks we use.
  const year = today.slice(0, 4);
  // A Monday-to-Sunday week in this year, at least two weeks out where possible.
  let monday = addDays(today, 14);
  while (new Date(`${monday}T12:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, 1);
  if (!monday.startsWith(year)) { monday = `${year}-01-05`; while (new Date(`${monday}T12:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, 1); }
  const sunday = addDays(monday, 6);
  const sickDay = addDays(monday, 7);
  const cleared = ((original!.workingDays as string) || '').split(',').filter((e) => {
    const d = e.split(':')[0];
    return !(d >= monday && d <= sickDay);
  }).join(',');
  await page.request.post('/api/settings', { data: { workingDays: cleared, leaveAllowance: null, sickLeaveAllowance: null, leaveAllowancePer: 'YEAR', availableFrom: null, availableUntil: null } });
  const before = await (await page.request.get('/api/settings')).json();
  const usedBefore = (type: string) => (before.workingDays as string).split(',').filter((e) => e.startsWith(year) && e.split(':')[1] === type).length;

  await page.goto('/settings?section=calendar');
  await expect(page.getByRole('heading', { level: 2, name: 'Schedule and time off' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Schedule and time off' })).toHaveAttribute('aria-current', 'page');

  // Let the page finish loading before typing (a late load must not, and
  // no longer can, overwrite the form - but the test shouldn't depend on it).
  await page.waitForLoadState('networkidle');

  // Allowances and availability save with the page.
  const leaveCard = page.locator('[data-day-kind="leave"]').filter({ has: page.getByLabel('Days allowed') });
  await page.locator('#sched-leave-days').fill('20');
  await page.locator('#sched-sick-days').fill('8');
  await expect(leaveCard).toContainText(`${20 - usedBefore('leave')}days left`);
  await page.locator('#sched-available-from').fill(`${year}-01-01`);
  await page.locator('#sched-available-until').fill(`${year}-12-31`);
  await expect(page.getByText(/Available for \d+ days, \d+ of them working days/)).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(async () => (await (await page.request.get('/api/settings')).json())).toMatchObject({
    leaveAllowance: 20, sickLeaveAllowance: 8, availableFrom: `${year}-01-01`, availableUntil: `${year}-12-31`,
  });

  // A week of leave, weekends left alone.
  const daysPart = page.getByRole('region', { name: 'Working days and time off' });
  await daysPart.getByRole('button', { name: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), / }).first().click();
  const panel = page.getByRole('group', { name: /.+/ }).filter({ has: page.getByLabel('From') });
  await panel.getByLabel('From').fill(monday);
  await panel.getByLabel('To').fill(sunday);
  await expect(panel).toContainText('7 days');
  await panel.getByText('Leave', { exact: true }).click();
  await expect(panel).toContainText('5 without the weekends');
  await panel.getByLabel('Reason (optional)').fill('Family visit');
  await panel.getByRole('button', { name: 'Apply to 5 days' }).click();
  await expect(panel.getByText('Saved: 5 days set to leave.')).toBeVisible();
  await expect(leaveCard).toContainText(`${15 - usedBefore('leave')}days left`);

  // One sick day.
  await panel.getByLabel('From').fill(sickDay);
  await panel.getByLabel('To').fill(sickDay);
  await panel.getByText('Sick leave', { exact: true }).click();
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(panel.getByText('Saved: 1 day set to sick leave.')).toBeVisible();
  const sickCard = page.locator('[data-day-kind="sick"]').filter({ has: page.getByLabel('Days allowed') });
  await expect(sickCard).toContainText(`${7 - usedBefore('sick')}days left`);

  const stored = parseInt(String((await (await page.request.get('/api/settings')).json()).leaveAllowance), 10);
  expect(stored).toBe(20);
  const wd = (await (await page.request.get('/api/settings')).json()).workingDays as string;
  expect(wd).toContain(`${monday}:leave:Family visit`);
  expect(wd).toContain(`${sickDay}:sick`);
  expect(wd).not.toContain(`${addDays(monday, 5)}:leave`); // Saturday untouched

  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);

  // The Tasks calendar shows them in colour, with words.
  await page.goto('/tasks');
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Calendar' }).click();
  const month = monday.slice(0, 7);
  for (let i = 0; i < 14 && !(await page.locator(`[data-day="${monday}"]`).count()); i++) {
    await page.getByRole('button', { name: month > today.slice(0, 7) ? 'Next month' : 'Previous month' }).click();
  }
  const cellOf = (key: string) => page.getByRole('gridcell').filter({ has: page.locator(`[data-day="${key}"]`) });
  await expect(cellOf(monday)).toHaveAttribute('data-day-kind', 'leave');
  await expect(cellOf(monday)).toContainText('Leave');
  await expect(page.locator(`[data-day="${monday}"]`)).toHaveAccessibleName(/Leave \(Family visit\)/);
  await expect(cellOf(addDays(monday, 5))).toHaveAttribute('data-day-kind', 'weeklyOff');
  if (sickDay.slice(0, 7) === month) await expect(cellOf(sickDay)).toHaveAttribute('data-day-kind', 'sick');
});

test('the Tasks calendar deepens with hours worked; hours planned show on the week strip', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const { today } = await clock(page);
  // Yesterday: 4h worked (a finished task with its slot), so it's shaded.
  const yesterday = addDays(today, -1);
  const done = await (await page.request.post('/api/tasks', { data: { name: uniqueName('E2E worked'), date: yesterday, status: 'COMPLETED', estimatedTime: 4, slots: [{ startTime: '09:00', endTime: '13:00' }] } })).json();
  created.push(done.id);
  const todo = await (await page.request.post('/api/tasks', { data: { name: uniqueName('E2E planned'), date: today, estimatedTime: 2.5 } })).json();
  created.push(todo.id);

  await page.goto('/tasks');
  // List view: the week strip says how much is planned each day; the To do
  // heading itself carries only its count.
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'List' }).click();
  const todoHeading = page.locator('.app-section').filter({ has: page.getByRole('heading', { name: 'To do' }) });
  await expect(todoHeading).toBeVisible();
  await expect(todoHeading).not.toContainText(/planned/);
  await expect(page.getByRole('button', { name: /planned$/ }).first()).toBeVisible();

  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Calendar' }).click();
  if (yesterday.slice(0, 7) !== today.slice(0, 7)) await page.getByRole('button', { name: 'Previous month' }).click();
  const cell = page.getByRole('gridcell').filter({ has: page.locator(`[data-day="${yesterday}"]`) });
  await expect(cell).toHaveAttribute('data-level', /[1-4]/);
  await expect(cell).toContainText(/\d+(\.\d)?h worked/);
  await expect(page.locator(`[data-day="${yesterday}"]`)).toHaveAccessibleName(/\d+(\.\d)?h worked/);
  // The legend explains the colours and the shading.
  await expect(page.getByText('Hours worked', { exact: true })).toBeVisible();
  await expect(page.getByText('Sick leave', { exact: true }).first()).toBeVisible();
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
});
