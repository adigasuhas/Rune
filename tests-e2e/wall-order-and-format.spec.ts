import { test, expect } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * The Wall: project tabs can be put in any order (kept across visits), and a
 * sticky note can hold bold, italic, coloured text and Greek letters.
 */

const projects: string[] = [];
let originalOrder: string[] | null = null;
test.afterAll(async ({ request }) => {
  if (originalOrder) await request.put('/api/wall/order', { data: { projectIds: originalOrder } }).catch(() => {});
  for (const id of projects) await request.delete(`/api/projects/${id}`).catch(() => {});
});

test('project tabs keep the order you give them', async ({ page }) => {
  originalOrder = (await (await page.request.get('/api/wall/order')).json()).projectIds;
  const a = await (await page.request.post('/api/projects', { data: { name: uniqueName('E2E wall A') } })).json();
  const b = await (await page.request.post('/api/projects', { data: { name: uniqueName('E2E wall B') } })).json();
  projects.push(a.id, b.id);
  // Start with A just before B.
  const all = (await (await page.request.get('/api/projects')).json()) as Array<{ id: string }>;
  const rest = all.map((p) => p.id).filter((id) => id !== a.id && id !== b.id);
  await page.request.put('/api/wall/order', { data: { projectIds: [a.id, b.id, ...rest] } });

  await page.goto('/wall');
  const tabs = page.getByRole('tablist', { name: 'Project' }).getByRole('tab');
  await expect(tabs.first()).toContainText(a.name);
  await expect(tabs.nth(1)).toContainText(b.name);

  // Alt+→ moves A after B, and the new order is saved.
  await tabs.first().focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(tabs.first()).toContainText(b.name);
  await expect(tabs.nth(1)).toContainText(a.name);
  await expect(page.getByRole('tab', { name: a.name })).toBeFocused();
  await expect.poll(async () => ((await (await page.request.get('/api/wall/order')).json()).projectIds as string[]).slice(0, 2)).toEqual([b.id, a.id]);

  // Dragging works too: B back after A.
  const from = (await tabs.first().boundingBox())!, to = (await tabs.nth(1).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(tabs.first()).toContainText(a.name);

  await page.reload();
  await expect(page.getByRole('tablist', { name: 'Project' }).getByRole('tab').first()).toContainText(a.name);
});

test('a note takes bold, italic, colour and Greek letters', async ({ page }) => {
  const p = await (await page.request.post('/api/projects', { data: { name: uniqueName('E2E wall format') } })).json();
  projects.push(p.id);
  await page.goto(`/wall?projectId=${p.id}`);
  await page.getByRole('button', { name: 'New note' }).click();
  const note = page.getByRole('textbox', { name: 'Note' });
  await expect(note).toBeVisible();
  await note.click();
  await page.keyboard.type('Growth ');

  const toolbar = page.getByRole('toolbar', { name: 'Format note' });
  await toolbar.getByRole('button', { name: 'Bold' }).click();
  await page.keyboard.type('fast');
  await toolbar.getByRole('button', { name: 'Bold' }).click();
  await page.keyboard.type(' at ');
  await toolbar.getByRole('button', { name: 'Greek letters' }).click();
  await page.getByRole('group', { name: 'Greek letters' }).getByRole('button', { name: 'λ', exact: true }).click();
  await page.keyboard.type(' ');
  await toolbar.getByRole('button', { name: 'Italic' }).click();
  await page.keyboard.type('maybe');
  await toolbar.getByRole('button', { name: 'Italic' }).click();
  await page.keyboard.type(' ');
  await toolbar.getByRole('button', { name: 'Text colour' }).click();
  await page.getByRole('group', { name: 'Text colour' }).getByRole('button', { name: 'Red' }).click();
  await page.keyboard.type('check');

  await expect(note.locator('b')).toContainText('fast');
  await expect(note).toContainText('Growth fast at λ maybe check');

  // Saved when the note loses focus; kept clean of anything but the formatting.
  await page.getByRole('heading', { name: 'Wall' }).click();
  await expect.poll(async () => ((await (await page.request.get(`/api/projects/${p.id}/wall`)).json()) as Array<{ text: string }>)[0]?.text ?? '').toMatch(/λ/);
  const saved = ((await (await page.request.get(`/api/projects/${p.id}/wall`)).json()) as Array<{ text: string }>)[0].text;
  expect(saved).toContain('<b>fast</b>');
  expect(saved).toContain('<i>maybe</i>');
  expect(saved).toMatch(/color: (rgb\(180, 35, 24\)|#b42318)/);

  // After a reload it reads the same, and the board search finds the words.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Note' })).toContainText('Growth fast at λ maybe check');
  await page.getByLabel('Find on this board').fill('fast at λ');
  await expect(page.getByText('1 of 1 notes')).toBeVisible();
});
