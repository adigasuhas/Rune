import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uniqueName } from './helpers';

/**
 * A task can have several contexts: standard ones toggled on and off, and
 * the writer's own typed in place. They save, reopen ticked, and show in
 * the task's details.
 */

const createdNames: string[] = [];
test.afterAll(async ({ request }) => {
  const tasks = (await (await request.get('/api/tasks')).json()) as Array<{ id: string; name: string }>;
  for (const t of tasks.filter((t) => createdNames.includes(t.name))) await request.delete(`/api/tasks/${t.id}`).catch(() => {});
});

test('pick several contexts, add your own, and edit them later', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const name = uniqueName('E2E contexts');
  createdNames.push(name);

  await page.goto('/tasks');
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'List' }).click();
  await page.getByRole('button', { name: 'New task' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Task name').fill(name);
  await dialog.getByRole('button', { name: /^More options/ }).click();

  const contexts = dialog.getByRole('group', { name: 'Context' });
  await expect(contexts.getByRole('button', { name: 'Computer', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await contexts.getByRole('button', { name: 'Writing', exact: true }).click();
  await expect(contexts.getByRole('button', { name: 'Writing', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const own = contexts.getByLabel('Add your own context');
  await own.fill('Bench work');
  await own.press('Enter');
  await expect(contexts.getByRole('button', { name: 'Bench work', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('3 picked')).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect(dialog).toHaveCount(0);

  const find = async () => ((await (await page.request.get('/api/tasks')).json()) as Array<{ id: string; name: string; context: string }>).find((t) => t.name === name)!;
  await expect.poll(async () => (await find())?.context).toBe('COMPUTER,WRITING,BENCH WORK');
  const task = await find();

  // Shown in the task's details.
  const row = page.locator(`#task-row-${task.id}`);
  await row.getByText(name, { exact: true }).click();
  await expect(row).toContainText('Computer, Writing, Bench work');

  // Reopens ticked; un-pick one, remove the custom one, save.
  await row.hover();
  await row.getByRole('button', { name: 'Edit task' }).click();
  const edit = page.getByRole('dialog');
  await edit.getByRole('button', { name: /^More options/ }).click();
  const editContexts = edit.getByRole('group', { name: 'Context' });
  for (const n of ['Computer', 'Writing', 'Bench work']) {
    await expect(editContexts.getByRole('button', { name: n, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await editContexts.getByRole('button', { name: 'Computer', exact: true }).click();
  await editContexts.getByRole('button', { name: 'Remove Bench work' }).click();
  await editContexts.getByRole('button', { name: 'Reading', exact: true }).click();
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(async () => (await find()).context).toBe('WRITING,READING');
});

test('the API cleans contexts the same way', async ({ page }) => {
  const name = uniqueName('E2E contexts api');
  createdNames.push(name);
  const res = await page.request.post('/api/tasks', { data: { name, date: new Date().toISOString().slice(0, 10), context: ' coding , Coding,beam  line' } });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).context).toBe('CODING,BEAM LINE');
});
