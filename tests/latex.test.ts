import { describe, it, expect } from 'vitest';
import { parseMarkdownToHtml } from '@/lib/notebookExport';
import { parseLatex } from '@/lib/latex/parser';
import { parseBibtex, formatCitation } from '@/lib/latex/bibliography';

/** parseMarkdownToHtml runs parse -> render -> sanitise, i.e. the real pipeline. */
const render = (src: string) => parseMarkdownToHtml(src);

describe('latex parser', () => {
  it('parses plain text into text nodes', () => {
    const nodes = parseLatex('hello world');
    expect(nodes.some((n) => n.type === 'text')).toBe(true);
  });
  it('recognises a command with an argument', () => {
    const nodes = parseLatex('\\textbf{bold}');
    expect(nodes.some((n) => n.type === 'command' && n.name.toLowerCase() === 'textbf')).toBe(true);
  });
});

describe('latex renderer (via the full pipeline)', () => {
  it('renders bold / italic', () => {
    expect(render('\\textbf{x}')).toContain('<strong>');
    expect(render('\\textit{y}')).toContain('<em>');
  });

  it('renders section headings one level below the document title', () => {
    expect(render('\\section{Method}')).toMatch(/<h2 class="ltx-1[^>]*>Method<\/h2>/);
    expect(render('\\subsection{Setup}')).toMatch(/<h3 class="ltx-2[^>]*>Setup<\/h3>/);
    expect(render('\\subsubsection{Detail}')).toMatch(/<h4 class="ltx-3[^>]*>Detail<\/h4>/);
  });

  it('renders an http link and drops a javascript: one', () => {
    expect(render('\\href{https://example.com}{Ex}')).toContain('href="https://example.com"');
    const bad = render('\\href{javascript:alert(1)}{click}');
    expect(bad).not.toContain('javascript:');
    expect(bad).toContain('click');
  });

  it('renders display math without throwing on a bad expression', () => {
    const out = render('$$ \\frac{a}{b} $$');
    expect(out).toContain('katex');
    expect(() => render('$$ \\frac{ $$')).not.toThrow();
  });

  it('wraps loose text in a paragraph', () => {
    expect(render('a plain sentence.')).toMatch(/<p[^>]*>a plain sentence\.<\/p>/);
  });

  it('emits a References section when a \\cite is present and a bib exists', () => {
    const pages = [
      { id: 'bib', title: 'references.bib', content: '@article{smith2020, title={A Title}, author={Smith, J}, year={2020}, journal={J}}', category: '', tags: [] },
      { id: 'p1', title: 'Page', content: 'As shown \\cite{smith2020}. \\printbibliography', category: '', tags: [] },
    ];
    const out = parseMarkdownToHtml('As shown \\cite{smith2020}. \\printbibliography', pages, 'p1');
    expect(out).toContain('References');
    expect(out).toMatch(/\[1\]/);
  });
});

describe('bibtex', () => {
  it('parses an entry and formats a citation', () => {
    const entries = parseBibtex('@article{k1, title={T}, author={Doe, J}, year={2021}, journal={Nature}}');
    expect(entries.k1).toBeDefined();
    const cite = formatCitation(entries.k1);
    expect(cite).toContain('2021');
  });
  it('tolerates malformed bibtex', () => {
    expect(() => parseBibtex('@article{ broken')).not.toThrow();
  });
});
