import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Analytics: folding sections (remembered on the account), logging and
 * correcting breaks from Today, a forgotten timer, and project analytics
 * reached the same way from Projects and from Analytics.
 */

const created: { tasks: string[]; projects: string[]; sessions: string[] } = { tasks: [], projects: [], sessions: [] };
const PREF_KEYS = ['analytics.open.completion', 'analytics.open.project-sheet'];
test.afterAll(async ({ request }) => {
  for (const id of created.sessions) await request.delete(`/api/activity-sessions/${id}`).catch(() => {});
  for (const id of created.tasks) await request.delete(`/api/tasks/${id}`).catch(() => {});
  for (const id of created.projects) await request.delete(`/api/projects/${id}`).catch(() => {});
  await request.patch('/api/settings/ui-preferences', { data: Object.fromEntries(PREF_KEYS.map((k) => [k, null])) }).catch(() => {});
});

async function tz(page: Page): Promise<string> {
  return ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
}
function ymd(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function hhmm(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}
const sessionsOn = async (page: Page, day: string) => (await (await page.request.get(`/api/activity-sessions?from=${day}&to=${day}`)).json()) as Array<{ id: string; kind: string; start: string; end: string | null }>;

test('Overview sections fold and unfold, and stay that way after a reload', async ({ page }) => {
  await page.goto('/analytics');
  const toggle = page.getByRole('button', { name: /^Task completion/ });
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-section="completion"]').getByText('7-day average')).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // The summary still says what's inside while folded.
  await expect(toggle).toContainText(/over 7 days/);
  await expect.poll(async () => (await (await page.request.get('/api/settings/ui-preferences')).json())['analytics.open.completion']).toBe(false);

  await page.reload();
  await expect(page.getByRole('button', { name: /^Task completion/ })).toHaveAttribute('aria-expanded', 'false', { timeout: 20_000 });
  await page.getByRole('button', { name: /^Task completion/ }).click();
  await expect(page.getByRole('button', { name: /^Task completion/ })).toHaveAttribute('aria-expanded', 'true');
});

