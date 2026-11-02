import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { uniqueName } from './helpers';

/**
 * Backups: the policy in Settings, a project's own schedule, and the .zip
 * itself - downloaded and unpacked here to check what's inside.
 */

// Run with the suite's own request context: a test's page is closed by then.
const cleanup: Array<(r: APIRequestContext) => Promise<unknown>> = [];
test.afterAll(async ({ request }) => {
  for (const fn of cleanup.reverse()) await fn(request).catch(() => {});
});

async function unzip(request: APIRequestContext, id: string) {
  const res = await request.get(`/api/backups/${id}`);
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['content-type']).toBe('application/zip');
  const files = unzipSync(new Uint8Array(await res.body()));
  // Everything sits under one folder named like the .zip.
  const names = Object.keys(files);
  const root = names[0].split('/')[0];
  expect(names.every((n) => n.startsWith(`${root}/`))).toBe(true);
  return Object.fromEntries(names.map((n) => [n.slice(root.length + 1), files[n]]));
}

async function makeNotebook(page: Page, title: string, content: string, projectId?: string) {
  const nb = await (await page.request.post('/api/notebooks', { data: { title, ...(projectId ? { projectId, isPersonal: false } : { isPersonal: true }) } })).json();
  cleanup.push((r) => r.delete(`/api/notebooks/${nb.id}`));
  const full = await (await page.request.get(`/api/notebooks/${nb.id}`)).json();
  await page.request.put(`/api/notebooks/${nb.id}/pages/${full.page.id}`, { data: { content, tags: [] } });
  return nb.id as string;
}

test('Settings → Backups: choose a policy, back up now, and download a .zip with notebooks, tasks and a restorable copy', async ({ page }) => {
  const before = await (await page.request.get('/api/backups/policy')).json();
  cleanup.push((r) => r.put('/api/backups/policy', { data: { frequency: before.frequency, notebooks: before.notebooks, tasks: before.tasks, fullCopy: before.fullCopy, keep: before.keep } }));
  // Start from everything on, whatever an earlier run left behind.
  await page.request.put('/api/backups/policy', { data: { frequency: 'OFF', notebooks: true, tasks: true, fullCopy: true, keep: 7 } });

  const title = uniqueName('E2E backup notebook');
  await makeNotebook(page, title, '\\section{Growth of $\\text{Cs}_3$Sb}\nBody.');
  const task = await (await page.request.post('/api/tasks', { data: { name: uniqueName('E2E backup task'), date: new Date().toISOString().slice(0, 10), estimatedTime: 1 } })).json();
  cleanup.push((r) => r.delete(`/api/tasks/${task.id}`));

  await page.goto('/settings');
  await page.getByRole('button', { name: /^Backups/ }).first().click();
  const card = page.getByRole('region', { name: 'Automatic backups' });
  await expect(card).toBeVisible();

  // Policy saves as it's changed.
  await card.getByRole('radiogroup', { name: /account/ }).getByRole('radio', { name: 'Weekly' }).click();
  await expect(card.getByText('Saved.')).toBeVisible();
  await card.getByLabel('Keep').selectOption('3');
  await expect.poll(async () => (await (await page.request.get('/api/backups/policy')).json())).toMatchObject({ frequency: 'WEEKLY', keep: 3 });

  await card.getByRole('button', { name: 'Back up now' }).click();
  await expect(card.getByText(/Backup made/)).toBeVisible({ timeout: 30_000 });
  const list = await (await page.request.get('/api/backups')).json();
  const newest = list.backups[0];
  for (const b of list.backups) cleanup.push((r) => r.delete(`/api/backups/${b.id}`));
  await expect(card.getByRole('link', { name: /Download the backup/ }).first()).toBeVisible();

  const files = await unzip(page.request, newest.id);
  const tex = Object.keys(files).find((n) => n.endsWith(`${title}.tex`) || n.includes(title.replace(/[\\/:*?"<>|]/g, '-')));
  expect(tex, Object.keys(files).join('\n')).toBeTruthy();
  expect(strFromU8(files[tex!])).toContain('\\section{Growth of $\\text{Cs}_3$Sb}');
  expect(strFromU8(files[tex!.replace(/\.tex$/, '.html')])).toContain('class="katex"');
  expect(strFromU8(files['tasks/tasks.csv'])).toContain(task.name);
  expect(JSON.parse(strFromU8(files['rune-backup.json'])).version).toBe('1.0');
  expect(strFromU8(files['README.txt'])).toContain('Restore backup');

  // Turning a part off leaves it out.
  await card.getByLabel(/^Restorable copy/).uncheck();
  await expect.poll(async () => (await (await page.request.get('/api/backups/policy')).json()).fullCopy).toBe(false);
  await card.getByRole('button', { name: 'Back up now' }).click();
  await expect(card.getByText(/Backup made/)).toBeVisible({ timeout: 30_000 });
  const second = (await (await page.request.get('/api/backups')).json()).backups[0];
  cleanup.push((r) => r.delete(`/api/backups/${second.id}`));
  expect(Object.keys(await unzip(page.request, second.id))).not.toContain('rune-backup.json');
});

test('a project sets its own backup frequency and backs up its notebooks and tasks', async ({ page }) => {
  const project = await (await page.request.post('/api/projects', { data: { name: uniqueName('E2E backup project') } })).json();
  cleanup.push((r) => r.delete(`/api/projects/${project.id}`));
  const nbTitle = uniqueName('E2E project notebook');
  await makeNotebook(page, nbTitle, 'Project notes.', project.id);
  const task = await (await page.request.post('/api/tasks', { data: { name: uniqueName('E2E project task'), projectId: project.id, date: new Date().toISOString().slice(0, 10) } })).json();
  cleanup.push((r) => r.delete(`/api/tasks/${task.id}`));

  await page.goto(`/projects/${project.id}`);
  const panel = page.getByRole('region', { name: 'Backups' });
  await panel.getByRole('radio', { name: 'Daily' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/backups?projectId=${project.id}`)).json()).frequency).toBe('DAILY');

  // Never backed up + daily = due: opening Rune makes it.
  const made = await (await page.request.post('/api/backups/run-due')).json();
  expect(made.made).toBeGreaterThanOrEqual(1);
  // ...and only once a day.
  expect((await (await page.request.post('/api/backups/run-due')).json()).made).toBe(0);

  const { backups } = await (await page.request.get(`/api/backups?projectId=${project.id}`)).json();
  expect(backups).toHaveLength(1);
  expect(backups[0].trigger).toBe('SCHEDULED');
  const files = await unzip(page.request, backups[0].id);
  expect(JSON.parse(strFromU8(files['project.json'])).name).toBe(project.name);
  expect(strFromU8(files['tasks/tasks.csv'])).toContain(task.name);
  expect(Object.keys(files).some((n) => n.startsWith('notebooks/') && n.endsWith('.tex'))).toBe(true);
  expect(Object.keys(files)).not.toContain('rune-backup.json');

  await panel.getByRole('button', { name: 'Back up now' }).click();
  await expect(panel.getByText(/Backup made/)).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole('link', { name: /Download the backup/ })).toHaveCount(2);
});

test('PDF export of a notebook works (the sanitizer loads)', async ({ page }) => {
  const id = await makeNotebook(page, uniqueName('E2E export'), '\\section{Hello $\\text{Cs}_3$}\nText.');
  const res = await page.request.post(`/api/notebooks/${id}/export-pdf`, { data: {} });
  expect(res.status(), await res.text().catch(() => '')).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
});
