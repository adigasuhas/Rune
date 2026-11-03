import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uniqueName } from './helpers';

/**
 * Tasks → Calendar: planned tasks on a month grid. Picking a day (or a task)
 * collapses the month to that week with the day's agenda below; the view
 * choice is remembered; the grid works from the keyboard and passes axe.
 */

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
});

async function userClock(page: Page) {
  const tz = ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
  const dateIn = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return { tz, dateIn };
}

async function make(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/tasks', { data });
  expect(res.ok()).toBeTruthy();
  const t = await res.json();
  created.push(t.id);
  return t as { id: string; name: string };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const openCalendar = async (page: Page) => {
  await page.goto('/tasks');
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Calendar' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
};

test('planned tasks show on their day; picking a day or a task opens it in the list', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { dateIn } = await userClock(page);
  // Mid-month next month: always in a full week of that month's grid.
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15, 12));
  const day = dateIn(target);
  const a = await make(page, { name: uniqueName('E2E cal A'), date: day, priority: 'CRITICAL', estimatedTime: 1.5 });
  const b = await make(page, { name: uniqueName('E2E cal B'), date: day, priority: 'LOW', estimatedTime: 0.5, slots: [{ startTime: '09:00', endTime: '09:30' }] });

  await openCalendar(page);
  await page.getByRole('button', { name: 'Next month' }).click();
  const dayButton = page.locator(`[data-day="${day}"]`);
  await expect(dayButton).toHaveAccessibleName(/2 tasks, 2h planned/);
  const cell = page.getByRole('gridcell').filter({ has: dayButton });
  // Timed first, then by priority.
  await expect(cell.locator('li')).toHaveText([new RegExp(`9:00.*${esc(b.name)}`), new RegExp(esc(a.name))]);

  // Calendar view has no To do / In progress / Done lists under it.
  await expect(page.getByRole('tablist', { name: 'Filter by status' })).toHaveCount(0);

  // A day: the month collapses to its week, with the day's agenda below.
  await dayButton.click();
  await expect(cell).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('grid')).toHaveAttribute('aria-label', /^Week of /);
  await expect(page.getByRole('grid').getByRole('row')).toHaveCount(2); // weekday header + the one week
  const agenda = page.getByRole('region', { name: new RegExp(new Date(`${day}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'long', timeZone: 'UTC' })) });
  await expect(agenda.locator(`#task-row-${a.id}`)).toBeVisible();
  await expect(agenda.locator(`#task-row-${b.id}`)).toBeVisible();
  // Timed first, in the margin; then "any time".
  await expect(agenda.locator('li').first()).toContainText(b.name);
  await expect(agenda.locator('li').first().locator('time')).toHaveText(/9:00/);
  await expect(agenda.getByText('any time')).toBeVisible();
  await expect(agenda).toContainText('2h');

  // Next / previous week move the picked day by a week.
  await page.getByRole('button', { name: 'Next week' }).click();
  const weekLater = new Date(`${day}T12:00:00Z`); weekLater.setUTCDate(weekLater.getUTCDate() + 7);
  await expect(page.locator(`[data-day="${weekLater.toISOString().slice(0, 10)}"]`)).toBeVisible();
  await page.getByRole('button', { name: 'Previous week' }).click();

  // Back out to the month, then collapse to the picked day again.
  await page.getByRole('button', { name: 'Show the month' }).click();
  await expect(page.getByRole('grid')).not.toHaveAttribute('aria-label', /^Week of /);
  await expect(agenda).toHaveCount(0);
  await page.getByRole('button', { name: /^Collapse to / }).click();
  await expect(agenda.locator(`#task-row-${a.id}`)).toBeVisible();

  // A task on the month: its day opens with its row expanded.
  await page.getByRole('button', { name: 'Show the month' }).click();
  await cell.locator('li').filter({ hasText: a.name }).locator('button').click(); // mouse shortcut, hidden from the a11y tree
  await expect(page.locator(`#task-row-${a.id}`)).toContainText('effort');

  // Remembered after a reload.
  await page.reload();
  await expect(page.getByRole('grid')).toBeVisible();
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'List' }).click();
  await expect(page.getByRole('grid')).toHaveCount(0);
});

test('the calendar works from the keyboard and passes axe', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openCalendar(page);
  const grid = page.getByRole('grid');
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-day'));

  await grid.locator('[data-day][tabindex="0"]').focus();
  const start = (await focused())!;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const moved = new Date(`${start}T12:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + 8);
  expect(await focused()).toBe(moved.toISOString().slice(0, 10));

  // Page Down goes to the next month and keeps focus in the grid.
  const title = await grid.getAttribute('aria-label');
  await page.keyboard.press('PageDown');
  await expect(grid).not.toHaveAttribute('aria-label', title!);
  expect(await focused()).toBeTruthy();

  // Enter picks the day: the month collapses to its week.
  await page.keyboard.press('Enter');
  await expect(grid.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(1);
  await expect(grid).toHaveAttribute('aria-label', /^Week of /);
  // In the week, the arrows pick as they move.
  const picked = (await grid.locator('[role="gridcell"][aria-selected="true"] [data-day]').getAttribute('data-day'))!;
  await page.keyboard.press('ArrowRight');
  const next = new Date(`${picked}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  await expect(grid.locator('[role="gridcell"][aria-selected="true"] [data-day]')).toHaveAttribute('data-day', next.toISOString().slice(0, 10));

  const results = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('on a phone the grid fits without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCalendar(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