test('Today: log a break with start and end times (across midnight), then edit and delete it', async ({ page }) => {
  const zone = await tz(page);
  const past = ymd(new Date(Date.now() - (40 + Math.floor(Math.random() * 300)) * 86_400_000), zone);
  await page.goto('/');
  await page.getByRole('button', { name: 'Step away' }).click();
  await page.getByRole('menuitem', { name: /Log one with start and end times/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Breaks and brain drain' });
  const form = dialog.getByRole('form', { name: 'Log a break or brain drain' });
  await form.getByRole('radio', { name: 'Brain drain' }).click();
  await form.getByLabel('Day').fill(past);
  await form.getByLabel('Start').fill('23:30');
  await form.getByLabel('End').fill('00:15');
  await expect(form.getByTestId('away-duration')).toHaveText(/45m · ends the next day/);
  await form.getByRole('button', { name: 'Add' }).click();
  await expect(form.getByTestId('away-duration')).toHaveText('Duration shows here');
  const saved = (await sessionsOn(page, past)).find((s) => s.kind === 'BRAIN_DRAIN');
  expect(saved).toBeTruthy();
  created.sessions.push(saved!.id);
  expect(new Date(saved!.end!).getTime() - new Date(saved!.start).getTime()).toBe(45 * 60_000);

  // A bad range is refused before anything is sent.
  await form.getByLabel('Start').fill('10:00');
  await form.getByLabel('End').fill('23:30');
  await expect(form.getByRole('alert')).toContainText('at most 12 hours');

  // Edit and delete one from the list (a recent day, so it's listed).
  const recent = ymd(new Date(Date.now() - (2 + Math.floor(Math.random() * 10)) * 86_400_000), zone);
  // Nothing else in the list may start at 03:10 (e.g. left by an interrupted run).
  const fortnight = await (await page.request.get(`/api/activity-sessions?from=${ymd(new Date(Date.now() - 15 * 86_400_000), zone)}&to=${ymd(new Date(), zone)}`)).json();
  for (const s of fortnight) if (hhmm(new Date(s.start), zone) === '03:10') await page.request.delete(`/api/activity-sessions/${s.id}`);
  await form.getByRole('radio', { name: 'Break' }).click();
  await form.getByLabel('Day').fill(recent);
  await form.getByLabel('Start').fill('03:10');
  await form.getByLabel('End').fill('03:40');
  await expect(form.getByTestId('away-duration')).toHaveText('30m');
  await form.getByRole('button', { name: 'Add' }).click();
  const row = dialog.getByRole('listitem').filter({ has: page.locator('input[type="time"][value="03:10"]') });
  await expect(row).toHaveCount(1);
  await row.getByLabel('Break: end').click();
  await row.getByLabel('Break: end').fill('03:55');
  await row.getByLabel('Break: end').press('Enter');
  await expect.poll(async () => {
    const s = (await sessionsOn(page, recent)).find((x) => hhmm(new Date(x.start), zone) === '03:10');
    return s ? (new Date(s.end!).getTime() - new Date(s.start).getTime()) / 60_000 : null;
  }).toBe(45);
  await dialog.getByRole('listitem').filter({ has: page.locator('input[type="time"][value="03:10"]') }).getByRole('button', { name: /Delete this break/ }).click();
  await page.getByRole('dialog', { name: /Delete this break/ }).getByRole('button', { name: 'Delete' }).click();
  await expect.poll(async () => (await sessionsOn(page, recent)).some((x) => hhmm(new Date(x.start), zone) === '03:10')).toBe(false);
});

test('a break left running for hours is flagged on Today and its real end time can be set', async ({ page }) => {
  const zone = await tz(page);
  for (const s of await (await page.request.get('/api/activity-sessions?running=1')).json()) await page.request.patch(`/api/activity-sessions/${s.id}`, { data: { stop: true } });
  // Clear today's last three hours so the backdated start doesn't overlap anything.
  const since = Date.now() - 3 * 3_600_000;
  for (const s of await sessionsOn(page, ymd(new Date(), zone))) {
    if (new Date(s.end ?? Date.now()).getTime() > since) await page.request.delete(`/api/activity-sessions/${s.id}`);
  }
  const started = await (await page.request.post('/api/activity-sessions', { data: { action: 'start', kind: 'BREAK' } })).json();
  created.sessions.push(started.id);
  const startAt = new Date(Date.now() - 150 * 60_000);
  const moved = await page.request.patch(`/api/activity-sessions/${started.id}`, { data: { start: startAt.toISOString() } });
  expect(moved.ok()).toBeTruthy();

  await page.goto('/');
  const status = page.getByRole('status', { name: /long time/ });
  await expect(status).toBeVisible({ timeout: 15_000 });
  await expect(status).toContainText('Still on a break?');
  await status.getByRole('button', { name: 'Set end time' }).click();
  const dialog = page.getByRole('dialog', { name: /When did this break end/ });
  const endAt = new Date(startAt.getTime() + 30 * 60_000);
  await dialog.getByLabel('Ended on').fill(ymd(endAt, zone));
  await dialog.getByLabel('End time').fill(hhmm(endAt, zone));
  await expect(dialog).toContainText('30m in all');
  await dialog.getByRole('button', { name: 'Save end time' }).click();
  await expect(page.getByRole('button', { name: 'Step away' })).toBeVisible();
  const after = (await sessionsOn(page, ymd(startAt, zone))).find((s) => s.id === started.id)!;
  expect(Math.round((new Date(after.end!).getTime() - new Date(after.start).getTime()) / 60_000)).toBe(30);
});

test('project analytics opens the same view from Projects and from Analytics; the time sheet fits a desktop screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = await (await page.request.post('/api/projects', { data: { name: uniqueName('E2E insight'), priority: 'HIGH' } })).json();
  created.projects.push(project.id);
  const t = await (await page.request.post('/api/tasks', { data: { name: uniqueName('E2E insight task'), projectId: project.id, date: ymd(new Date(), await tz(page)), estimatedTime: 1 } })).json();
  created.tasks.push(t.id);
  await page.request.patch('/api/settings/ui-preferences', { data: { 'analytics.open.project-sheet': false } });

  // From the Projects page.
  await page.goto('/projects');
  await page.getByRole('link', { name: `Analytics for ${project.name}` }).click();
  await expect(page).toHaveURL(new RegExp(`/analytics\\?tab=projects&project=${project.id}`));
  const view = page.getByTestId('project-analytics');
  await expect(view.getByRole('heading', { name: project.name })).toBeVisible({ timeout: 20_000 });

  // From the Analytics list: the same view.
  await view.getByRole('button', { name: 'All projects' }).click();
  await page.getByRole('button', { name: `${project.name}: open analytics` }).click();
  await expect(page.getByTestId('project-analytics').getByRole('heading', { name: project.name })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`project=${project.id}`));

  // Time management is folded away until asked for, then remembered.
  const toggle = page.getByRole('button', { name: /^Time management/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('time-sheet')).toBeHidden();
  await toggle.click();
  const sheet = page.getByTestId('time-sheet');
  await expect(sheet).toBeVisible();
  await page.locator('[data-section="project-sheet"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  const box = (await sheet.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900);

  await page.reload();
  await expect(page.getByRole('button', { name: /^Time management/ })).toHaveAttribute('aria-expanded', 'true', { timeout: 20_000 });
});
