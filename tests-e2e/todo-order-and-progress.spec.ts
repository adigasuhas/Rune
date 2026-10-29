import { test, expect, Page, devices } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * To do: drag (or Arrow keys on the handle) to arrange tasks; the order is
 * saved and survives a reload, and never touches priority/status/date.
 * In progress: elapsed-time label + a thin strip against the estimate.
 */

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
});

async function clock(page: Page) {
  const tz = ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
  const fmt = (d: Date) => ({
    date: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
    time: new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d),
  });
  return fmt;
}

async function make(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/tasks', { data });
  expect(res.ok()).toBeTruthy();
  const t = await res.json();
  created.push(t.id);
  return t as { id: string; name: string };
}

/** Our tasks' order in the To do section, as rendered. */
async function todoOrder(page: Page, ours: string[]) {
  const all = await page.locator('[data-reorder-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-reorder-id')));
  return all.filter((id) => ours.includes(id!));
}

test('To do can be arranged by dragging or with the keyboard, and the order sticks', async ({ page }) => {
  const fmt = await clock(page);
  const today = fmt(new Date()).date;
  const a = await make(page, { name: uniqueName('E2E order A'), date: today, priority: 'LOW' });
  const b = await make(page, { name: uniqueName('E2E order B'), date: today, priority: 'HIGH' });
  const c = await make(page, { name: uniqueName('E2E order C'), date: today, priority: 'CRITICAL' });
  const ours = [a.id, b.id, c.id];
  const before = await (await page.request.get('/api/tasks')).json();
  // Sorted by id: /api/tasks has no ORDER BY, and the reorder's UPDATEs can
  // change the order Postgres happens to return rows in.
  const snapshot = (list: Array<Record<string, unknown>>) =>
    list
      .filter((t) => ours.includes(t.id as string))
      .map(({ id, priority, status, date, name }) => ({ id, priority, status, date, name }))
      .sort((x, y) => String(x.id).localeCompare(String(y.id)));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tasks');
  await expect(page.locator(`[data-reorder-id="${a.id}"]`)).toBeVisible();
  // Oldest first until arranged - not by priority.
  expect(await todoOrder(page, ours)).toEqual([a.id, b.id, c.id]);

  // Drag C by its handle above A.
  const rowC = page.locator(`[data-reorder-id="${c.id}"]`);
  const rowA = page.locator(`[data-reorder-id="${a.id}"]`);
  await rowC.hover();
  const handle = rowC.getByRole('button', { name: /^Reorder / });
  await expect(handle).toBeVisible();
  const hb = (await handle.boundingBox())!;
  const ab = (await rowA.boundingBox())!;
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/tasks/reorder') && r.request().method() === 'POST');
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  for (let y = hb.y + hb.height / 2; y >= ab.y + 4; y -= 6) await page.mouse.move(hb.x + hb.width / 2, y);
  await page.mouse.move(hb.x + hb.width / 2, ab.y + 2);
  await page.mouse.up();
  expect((await saved).ok()).toBeTruthy();
  expect(await todoOrder(page, ours)).toEqual([c.id, a.id, b.id]);

  // Keyboard: B up one.
  const savedKey = page.waitForResponse((r) => r.url().endsWith('/api/tasks/reorder'));
  await page.locator(`[data-reorder-id="${b.id}"]`).getByRole('button', { name: /^Reorder / }).focus();
  await page.keyboard.press('ArrowUp');
  await savedKey;
  expect(await todoOrder(page, ours)).toEqual([c.id, b.id, a.id]);

  // Survives a reload.
  await page.reload();
  await expect(page.locator(`[data-reorder-id="${a.id}"]`)).toBeVisible();
  expect(await todoOrder(page, ours)).toEqual([c.id, b.id, a.id]);

  // Nothing else changed: priority, status, date, name.
  const after = await (await page.request.get('/api/tasks')).json();
  expect(snapshot(after)).toEqual(snapshot(before));
});

test('in-progress tasks show elapsed time; a strip only when there is an estimate', async ({ page }) => {
  const fmt = await clock(page);
  const now = Date.now();
  const start = fmt(new Date(now - 30 * 60_000));
  const end = fmt(new Date(now + 60 * 60_000));
  const today = fmt(new Date(now)).date;
  test.skip(start.date !== today || end.date !== today, 'too close to midnight');

  const withEst = await make(page, { name: uniqueName('E2E running est'), date: today, estimatedTime: 1, slots: [{ startTime: start.time, endTime: end.time }] });
  const noEst = await make(page, { name: uniqueName('E2E running noest'), date: today, estimatedTime: 0, slots: [{ startTime: start.time, endTime: end.time }] });
  const noSlot = await make(page, { name: uniqueName('E2E running noslot'), date: today, estimatedTime: 1 });
  for (const t of [withEst, noEst, noSlot]) {
    expect((await page.request.put(`/api/tasks/${t.id}`, { data: { status: 'IN_PROGRESS' } })).ok()).toBeTruthy();
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tasks');
  const row = (id: string) => page.locator(`#task-row-${id}`);
  await expect(row(withEst.id)).toContainText(/(29|30|31)m elapsed of 1h/);
  const bar = row(withEst.id).getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuemax', '60');
  expect(Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(29);

  await expect(row(noEst.id)).toContainText(/(29|30|31)m elapsed/);
  await expect(row(noEst.id)).not.toContainText(' of ');
  await expect(row(noEst.id).getByRole('progressbar')).toHaveCount(0);

  await expect(row(noSlot.id)).toContainText('In progress');
  await expect(row(noSlot.id)).not.toContainText('elapsed');
  await expect(row(noSlot.id).getByRole('progressbar')).toHaveCount(0);

  // Same after a reload; and it's on Today's Up next too.
  await page.reload();
  await expect(row(withEst.id)).toContainText(/(29|30|31)m elapsed of 1h/);
  await page.goto('/');
  const card = page.locator('div[draggable="true"]').filter({ hasText: withEst.name });
  await expect(card).toContainText(/(29|30|31)m elapsed of 1h/);
  await expect(card.getByRole('progressbar')).toHaveCount(1);
});

test('on a phone the handle is visible without hover and is a touch drag target', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], storageState: './tests-e2e/.auth-state.json' });
  const page = await ctx.newPage();
  const fmt = await clock(page);
  const t = await make(page, { name: uniqueName('E2E phone'), date: fmt(new Date()).date });
  await page.goto('/tasks');
  const handle = page.locator(`[data-reorder-id="${t.id}"]`).getByRole('button', { name: /^Reorder / });
  await expect(handle).toBeVisible();
  expect(Number(await handle.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.3);
  expect(await handle.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
  // No sideways scroll from the gutter handle.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await ctx.close();
});
