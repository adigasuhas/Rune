import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Regressions:
 *  - the Tasks page's status-tab counts counted every task the account had,
 *    so scheduling something for tomorrow raised today's "To do";
 *  - Today's "Recent weeks" day details floated outside their column (a
 *    clamp that inverted when the grid was narrower than the card) and were
 *    clipped behind the planner.
 */

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
});

const tabCount = async (page: Page, label: string) =>
  Number((await page.getByRole('tab', { name: new RegExp(`^${label}\\s*\\d+$`) }).innerText()).replace(/\D+/g, ''));

test('a task scheduled for tomorrow does not change today\'s counts', async ({ page }) => {
  await page.goto('/tasks');
  await expect(page.getByRole('tab', { name: /^All\s*\d+$/ })).toBeVisible();
  const before = { all: await tabCount(page, 'All'), todo: await tabCount(page, 'To do') };

  // Tomorrow in the *account's* timezone - the page's "today" - which needn't match the browser's.
  const tz = ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
  const todayInTz = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const t = new Date(`${todayInTz}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  const tomorrow = t.toISOString().slice(0, 10);
  const res = await page.request.post('/api/tasks', { data: { name: uniqueName('E2E tomorrow task'), date: tomorrow, priority: 'MEDIUM' } });
  expect(res.ok()).toBeTruthy();
  created.push((await res.json()).id);

  await page.reload();
  await expect(page.getByRole('tab', { name: /^All\s*\d+$/ })).toBeVisible();
  expect(await tabCount(page, 'All')).toBe(before.all);
  expect(await tabCount(page, 'To do')).toBe(before.todo);

  // ...and it is counted on tomorrow.
  const label = await page.evaluate((ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), tomorrow);
  await page.getByTitle(label, { exact: true }).click();
  await expect(page.getByText('E2E tomorrow task').first()).toBeVisible();
  expect(await tabCount(page, 'All')).toBeGreaterThanOrEqual(1);
});

test('Recent weeks shows the chosen day inside its own panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const grid = page.locator('[role="grid"][aria-label^="Daily working time"]').first();
  await expect(grid).toBeVisible({ timeout: 15_000 });
  await grid.scrollIntoViewIfNeeded();
  const panel = grid.locator('xpath=ancestor::div[.//h2 or .//h3][1]');
  const pb = (await panel.boundingBox())!;
  const status = panel.getByRole('status');
  await expect(status).toContainText(/tap a day/);

  const cells = grid.getByRole('gridcell');
  const n = await cells.count();
  for (const i of [0, Math.floor(n / 2), n - 1]) {
    await cells.nth(i).click();
    await page.mouse.move(0, 0); // the clicked day stays shown once the pointer leaves
    await expect(status).toContainText(/(focused work|No recorded work)/);
    const sb = (await status.boundingBox())!;
    expect(sb.x).toBeGreaterThanOrEqual(pb.x - 1);
    expect(sb.x + sb.width).toBeLessThanOrEqual(pb.x + pb.width + 1);
  }
});
