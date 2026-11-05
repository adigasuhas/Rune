import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Today's planner: an event ending at 7:00 and one starting at 7:00 are
 * drawn with a clear gap between them, and a short event is never hidden
 * under the one that follows it.
 */

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
});

async function today(page: Page) {
  const tz = ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

test('back-to-back events are separated, and short ones sit beside the next', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const day = await today(page);
  const names = {
    first: uniqueName('E2E gap first'),
    second: uniqueName('E2E gap second'),
    short: uniqueName('E2E gap short'),
    after: uniqueName('E2E gap after'),
  };
  const slots: Record<keyof typeof names, [string, string]> = {
    first: ['06:00', '07:00'],
    second: ['07:00', '07:30'],
    short: ['07:30', '07:40'],
    after: ['07:40', '08:10'],
  };
  for (const key of Object.keys(names) as (keyof typeof names)[]) {
    const res = await page.request.post('/api/tasks', { data: { name: names[key], date: day, estimatedTime: 1, slots: [{ startTime: slots[key][0], endTime: slots[key][1] }] } });
    expect(res.ok()).toBeTruthy();
    created.push((await res.json()).id);
  }

  await page.goto('/');
  const block = (name: string) => page.locator('div.absolute.rounded-lg', { has: page.getByRole('heading', { name, exact: true }) });
  await expect(block(names.first)).toBeVisible({ timeout: 15_000 });
  await block(names.first).scrollIntoViewIfNeeded();

  const box = async (name: string) => (await block(name).boundingBox())!;
  const [first, second, short, after] = await Promise.all([box(names.first), box(names.second), box(names.short), box(names.after)]);

  // Meeting at 7:00: stacked, full width, with a visible gap.
  expect(second.y - (first.y + first.height)).toBeGreaterThanOrEqual(5);
  expect(Math.abs(second.width - first.width)).toBeLessThan(1);
  expect(short.y - (second.y + second.height)).toBeGreaterThanOrEqual(5);

  // The 10-minute block can't fit above the next one, so they share the row.
  const intersect = (a: typeof short, b: typeof short) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(intersect(short, after)).toBe(false);
  expect(short.width).toBeLessThan(first.width * 0.6);
});
