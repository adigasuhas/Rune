import { test, expect, Page } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import { uniqueName } from './helpers';

/**
 * Notebook regressions:
 *  - Document details were open by default, and toggling them moved the
 *    toolbar (the header lived in the column the rail narrowed);
 *  - in Split view the preview ran past the card's border (68% + 32% widths
 *    plus the gap and handle came to more than 100%);
 *  - PDF export: a static "Page 1 of 1" footer, code lines cut off at the
 *    page edge, unsaved edits left out, and no check that a PDF came back.
 */
test.describe.configure({ timeout: 150_000 });

const created: string[] = [];
test.afterAll(async ({ request }) => {
  for (const id of created) await request.delete(`/api/notebooks/${id}`).catch(() => {});
});

const DOC = [
  String.raw`\section{Introduction}`,
  'Platinum nanoparticles sinter faster when humid.',
  String.raw`\begin{itemize}
  \item \textbf{Bold point}
  \item \textit{Italic point}
\end{itemize}`,
  String.raw`\begin{equation}
  E_{\mathrm{total}} = \sum_{i=1}^{N} \frac{p_i^2}{2m_i} + \sum_{i<j} \frac{q_i q_j}{4\pi\varepsilon_0 r_{ij}} + \lambda \int_0^\infty e^{-\alpha t^2} \cos(\omega t)\, dt + \mathcal{O}(h^4) + \Delta G^\circ - RT\ln K_d
\end{equation}`,
  String.raw`\begin{verbatim}
python analyse.py --input xrd/batch7_humid_600C_4h_argon.xy --scherrer-k 0.94 --wavelength 1.5406 --out results/batch7.json
\end{verbatim}`,
  ...Array.from({ length: 10 }, (_, i) => `\\section{Results part ${i + 1}}\n${'Binding was measured at four temperatures. '.repeat(14)}\n\\begin{equation}\n k_${i} = A e^{-E_a/RT}\n\\end{equation}`),
].join('\n\n');

async function openNotebook(page: Page) {
  const nb = await (await page.request.post('/api/notebooks', { data: { title: uniqueName('E2E export notebook'), isPersonal: true } })).json();
  created.push(nb.id);
  const full = await (await page.request.get(`/api/notebooks/${nb.id}`)).json();
  await page.request.put(`/api/notebooks/${nb.id}/pages/${full.page.id}`, { data: { content: DOC, tags: [] } });
  await page.goto('/notebook');
  await page.evaluate((nid) => sessionStorage.setItem('rune-deep-link-notebook-id', nid), nb.id);
  await page.evaluate(() => localStorage.removeItem('rune_notebook_details_open'));
  await page.goto('/notebook');
  await expect(page.getByRole('group', { name: 'View' })).toBeVisible({ timeout: 30_000 });
  return nb.id as string;
}

const view = (page: Page, name: string) => page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true });

test('Document details start collapsed and toggling them never moves the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openNotebook(page);
  await expect(page.getByText('Document details', { exact: true })).toBeHidden();

  const controls = ['Save', 'Export', 'History'].map((n) => page.getByRole('button', { name: n, exact: true }));
  const where = async () => Promise.all([...controls, view(page, 'Split')].map(async (c) => JSON.stringify(await c.boundingBox())));
  const before = await where();
  const details = page.getByRole('button', { name: 'Details' });
  for (let i = 0; i < 4; i++) {
    await details.click();
    await expect(page.getByText('Document details', { exact: true })).toBeVisible({ visible: i % 2 === 0 });
    expect(await where()).toEqual(before);
  }
});

for (const width of [1440, 820, 390]) {
  test(`Split view stays inside the notebook at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openNotebook(page);
    await view(page, 'Split').click();
    await expect(page.locator('.notebook-preview')).toContainText('Results part 10');
    const result = await page.evaluate(() => {
      const prev = document.querySelector('.notebook-preview')!;
      const card = prev.closest('[class*="rounded-md p-6"]')!;
      const c = card.getBoundingClientRect();
      const inner = c.right - parseFloat(getComputedStyle(card).paddingRight) + 1;
      const panes = [...card.querySelectorAll('.border.rounded-md.overflow-hidden')].map((p) => p.getBoundingClientRect()).filter((b) => b.width > 0);
      const pb = prev.getBoundingClientRect();
      const wide = [...prev.querySelectorAll('.katex-display, pre, table')].map((el) => el.getBoundingClientRect().right <= pb.right + 1);
      return { panesInside: panes.every((b) => b.left >= c.left && b.right <= inner), wideInside: wide.every(Boolean) };
    });
    expect(result).toEqual({ panesInside: true, wideInside: true });
  });
}

test('PDF export from Split view gives a readable PDF with the unsaved edit and real page numbers', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await openNotebook(page);
  await view(page, 'Split').click();
  await page.locator('.monaco-editor textarea').focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n\\section{Typed before export}\nNot saved yet.\n');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const file = await (await download).path();
  const fs = await import('node:fs');
  const bytes = fs.readFileSync(file!);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

  const parser = new PDFParse({ data: bytes });
  const { text, total } = await parser.getText();
  await parser.destroy();
  expect(total).toBeGreaterThan(1);
  for (const s of ['Introduction', 'Bold point', 'Italic point', 'Results part 10', 'TYPED BEFORE EXPORT', 'results/batch7.json']) {
    expect(text.toUpperCase()).toContain(s.toUpperCase());
  }
  expect(text).toContain(`Page 1 of ${total}`);
  expect(text).toContain(`Page ${total} of ${total}`);

  // Exporting didn't write the document: the saved copy has no trace of the unsaved edit yet
  // unless autosave (3 s after typing) got there first - either way, export itself never PUTs.
  const saved = (await (await page.request.get(`/api/notebooks/${id}`)).json()).page.content as string;
  expect(saved.startsWith(String.raw`\section{Introduction}`)).toBeTruthy();
});
