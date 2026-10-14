import { describe, expect, it } from 'vitest';
import { buildNotebookExportHtml, buildPdfFooterTemplate, type ExportOptions } from '@/lib/notebookExport';

/**
 * The HTML the PDF export hands to Chromium. The PDF itself is checked end to
 * end in tests-e2e/notebook-export.spec.ts; these pin the pieces that used to
 * go wrong: a static "Page 1 of 1" printed once at the end, code lines running
 * off the page, and content going missing.
 */
const OPTIONS: ExportOptions = {
  notebookTitle: 'Pt catalyst stability',
  projectName: 'Thesis',
  authorName: 'Suhas',
  profile: 'research',
  titleFont: 'Raleway',
  bodyFont: 'Inter',
  includeCover: false,
  includeHeader: true,
  includeFooter: true,
  includeSummary: false,
};
const build = (content: string, opts: Partial<ExportOptions> = {}) =>
  buildNotebookExportHtml([{ id: 'p1', title: 'Notebook', content, tags: [] }], { ...OPTIONS, ...opts }, '');

describe('notebook PDF export HTML', () => {
  it('exports plain text', () => {
    expect(build('Just a sentence about sintering.')).toContain('Just a sentence about sintering.');
  });

  it('keeps headings, lists and formatting', () => {
    const html = build(String.raw`\section{Method}
\begin{itemize}
  \item \textbf{Bold point}
  \item \textit{Italic point}
\end{itemize}`);
    expect(html).toMatch(/<h[1-6][^>]*>[^<]*Method/);
    expect(html).toMatch(/<li[^>]*>/);
    expect(html).toMatch(/<(strong|b)[^>]*>Bold point/);
    expect(html).toMatch(/<(em|i)[^>]*>Italic point/);
  });

  it('renders LaTeX maths with KaTeX', () => {
    const html = build(String.raw`\begin{equation} d = \frac{K\lambda}{\beta\cos\theta} \end{equation} and inline $\Delta G^\circ$.`);
    expect(html).toContain('class="katex');
    expect(html).not.toMatch(/ParseError/);
  });

  it('keeps every section of a long, multi-page document', () => {
    const doc = Array.from({ length: 30 }, (_, i) => `\\section{Part ${i + 1}}\n${'A paragraph of results. '.repeat(40)}`).join('\n\n');
    const html = build(doc);
    for (let i = 1; i <= 30; i++) expect(html).toContain(`Part ${i}<`);
  });

  it('no longer prints a static "Page 1 of 1" - page numbers come from the print footer', () => {
    expect(build('Text')).not.toMatch(/Page \d+ of \d+/);
    const footer = buildPdfFooterTemplate('Pt catalyst stability');
    expect(footer).toContain('class="pageNumber"');
    expect(footer).toContain('class="totalPages"');
    expect(footer).toContain('Pt catalyst stability');
  });

  it('escapes the notebook title in the footer', () => {
    const footer = buildPdfFooterTemplate('<img src=x onerror=alert(1)>');
    expect(footer).not.toContain('<img');
  });

  it('wraps long code lines instead of letting them run off the page', () => {
    const html = build(String.raw`\begin{verbatim}
python analyse.py --input xrd/batch7_humid_600C_4h_argon.xy --scherrer-k 0.94 --wavelength 1.5406 --out results/batch7.json
\end{verbatim}`);
    expect(html).toMatch(/pre\s*\{[^}]*white-space:\s*pre-wrap/);
    expect(html).toContain('results/batch7.json');
  });
});
