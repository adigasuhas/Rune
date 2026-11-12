import { test, expect } from '@playwright/test';

/**
 * With automatic backups on, the first visit of a new backup period asks for
 * the newest backup to be downloaded before anything else can be done, and
 * doesn't ask again once it has been.
 */

let restore: Record<string, unknown> | null = null;
const made: string[] = [];
test.afterAll(async ({ request }) => {
  if (restore) await request.put('/api/backups/policy', { data: restore }).catch(() => {});
  for (const id of made) await request.delete(`/api/backups/${id}`).catch(() => {});
});

test('daily backups: download today’s backup first, then carry on', async ({ page }) => {
  const before = await (await page.request.get('/api/backups/policy')).json();
  restore = { frequency: before.frequency, notebooks: before.notebooks, tasks: before.tasks, fullCopy: before.fullCopy, keep: before.keep };
  await page.request.put('/api/backups/policy', { data: { frequency: 'DAILY', notebooks: false, tasks: true, fullCopy: false, keep: 7 } });
  const res = await page.request.post('/api/backups', { data: {} });
  expect(res.status()).toBe(201);
  made.push((await res.json()).id);

  // Not downloaded yet this period (a download records it, so start clean by checking the prompt API).
  const prompt = await (await page.request.get('/api/backups/prompt')).json();
  test.skip(!prompt.due, 'an account backup was already downloaded today on this database');

  await page.goto('/');
  const dialog = page.getByRole('alertdialog', { name: 'Download today’s backup' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  // Everything behind it is out of reach until the backup is saved.
  const mainInert = () => page.locator('main').first().evaluate((el) => !!el.closest('[inert]'));
  expect(await mainInert()).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Download backup' })).toBeFocused();

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  await expect(dialog).toHaveCount(0);
  expect(await mainInert()).toBe(false);

  // Answered for today.
  expect((await (await page.request.get('/api/backups/prompt')).json()).due).toBe(false);
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.getByRole('alertdialog', { name: /backup/ })).toHaveCount(0);
});
