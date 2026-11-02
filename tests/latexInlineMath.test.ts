import { describe, it, expect } from 'vitest';
import { parseMarkdownToHtml } from '@/lib/notebookExport';
import { latexToPlainText, renderInlineLatex, readBraced, commandArg } from '@/lib/latex/inline';
import { computeOutline } from '@/app/notebook/notebookHelpers';
import { buildLabelMap } from '@/lib/latex/crossref';

/**
 * Inline math inside a command's argument - a section title, a caption, a
 * list label, a table cell - must typeset, not show up as `$\text{Cs}_3$`.
 */
const CS3 = '$\\text{Cs}_3$';
const render = (src: string) => parseMarkdownToHtml(src);
// KaTeX keeps the source in its (visually hidden) MathML for screen
// readers, so check the visible half only.
const visible = (html: string) => html.replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, '');
const typeset = (html: string) => {
  expect(html).toContain('class="katex"');
  expect(visible(html)).not.toContain('\\text');
  expect(visible(html)).not.toContain('$');
};

describe('inline math inside command arguments', () => {
  it('section, subsection and subsubsection titles', () => {
    for (const cmd of ['section', 'subsection', 'subsubsection']) {
      const out = render(`\\${cmd}{Growth of ${CS3}Sb}`);
      typeset(out);
      expect(out).toMatch(/<h[234] class="ltx-\d[^>]*>Growth of <span class="katex">/);
      expect(out).toContain('Sb</h');
    }
  });

  it('a starred section and one followed by a label', () => {
    typeset(render(`\\section*{${CS3}}`));
    typeset(render(`\\subsection{${CS3}}\\label{sec:cs}`));
  });

  it('figure captions: whole caption typeset, plain-text alt', () => {
    const out = render(`\\begin{figure}\n\\includegraphics{https://example.com/a.png}\n\\caption{Crystal of ${CS3} at 4 K}\n\\end{figure}`);
    typeset(out);
    expect(out).toContain('at 4 K');
    expect(out).toContain('alt="Crystal of Cs₃ at 4 K"');
  });

  it('table captions and cells', () => {
    const out = render(`\\begin{table}\n\\caption{Data for ${CS3}}\n\\begin{tabular}{ll}\nPhase & Gap \\\\\n${CS3}Sb & \\textbf{1.6} eV\n\\end{tabular}\n\\end{table}`);
    typeset(out);
    expect(out).toMatch(/<td[^>]*><span class="katex">/);
    expect(out).toContain('<strong>1.6</strong>');
  });

  it('description labels and link text', () => {
    typeset(render(`\\begin{description}\n\\item[${CS3}] an alkali antimonide\n\\end{description}`));
    typeset(render(`\\href{https://example.com}{the ${CS3} paper}`));
  });

  it('still escapes HTML in titles', () => {
    const out = render('\\section{<img src=x onerror=alert(1)> $x$}');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('keeps cross-reference numbering for a math title', () => {
    const map = buildLabelMap([{ id: 'p', title: 'P', content: `\\section{Intro}\\label{sec:a}\n\\section{${CS3}}\\label{sec:b}` }]);
    expect(map['sec:b']).toMatchObject({ type: 'Section', num: 2 });
  });
});

describe('outline sidebar', () => {
  it('keeps the whole title, nested braces included', () => {
    const outline = computeOutline(`\\section{Intro}\n\\subsection{Growth of ${CS3}Sb}\n\\section{`);
    expect(outline.map((o) => [o.level, o.text])).toEqual([[1, 'Intro'], [2, `Growth of ${CS3}Sb`]]);
  });

  it('typesets math and escapes the rest', () => {
    const html = renderInlineLatex(`<b>${CS3}</b>`);
    expect(html).toContain('class="katex"');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });
});

describe('latexToPlainText', () => {
  it.each([
    [`Growth of ${CS3}Sb`, 'Growth of Cs₃Sb'],
    ['$\\alpha$-Fe$_2$O$_3$', 'α-Fe₂O₃'],
    ['$x^{2}$ and $10^{-3}$', 'x² and 10⁻³'],
    ['\\textbf{Bold} \\& $a_{ij}$', 'Bold & aᵢⱼ'],
    ['Cost \\$5 only', 'Cost $5 only'],
  ])('%s -> %s', (src, plain) => {
    expect(latexToPlainText(src)).toBe(plain);
  });
});

describe('brace helpers', () => {
  it('readBraced balances nesting and skips escaped braces', () => {
    expect(readBraced('{a{b}c}d', 0)).toEqual({ content: 'a{b}c', end: 7 });
    expect(readBraced('{a\\}b}', 0)).toEqual({ content: 'a\\}b', end: 6 });
    expect(readBraced('{open', 0)).toBeNull();
  });
  it('commandArg finds the full argument', () => {
    expect(commandArg(`x \\caption{A ${CS3} B} y`, 'caption')).toBe(`A ${CS3} B`);
    expect(commandArg('nothing here', 'caption')).toBe('');
  });
});
