import { test, expect, Page } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import { uniqueName } from './helpers';

/**
 * Minutes of meeting: an existing notebook converts in its settings (no text
 * rewritten), headings lose their numbers, and every meeting - each
 * top-level \section - starts on its own PDF page. Converting back restores
 * numbering. A new minutes notebook starts with a meeting outline.
 */

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/notebooks/${id}`).catch(() => {});
});

const MEETINGS = String.raw`\section{Kickoff with the beamline team}
Agreed the sample list.
\subsection{Action items}
Book beam time.

\section{Data review}
Looked at the first scans.

\section{Planning the paper}
Outline drafted.`;

async function pdfPages(page: Page, id: string) {
  const res = await page.request.post(`/api/notebooks/${id}/export-pdf`, { data: { profile: 'article', includeCover: false, includeHeader: true, includeFooter: true }, timeout: 120_000 });
  expect(res.ok()).toBeTruthy();
  const parser = new PDFParse({ data: Buffer.from(await res.body()) });
  const result = await parser.getText();
  await parser.destroy();
  return result.pages.map((p) => p.text);
}

test('an existing notebook converts to minutes of meeting: unnumbered, one meeting per page, and back again', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const nb = await (await page.request.post('/api/notebooks', { data: { title: uniqueName('E2E minutes'), isPersonal: true } })).json();
  created.push(nb.id);
  const full = await (await page.request.get(`/api/notebooks/${nb.id}`)).json();
  await page.request.put(`/api/notebooks/${nb.id}/pages/${full.page.id}`, { data: { content: MEETINGS, tags: [] } });

  // Standard: numbered, and the meetings share pages.
  const before = await pdfPages(page, nb.id);
  expect(before.join('\n')).toMatch(/^1[ \t]+Kickoff with the beamline team/m);
  expect(before.join('\n')).toMatch(/^2[ \t]+Data review/m);
  expect(before.length).toBe(1);

  // Convert from the notebook's own settings.
  await page.goto('/notebook');
  await page.evaluate((nid) => sessionStorage.setItem('rune-deep-link-notebook-id', nid), nb.id);
  await page.goto('/notebook');
  await expect(page.getByRole('group', { name: 'View' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.locator('form').filter({ has: page.getByRole('radiogroup', { name: 'Format' }) });
  await dialog.getByRole('radio', { name: /Minutes of meeting/ }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Now minutes of meeting')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Minutes of meeting', exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/notebooks/${nb.id}`)).json()).layout).toBe('minutes');
  // The source is untouched.
  expect((await (await page.request.get(`/api/notebooks/${nb.id}`)).json()).page.content).toBe(MEETINGS);

  // The preview marks where each new page begins.
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Split', exact: true }).click();
  const preview = page.locator('.notebook-preview-styled.layout-minutes');
  await expect(preview).toBeVisible();
  await expect(preview.locator('h2.ltx-1')).toHaveCount(3);
  const marker = await preview.locator('h2.ltx-1').nth(1).evaluate((el) => getComputedStyle(el, '::before').content);
  expect(marker).toContain('New page');

  // The PDF: no numbers, and each meeting opens its own page.
  const after = await pdfPages(page, nb.id);
  expect(after.length).toBe(3);
  expect(after[0]).toContain('Kickoff with the beamline team');
  expect(after[1]).toContain('Data review');
  expect(after[2]).toContain('Planning the paper');
  const all = after.join('\n');
  // No number on a heading's own line (page numbers and dates sit on lines of their own).
  expect(all).not.toMatch(/^\d+(\.\d+)*[ \t]+(Kickoff with the beamline team|Data review|Planning the paper|Action items)/m);
  expect(all).toMatch(/^Action items$/m);

  // And back: numbered again, nothing lost.
  await page.request.put(`/api/notebooks/${nb.id}`, { data: { layout: 'standard' } });
  const back = await pdfPages(page, nb.id);
  expect(back.join('\n')).toMatch(/^3[ \t]+Planning the paper/m);
});

test('a new minutes notebook starts with a meeting outline', async ({ page }) => {
  const nb = await (await page.request.post('/api/notebooks', { data: { title: uniqueName('E2E new minutes'), isPersonal: true, layout: 'minutes' } })).json();
  created.push(nb.id);
  const full = await (await page.request.get(`/api/notebooks/${nb.id}`)).json();
  expect(full.layout).toBe('minutes');
  expect(full.page.content).toMatch(/^\\section\{Meeting, \d{1,2} \w+ \d{4}\}/);
  expect(full.page.content).toContain(String.raw`\subsection{Action items}`);
});
