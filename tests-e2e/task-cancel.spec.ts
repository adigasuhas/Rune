import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uniqueName } from './helpers';

/**
 * Cancelling a task, like postponing one, asks why - but here the reason is
 * required. A cancelled task leaves To do (and every plan), its unfinished
 * slots leave the planner, and it waits under Tasks -> Cancelled with its
 * reason until restored. Also: planned time grows to match the slots.
 */

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/tasks/${id}`).catch(() => {});
});

async function today(page: Page) {
  const tz = ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function make(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/tasks', { data });
  expect(res.ok()).toBeTruthy();
  const t = await res.json();
  created.push(t.id);
  return t as { id: string; name: string; estimatedTime: number };
}

test('cancel a task with a reason, find it under Cancelled, and restore it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const day = await today(page);
  const task = await make(page, { name: uniqueName('E2E cancel'), date: day, estimatedTime: 1, slots: [{ startTime: '23:00', endTime: '23:30' }] });

  await page.goto('/tasks');
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'List' }).click();
  const row = page.locator(`#task-row-${task.id}`);
  await row.hover();
  await row.getByRole('button', { name: 'Cancel task' }).click();

  const dialog = page.getByRole('dialog', { name: 'Cancel this task?' });
  await expect(dialog).toContainText(task.name);
  await expect(dialog).toContainText('unfinished time slot leaves your planner');
  // No reason, no cancel.
  await dialog.getByRole('button', { name: 'Cancel task' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Add a reason, or pick one above.');
  // A suggestion fills the box; it can be added to.
  await dialog.getByRole('button', { name: 'Plans changed' }).click();
  await expect(dialog.getByRole('button', { name: 'Plans changed' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByLabel('Reason', { exact: true })).toHaveValue('Plans changed');
  await dialog.getByLabel('Reason', { exact: true }).fill('Plans changed: the beamtime moved to next month');
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancel task' }).click();
  await expect(dialog).toHaveCount(0);

  // Out of the plan: off the list, its open slot gone.
  await expect(row).toHaveCount(0);
  const stored = await (await page.request.get(`/api/tasks/${task.id}`)).json();
  expect(stored).toMatchObject({ status: 'CANCELLED', cancelReason: 'Plans changed: the beamtime moved to next month' });
  const events = ((await (await page.request.get('/api/calendar')).json()) as Array<{ taskId: string }>).filter((e) => e.taskId === task.id);
  expect(events).toHaveLength(0);

  // Under Cancelled, with the reason.
  const tab = page.getByRole('tab', { name: /^Cancelled/ });
  await expect(tab).toContainText(/[1-9]/);
  await tab.click();
  await expect(row).toBeVisible();
  await expect(row).toContainText('the beamtime moved to next month');

  // Restore: back to To do, reason gone.
  await row.hover();
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get(`/api/tasks/${task.id}`)).json())).toMatchObject({ status: 'PENDING', cancelReason: null });
  await page.getByRole('tab', { name: /^All/ }).click();
  await expect(row).toBeVisible();
});

test('a cancelled task needs a reason over the API too, and leaves Today', async ({ page }) => {
  const day = await today(page);
  const task = await make(page, { name: uniqueName('E2E cancel api'), date: day });
  expect((await page.request.put(`/api/tasks/${task.id}`, { data: { status: 'CANCELLED' } })).status()).toBe(400);
  expect((await page.request.put(`/api/tasks/${task.id}`, { data: { status: 'CANCELLED', cancelReason: 'No longer needed' } })).ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Up next/ }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(task.name)).toHaveCount(0);
});

test('planned time grows when the time slots add up to more', async ({ page }) => {
  const day = await today(page);
  const task = await make(page, { name: uniqueName('E2E planned'), date: day, estimatedTime: 2, slots: [{ startTime: '09:00', endTime: '11:00' }] });
  expect(task.estimatedTime).toBe(2);
  const longer = await (await page.request.put(`/api/tasks/${task.id}`, { data: { slots: [{ startTime: '09:00', endTime: '11:00' }, { startTime: '15:00', endTime: '15:30' }] } })).json();
  expect(longer.estimatedTime).toBe(2.5);
  // Shorter slots never shrink the estimate (it can cover work beyond them).
  const shorter = await (await page.request.put(`/api/tasks/${task.id}`, { data: { slots: [{ startTime: '09:00', endTime: '10:00' }] } })).json();
  expect(shorter.estimatedTime).toBe(2.5);
  // No estimate (0) stays no estimate.
  const none = await make(page, { name: uniqueName('E2E no estimate'), date: day, estimatedTime: 0, slots: [{ startTime: '09:00', endTime: '10:00' }] });
  expect((await (await page.request.get(`/api/tasks/${none.id}`)).json()).estimatedTime).toBe(0);
});
