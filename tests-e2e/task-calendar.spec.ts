import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uniqueName } from './helpers';

/**
 * Tasks → Calendar: planned tasks on a month grid. Picking a day (or a task)
 * hands over to the ordinary list below; the view choice is remembered; the
 * grid works from the keyboard and passes axe.
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

  // A day: its tasks in the list below, and the cell marked picked.
  await dayButton.click();
  await expect(cell).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#task-row-${a.id}`)).toBeVisible();
  await expect(page.locator(`#task-row-${b.id}`)).toBeVisible();

  // A task: its row opens.
  await page.getByRole('button', { name: 'Show all days' }).click();
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

  // Enter picks the day.
  await page.keyboard.press('Enter');
  await expect(grid.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(1);

  const results = await new AxeBuilder({ page }).include('[aria-label="Task calendar"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('on a phone the grid fits without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCalendar(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
