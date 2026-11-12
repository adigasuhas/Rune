import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Breaks and brain drain, the project time sheet (New Feature.pdf) and the
 * reflection asked when a task is finished.
 */

const created: { tasks: string[]; projects: string[]; sessions: string[] } = { tasks: [], projects: [], sessions: [] };
test.afterAll(async ({ request }) => {
  for (const id of created.sessions) await request.delete(`/api/activity-sessions/${id}`).catch(() => {});
  for (const id of created.tasks) await request.delete(`/api/tasks/${id}`).catch(() => {});
  for (const id of created.projects) await request.delete(`/api/projects/${id}`).catch(() => {});
});

async function tz(page: Page): Promise<string> {
  return ((await (await page.request.get('/api/settings')).json()).timezone as string) || 'UTC';
}

function ymd(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** The instant `hh:mm` on `day` in `timeZone`. */
function at(day: string, hhmm: string, timeZone: string): Date {
  const guess = new Date(`${day}T${hhmm}:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}

/** The time sheet is folded away by default (and remembered); open it. */
async function openTimeManagement(page: Page) {
  const toggle = page.getByRole('button', { name: /^Time management/ });
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

async function stopAnyRunning(request: APIRequestContext) {
  const running = await (await request.get('/api/activity-sessions?running=1')).json();
  for (const s of running) await request.patch(`/api/activity-sessions/${s.id}`, { data: { stop: true } });
}

test('a break started on Today runs across a reload, stops anywhere, and never lands on the calendar', async ({ page }) => {
  await stopAnyRunning(page.request);
  await page.goto('/');
  await page.getByRole('button', { name: 'Step away' }).click();
  await page.getByRole('menuitem', { name: /Take a break/ }).click();

  const running = page.getByRole('status', { name: /Break running/ });
  await expect(running).toBeVisible();

  // It's stored, so it survives a reload, and shows on other pages too.
  await page.goto('/tasks');
  await expect(page.getByRole('status', { name: /Break running/ }).first()).toBeVisible();
  const list = await (await page.request.get('/api/activity-sessions?running=1')).json();
  expect(list).toHaveLength(1);
  created.sessions.push(list[0].id);

  // Starting brain drain stops the break: never two at once.
  await page.goto('/');
  await expect(running).toBeVisible();
  const r = await page.request.post('/api/activity-sessions', { data: { action: 'start', kind: 'BRAIN_DRAIN' } });
  created.sessions.push((await r.json()).id);
  await page.reload();
  await expect(page.getByRole('status', { name: /Brain drain running/ })).toBeVisible();
  await page.getByRole('status', { name: /Brain drain running/ }).getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Step away' })).toBeVisible();
  expect(await (await page.request.get('/api/activity-sessions?running=1')).json()).toHaveLength(0);

  // Nothing on the calendar: no event, and no block on the planner.
  const events = await (await page.request.get('/api/calendar')).json();
  expect(events.some((e: { title: string }) => /break|brain drain/i.test(e.title))).toBe(false);
  await expect(page.locator('[data-event-block]', { hasText: /Brain drain|Break/ })).toHaveCount(0);
});

test('overlapping entries are refused, and a fix can be made by hand', async ({ page }) => {
  const zone = await tz(page);
  const day = ymd(new Date(Date.now() - (400 + Math.floor(Math.random() * 400)) * 86_400_000), zone);
  const first = await page.request.post('/api/activity-sessions', {
    data: { kind: 'BREAK', start: at(day, '10:00', zone).toISOString(), end: at(day, '10:30', zone).toISOString() },
  });
  expect(first.status()).toBe(201);
  const id = (await first.json()).id;
  created.sessions.push(id);
  const clash = await page.request.post('/api/activity-sessions', {
    data: { kind: 'BRAIN_DRAIN', start: at(day, '10:15', zone).toISOString(), end: at(day, '10:45', zone).toISOString() },
  });
  expect(clash.status()).toBe(409);
  expect((await clash.json()).error).toMatch(/overlaps/);
  const backwards = await page.request.patch(`/api/activity-sessions/${id}`, { data: { end: at(day, '09:00', zone).toISOString() } });
  expect(backwards.status()).toBe(400);
  const future = await page.request.post('/api/activity-sessions', {
    data: { kind: 'BREAK', start: new Date(Date.now() + 3_600_000).toISOString(), end: new Date(Date.now() + 7_200_000).toISOString() },
  });
  expect(future.status()).toBe(400);
});

test('Analytics: active hours are working + break + brain drain', async ({ page }) => {
  // The old Hours tab link opens the Overview's hours section.
  await page.goto('/analytics?tab=hours');
  const section = page.locator('[data-section="hours"]');
  await expect(section).toHaveAttribute('data-open', 'true', { timeout: 20_000 });
  await section.getByRole('radio', { name: '30 days' }).click();
  const minutes = async (id: string) => {
    const t = (await page.getByTestId(id).textContent()) || '';
    const h = /(\d+)h/.exec(t);
    const m = /(\d+)m/.exec(t);
    return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  };
  const [active, work, brk, drain] = await Promise.all(['active-total', 'active-workingMs', 'active-breakMs', 'active-drainMs'].map(minutes));
  expect(Math.abs(active - (work + brk + drain))).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: 'Show as table' }).click();
  await expect(page.getByRole('columnheader', { name: 'Active' })).toBeVisible();
});

test('the project time sheet fills itself in from the project’s tasks, and reflections are asked only on completion', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const zone = await tz(page);
  const day = ymd(new Date(Date.now() - (30 + Math.floor(Math.random() * 300)) * 86_400_000), zone);
  const project = await (await page.request.post('/api/projects', { data: { name: uniqueName('E2E sheet'), priority: 'HIGH' } })).json();
  created.projects.push(project.id);

  // One task worked 09:00-11:00 that day, with a 15-minute break and 20 minutes of brain drain inside it.
  const done = await (await page.request.post('/api/tasks', {
    data: { name: uniqueName('Draft methods'), projectId: project.id, date: day, estimatedTime: 2, slots: [{ startTime: '09:00', endTime: '11:00' }] },
  })).json();
  created.tasks.push(done.id);
  expect((await page.request.put(`/api/tasks/${done.id}`, { data: { status: 'COMPLETED' } })).ok()).toBeTruthy();
  const other = await (await page.request.post('/api/tasks', { data: { name: uniqueName('Make figures'), projectId: project.id, date: day, estimatedTime: 1 } })).json();
  created.tasks.push(other.id);
  for (const [kind, s, e] of [['BREAK', '10:00', '10:15'], ['BRAIN_DRAIN', '10:30', '10:50']] as const) {
    const res = await page.request.post('/api/activity-sessions', { data: { kind, start: at(day, s, zone).toISOString(), end: at(day, e, zone).toISOString() } });
    expect(res.status()).toBe(201);
    created.sessions.push((await res.json()).id);
  }

  await page.goto(`/analytics?tab=projects&project=${project.id}&date=${day}`);
  await openTimeManagement(page);
  const sheet = page.getByTestId('time-sheet');
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByRole('heading', { name: 'TIME MANAGEMENT' })).toBeVisible();
  await expect(sheet).toContainText(project.name);
  await expect(page.getByTestId('sheet-estimate')).toHaveText('3h');
  await expect(page.getByTestId('sheet-status')).toContainText('(this one)');
  for (const h of ['PROJECT', 'TARGET TIME', 'ACTUAL TIME', 'DIFFERENCE', 'TASK', 'START', 'END', 'TIME SPENT', 'BREAK']) {
    await expect(sheet.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('sheet-tracker')).toContainText(done.name);
  await expect(page.getByTestId('sheet-tracker')).toContainText(other.name);
  await expect(page.getByTestId('sheet-actual-total')).toHaveText('1h 25m');
  const summary = page.getByTestId('sheet-summary');
  await expect(summary.getByRole('row', { name: /Total Focused Time/ })).toContainText('1h 25m');
  await expect(summary.getByRole('row', { name: /Total Break Time/ })).toContainText('15m');
  await expect(summary.getByRole('row', { name: /Total Work Duration/ })).toContainText('2h');
  await expect(summary.getByRole('row', { name: /Efficiency Rate/ })).toContainText('71%');
  await expect(summary.getByRole('row', { name: /Biggest Time Drain/ })).toContainText('20m of brain drain');
  await expect(summary.getByRole('row', { name: /Focus Breaks/ })).toContainText('1');
  await expect(page.getByTestId('sheet-log')).toContainText('15m');

  // Moving the other task to In progress asks nothing; finishing it asks the reflection.
  await page.goto(`/projects/${project.id}`);
  expect((await page.request.put(`/api/tasks/${other.id}`, { data: { status: 'IN_PROGRESS' } })).ok()).toBeTruthy();
  await expect(page.getByRole('dialog', { name: /Done:/ })).toHaveCount(0);
  await page.reload();
  const row = page.getByRole('listitem').filter({ hasText: other.name });
  await row.getByRole('button', { name: 'Mark task complete' }).click();
  const prompt = page.getByRole('dialog', { name: new RegExp(`Done: ${other.name.replace(/[[\]]/g, '\\$&')}`) });
  await expect(prompt).toBeVisible();
  await prompt.getByLabel(/Most productive moment/).fill('The first quiet hour');
  await prompt.getByLabel(/One lesson/).fill('Block the morning');
  await prompt.getByRole('button', { name: 'Save' }).click();
  await expect(prompt).toBeHidden();
  const saved = await (await page.request.get(`/api/reflections/${other.id}`)).json();
  expect(saved).toMatchObject({ productiveMoment: 'The first quiet hour', lesson: 'Block the morning', projectId: project.id });

  // Reopening keeps it; finishing again opens the same one, filled in.
  expect((await page.request.put(`/api/tasks/${other.id}`, { data: { status: 'PENDING' } })).ok()).toBeTruthy();
  expect((await (await page.request.get(`/api/reflections/${other.id}`)).json())?.lesson).toBe('Block the morning');
  await page.reload();
  await page.getByRole('listitem').filter({ hasText: other.name }).getByRole('button', { name: 'Mark task complete' }).click();
  await expect(prompt.getByLabel(/One lesson/)).toHaveValue('Block the morning');
  await prompt.getByRole('button', { name: 'Not now' }).click();
  const all = await (await page.request.get(`/api/reflections?projectId=${project.id}`)).json();
  expect(all.filter((r: { taskId: string }) => r.taskId === other.id)).toHaveLength(1);

  // It shows on that day's sheet.
  const today = ymd(new Date(), zone);
  await page.goto(`/analytics?tab=projects&project=${project.id}&date=${today}`);
  await openTimeManagement(page);
  await expect(page.getByTestId('sheet-reflection')).toContainText('The first quiet hour', { timeout: 20_000 });
});

test('the Projects list shows hours invested, and colour depth follows recent hours and priority', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  const zone = await tz(page);
  // A day inside the 30-day window that nothing else in the suite writes breaks on.
  const yesterday = ymd(new Date(Date.now() - (20 + Math.floor(Math.random() * 8)) * 86_400_000), zone);
  const busy = await (await page.request.post('/api/projects', { data: { name: uniqueName('E2E busy low'), priority: 'LOW' } })).json();
  const idle = await (await page.request.post('/api/projects', { data: { name: uniqueName('E2E idle critical'), priority: 'CRITICAL' } })).json();
  created.projects.push(busy.id, idle.id);
  const t = await (await page.request.post('/api/tasks', {
    data: { name: uniqueName('E2E long day'), projectId: busy.id, date: yesterday, estimatedTime: 6, slots: [{ startTime: '08:00', endTime: '14:00' }] },
  })).json();
  created.tasks.push(t.id);
  await page.request.put(`/api/tasks/${t.id}`, { data: { status: 'COMPLETED' } });

  const inv = await (await page.request.get('/api/projects/investment')).json();
  expect(inv.projects[busy.id].totalMs).toBe(6 * 3_600_000);
  expect(inv.projects[idle.id]).toBeUndefined();

  await page.goto('/projects');
  const busyRow = page.locator('li.project-row', { hasText: busy.name });
  const idleRow = page.locator('li.project-row', { hasText: idle.name });
  await expect(busyRow.getByTestId('project-hours')).toHaveText('6h');
  await expect(idleRow.getByTestId('project-hours')).toHaveText('0h');
  await expect(busyRow).toContainText('Low');
  await expect(idleRow).toContainText('Critical');
  const num = async (l: typeof busyRow, a: string) => Number(await l.getAttribute(a));
  expect(await num(busyRow, 'data-tint')).toBeGreaterThan(await num(idleRow, 'data-tint'));
  expect(await num(idleRow, 'data-edge')).toBeGreaterThan(await num(busyRow, 'data-edge'));

  await page.getByLabel('Sort by').selectOption('invested');
  await expect(page.locator('li.project-row').first()).toContainText(/E2E|.+/);
});
