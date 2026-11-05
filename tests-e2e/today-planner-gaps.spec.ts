import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Today's planner: an event ending at 7:00 and one starting at 7:00 are
 * drawn with a clear gap between them, every block lines up (same left edge,
 * width and text indent, top on its start-time line), and an event too short
 * to hold a line of text is never hidden under the one that follows it.
 */

const created: string[] = [];
let projectId: string | undefined;
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
  if (projectId) await request.delete(`/api/projects/${projectId}`).catch(() => {});
});

async function today(page: Page) {
  const tz = ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

test('back-to-back events are separated and line up', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const day = await today(page);
  projectId = (await (await page.request.post('/api/projects', { data: { name: uniqueName('E2E gap project') } })).json()).id;
  const plan = {
    first: ['06:00', '07:00', true],
    second: ['07:00', '07:30', false],
    quarter: ['07:30', '07:45', false],
    next: ['07:45', '08:15', true],
    tiny: ['08:15', '08:25', false],
    after: ['08:25', '09:00', false],
  } as const;
  const names = Object.fromEntries(Object.keys(plan).map((k) => [k, uniqueName(`E2E gap ${k}`)])) as Record<keyof typeof plan, string>;
  for (const key of Object.keys(plan) as (keyof typeof plan)[]) {
    const [startTime, endTime, inProject] = plan[key];
    const res = await page.request.post('/api/tasks', {
      data: { name: names[key], date: day, estimatedTime: 1, ...(inProject ? { projectId } : {}), slots: [{ startTime, endTime }] },
    });
    expect(res.ok()).toBeTruthy();
    created.push((await res.json()).id);
  }

  await page.goto('/');
  const block = (name: string) => page.locator('[data-event-block]', { has: page.getByRole('heading', { name, exact: true }) });
  await expect(block(names.first)).toBeVisible({ timeout: 15_000 });
  await block(names.first).scrollIntoViewIfNeeded();

  const box = async (name: string) => (await block(name).boundingBox())!;
  const textX = async (name: string) => (await block(name).locator('span.tabular-nums').first().boundingBox())!.x;
  const b = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([k, n]) => [k, await box(n)]))) as Record<keyof typeof plan, { x: number; y: number; width: number; height: number }>;

  // Meeting at 7:00: a visible gap between each pair.
  expect(b.second.y - (b.first.y + b.first.height)).toBeGreaterThanOrEqual(3);
  expect(b.quarter.y - (b.second.y + b.second.height)).toBeGreaterThanOrEqual(3);
  expect(b.next.y - (b.quarter.y + b.quarter.height)).toBeGreaterThanOrEqual(3);

  // Blocks that don't clash share one left edge and width, including the
  // 15-minute one, and their text starts at the same indent with or
  // without a project stripe.
  for (const k of ['second', 'quarter', 'next'] as const) {
    expect(Math.abs(b[k].x - b.first.x)).toBeLessThan(1);
    expect(Math.abs(b[k].width - b.first.width)).toBeLessThan(1);
  }
  const indents = await Promise.all([names.first, names.second, names.quarter, names.next].map(textX));
  for (const x of indents) expect(Math.abs(x - indents[0])).toBeLessThan(1);

  // Each block's top sits on its start-time line: 30 minutes is half an hour apart.
  const hour = b.second.y - b.first.y;
  expect(Math.abs(b.quarter.y - b.second.y - hour / 2)).toBeLessThan(1);
  expect(Math.abs(b.next.y - b.quarter.y - hour / 4)).toBeLessThan(1);

  // The 10-minute block can't fit a line above the next one, so they share the row.
  const intersect = (p: typeof b.tiny, q: typeof b.tiny) =>
    p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
  expect(intersect(b.tiny, b.after)).toBe(false);
  expect(b.tiny.width).toBeLessThan(b.first.width * 0.6);
});
