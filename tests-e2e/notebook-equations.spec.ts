import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Regression tests for "the notebook freezes when I type \begin{equation}".
 *
 * Root cause: the LaTeX parser looped forever on a `}` with no open group.
 * The usual way to get one: type `\begin{}`, fill in `equation`, press
 * Enter - the \begin autocomplete inserted its own `}` (and the matching
 * \end{equation}) and left the typed one behind. The preview rendered on
 * the main thread, so the whole tab locked up for good.
 *
 * Every test checks real responsiveness - that the page answers within a
 * deadline after each burst of typing - not just that something rendered.
 * Signed in via global-setup's shared storage state; every notebook made
 * here is deleted at the end.
 */

test.describe.configure({ timeout: 120_000 });

const created: string[] = [];

async function makeNotebook(page: Page, content: string) {
  const nb = await (await page.request.post('/api/notebooks', { data: { title: uniqueName('E2E equations'), isPersonal: true } })).json();
  created.push(nb.id);
  const full = await (await page.request.get(`/api/notebooks/${nb.id}`)).json();
  await page.request.put(`/api/notebooks/${nb.id}/pages/${full.page.id}`, { data: { content, tags: [] } });
  return { id: nb.id as string, pageId: full.page.id as string };
}

const serverContent = async (page: Page, id: string): Promise<string> =>
  (await (await page.request.get(`/api/notebooks/${id}`)).json()).page.content;

async function openInSplit(page: Page, id: string) {
  await page.goto('/notebook');
  await page.evaluate((nid) => sessionStorage.setItem('rune-deep-link-notebook-id', nid), id);
  await page.goto('/notebook');
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: /split/i }).click();
  await page.locator('.monaco-editor textarea').focus();
  await page.keyboard.press('Control+End');
}

/** The page answers a round trip through the event loop (and paints) within `ms`. */
async function expectResponsive(page: Page, ms = 2000) {
  const answered = await Promise.race([
    page.evaluate(() => new Promise<boolean>((r) => requestAnimationFrame(() => r(true)))),
    new Promise<boolean>((r) => setTimeout(() => r(false), ms)),
  ]);
  expect(answered, `page did not respond within ${ms}ms - frozen`).toBe(true);
}

test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/notebooks/${id}`).catch(() => {});
});

test('the original freeze: \\begin{}, fill in "equation", Enter - no stray brace, still typing', async ({ page }) => {
  const nb = await makeNotebook(page, '');
  await openInSplit(page, nb.id);
  await page.keyboard.type('\\begin{}', { delay: 30 });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('equation', { delay: 30 });
  await page.keyboard.press('Enter'); // accepts the autocomplete
  await expectResponsive(page);
  await page.keyboard.type('E = mc^2', { delay: 20 });
  await expectResponsive(page);
  await expect.poll(() => serverContent(page, nb.id), { timeout: 10_000 }).toBe('\\begin{equation}\n  E = mc^2\n\\end{equation}');
});

test('typing \\begin{equation}, then inside it, then \\end{equation}: never freezes, renders once closed', async ({ page }) => {
  const nb = await makeNotebook(page, '\\section{Introduction}\n\n\\section{Method}\n');
  await openInSplit(page, nb.id);
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  for (const chunk of ['\\begin{equation}', '\n', 'a^2 + b^2', ' = c^2', '\n', '\\end{equation}']) {
    await page.keyboard.type(chunk, { delay: 15 });
    await expectResponsive(page);
  }
  // Open environment for a few seconds while typing continues: still fine.
  await expect(page.locator('.notebook-preview-styled .katex').first()).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => serverContent(page, nb.id), { timeout: 10_000 }).toContain('\\begin{equation}\na^2 + b^2 = c^2\n\\end{equation}');
});

test('invalid or unfinished LaTeX - stray braces, a lone \\frac{ - never blocks ordinary text', async ({ page }) => {
  const nb = await makeNotebook(page, 'Intro.\n');
  await openInSplit(page, nb.id);
  for (const bad of ['}', '}}', ' \\frac{', ' $x^{', ' \\end{equation}', ' \\begin{equation}', ' {{', ' \\left(']) {
    await page.keyboard.type(bad, { delay: 10 });
    await expectResponsive(page);
  }
  await page.keyboard.type('\nPlain words still go in.', { delay: 10 });
  await expectResponsive(page);
  await expect.poll(() => serverContent(page, nb.id), { timeout: 10_000 }).toContain('Plain words still go in.');
});

test('a multiline equation saves, reopens and edits; autosave writes once per pause, not in a loop', async ({ page }) => {
  const nb = await makeNotebook(page, '');
  const puts: number[] = [];
  page.on('request', (r) => { if (r.method() === 'PUT' && r.url().endsWith(`/pages/${nb.pageId}`)) puts.push(Date.now()); });
  await openInSplit(page, nb.id);
  await page.keyboard.type('\\begin{align}\nx &= 1 \\\\\ny &= 2\n\\end{align}', { delay: 10 });
  await expect.poll(() => serverContent(page, nb.id), { timeout: 10_000 }).toBe('\\begin{align}\nx &= 1 \\\\\ny &= 2\n\\end{align}');
  await page.waitForTimeout(5_000);
  expect(puts.length).toBe(1); // nothing re-saves an unchanged document

  // Reopen: the equation renders and can be edited in place.
  await openInSplit(page, nb.id);
  await expect(page.locator('.notebook-preview-styled .katex').first()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.type('\nz = 3', { delay: 10 });
  await expectResponsive(page);
  await expect.poll(() => serverContent(page, nb.id), { timeout: 10_000 }).toContain('\\end{align}\nz = 3');
});

test('an existing note full of maths opens readable and stays responsive through repeated equation edits', async ({ page }) => {
  let doc = '';
  for (let i = 0; i < 25; i++) doc += `\\section{Part ${i}}\n\\begin{equation}\n\\int_0^{${i}} x^2\\,dx = \\frac{${i}^3}{3}\n\\label{eq:p${i}}\n\\end{equation}\nInline $\\alpha_${i}$ and Eq.~\\eqref{eq:p${i}}.\n\n`;
  const nb = await makeNotebook(page, doc);
  await openInSplit(page, nb.id);
  await expect(page.locator('.notebook-preview-styled .katex-display').nth(10)).toBeVisible({ timeout: 15_000 });
  for (let round = 0; round < 6; round++) {
    await page.keyboard.type(`\n\\begin{equation}\ny_${round} = ${round}\n\\end{equation}`, { delay: 5 });
    await expectResponsive(page);
    for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
    await page.keyboard.press('Control+Z');
    await page.keyboard.press('Control+Shift+Z');
    await expectResponsive(page);
  }
  // Nothing was lost along the way, and every saved line ending is \n.
  await expect.poll(() => serverContent(page, nb.id), { timeout: 10_000 }).toContain('\\section{Part 24}');
  const saved = await serverContent(page, nb.id);
  expect(saved.startsWith('\\section{Part 0}')).toBe(true);
  expect(saved).not.toContain('\r');
});
