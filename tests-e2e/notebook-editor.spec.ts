import { test, expect, Page } from '@playwright/test';
import { uniqueName } from './helpers';

/**
 * Regression tests for the notebook editor hanging.
 *
 * Root cause: every keystroke re-rendered the whole document to HTML
 * (including every KaTeX equation) synchronously, so an 18 KB notebook froze
 * for ~0.7 s per key. Two save bugs sat next to it: a failed save retried
 * every 3 s forever with no message, and a save that finished after you'd
 * switched notebooks wrote the old page back into the editor's state.
 *
 * Signed in through global-setup's shared storage state; every notebook made
 * here is deleted again at the end.
 */

test.describe.configure({ timeout: 120_000 });

const created: string[] = [];

function longDocument(sections: number): string {
  let doc = '';
  for (let i = 0; i < sections; i++) {
    doc += `\\section{Section ${i}}\nParagraph about run ${i} with inline math $E_${i} = mc^2 + \\alpha_${i}$. \\label{sec:s${i}}\n`;
    doc += `\\begin{equation}\n\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2} + ${i}\n\\label{eq:e${i}}\n\\end{equation}\n`;
    doc += `See Eq.~\\eqref{eq:e${i}} and Section~\\ref{sec:s${i}}.\n\n`;
  }
  return doc;
}

async function makeNotebook(page: Page, title: string, content: string) {
  const nb = await (await page.request.post('/api/notebooks', { data: { title, isPersonal: true } })).json();
  created.push(nb.id);
  const full = await (await page.request.get(`/api/notebooks/${nb.id}`)).json();
  await page.request.put(`/api/notebooks/${nb.id}/pages/${full.page.id}`, { data: { content, tags: [] } });
  return { id: nb.id as string, pageId: full.page.id as string };
}

async function serverContent(page: Page, id: string): Promise<string> {
  return (await (await page.request.get(`/api/notebooks/${id}`)).json()).page.content;
}

async function openInSplit(page: Page, id: string) {
  await page.goto('/notebook');
  await page.evaluate((nid) => sessionStorage.setItem('rune-deep-link-notebook-id', nid), id);
  await page.goto('/notebook');
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: /split/i }).click();
  // Focus Monaco's input directly: clicking its line layer can wait forever
  // on a long document whose lines keep re-laying out.
  await page.locator('.monaco-editor textarea').focus();
  await page.keyboard.press('Control+End');
}

test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/notebooks/${id}`).catch(() => {});
});

test('typing in a long notebook stays responsive, and autosave stores the text once', async ({ page }) => {
  const nb = await makeNotebook(page, uniqueName('E2E long notebook'), longDocument(60));
  await openInSplit(page, nb.id);

  const puts: string[] = [];
  page.on('request', (r) => { if (r.method() === 'PUT' && r.url().endsWith(`/pages/${nb.pageId}`)) puts.push(r.url()); });
  await page.evaluate(() => {
    (window as any).__longTasks = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window as any).__longTasks.push(e.duration))).observe({ type: 'longtask' });
  });

  const typed = ' Responsive typing check.';
  await page.keyboard.type(typed, { delay: 15 });
  const longest = await page.evaluate(() => Math.max(0, ...(window as any).__longTasks));
  // Before the fix every key blocked for ~700 ms on this document (dev server).
  expect(longest).toBeLessThan(400);

  await expect(page.locator('.notebook-preview-styled')).toContainText('Responsive typing check.', { timeout: 5_000 });
  await expect.poll(() => serverContent(page, nb.id), { timeout: 10_000 }).toContain(typed);
  expect(puts.length).toBe(1);
});

test('a failed save says so, does not retry in a loop, and Retry recovers', async ({ page }) => {
  const nb = await makeNotebook(page, uniqueName('E2E failing save'), '\\section{Start}\nHello.\n');
  await openInSplit(page, nb.id);

  let attempts = 0;
  await page.route(`**/pages/${nb.pageId}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    attempts++;
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated outage.' }) });
  });

  await page.keyboard.type(' Kept through an outage.');
  await expect(page.getByText(/Not saved: Simulated outage\./)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(7_000);
  expect(attempts).toBe(1); // used to fire again every 3 s

  await page.unroute(`**/pages/${nb.pageId}`);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText(/Saved \d/)).toBeVisible({ timeout: 10_000 });
  expect(await serverContent(page, nb.id)).toContain('Kept through an outage.');
});

test('switching notebooks while a save is in flight keeps each document its own', async ({ page }) => {
  const a = await makeNotebook(page, uniqueName('E2E notebook A'), 'Alpha document.\n');
  const b = await makeNotebook(page, uniqueName('E2E notebook B'), 'Bravo document.\n');
  await openInSplit(page, a.id);

  // Hold A's save on the wire for 2 s, then let it through.
  await page.route(`**/pages/${a.pageId}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    await new Promise((r) => setTimeout(r, 2_000));
    return route.continue();
  });

  await page.keyboard.type(' Added to A.');
  await page.keyboard.press('Control+s');
  await page.getByRole('button', { name: 'My Notebooks' }).first().click();
  await page.getByRole('button', { name: new RegExp('E2E notebook B') }).first().click();

  await expect(page.locator('.notebook-preview-styled')).toContainText('Bravo document.', { timeout: 10_000 });
  await expect(page.locator('.notebook-preview-styled')).not.toContainText('Alpha');
  await page.waitForTimeout(4_000); // past any autosave that could misfire

  expect(await serverContent(page, a.id)).toContain('Added to A.');
  expect(await serverContent(page, b.id)).toBe('Bravo document.\n');
});
