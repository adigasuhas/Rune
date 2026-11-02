import { describe, it, expect } from 'vitest';
import { parseMarkdownToHtml } from '@/lib/notebookExport';
import { nestedListCss } from '@/lib/latex/listStyles';

/** The rendered list structure only: tags and text, no classes or whitespace. */
const shape = (src: string) =>
  parseMarkdownToHtml(src)
    .replace(/<(\/?)(ul|ol|li|dl|dt|dd)\b[^>]*>/g, '<$1$2>')
    .replace(/<\/?div[^>]*>/g, '')
    .replace(/\s+/g, '');

describe('nested lists', () => {
  it('an itemize inside an enumerate keeps its own items', () => {
    const src = `\\begin{enumerate}
  \\item First step
  \\begin{itemize}
    \\item sub A
    \\item sub B
  \\end{itemize}
  \\item Second step
\\end{enumerate}`;
    expect(shape(src)).toBe('<ol><li>Firststep<ul><li>subA</li><li>subB</li></ul></li><li>Secondstep</li></ol>');
  });

  it('the same list type nested in itself', () => {
    const src = '\\begin{enumerate}\n\\item A\n\\begin{enumerate}\n\\item A1\n\\item A2\n\\end{enumerate}\n\\item B\n\\end{enumerate}';
    expect(shape(src)).toBe('<ol><li>A<ol><li>A1</li><li>A2</li></ol></li><li>B</li></ol>');
  });

  it('three levels, mixed', () => {
    const src = '\\begin{itemize}\n\\item L1\n\\begin{enumerate}\n\\item L2\n\\begin{itemize}\n\\item L3a\n\\item L3b\n\\end{itemize}\n\\item L2b\n\\end{enumerate}\n\\item L1b\n\\end{itemize}';
    expect(shape(src)).toBe('<ul><li>L1<ol><li>L2<ul><li>L3a</li><li>L3b</li></ul></li><li>L2b</li></ol></li><li>L1b</li></ul>');
  });

  it('a list inside a description item, and a label holding brackets', () => {
    const src = '\\begin{description}\n\\item[Phase] cubic\n\\begin{itemize}\n\\item stable\n\\end{itemize}\n\\item[{[x]}] bracketed\n\\end{description}';
    expect(shape(src)).toBe('<dl><dt>Phase</dt><dd>cubic<ul><li>stable</li></ul></dd><dt>[x]</dt><dd>bracketed</dd></dl>');
  });

  it('blank lines, list options and everything on one line', () => {
    const expected = '<ol><li>One<ul><li>a</li><li>b</li></ul></li><li>Two</li></ol>';
    expect(shape('\\begin{enumerate}\n\n\\item One\n\n\\begin{itemize}\n\n\\item a\n\n\\item b\n\n\\end{itemize}\n\n\\item Two\n\n\\end{enumerate}')).toBe(expected);
    expect(shape('\\begin{enumerate}[label=(\\alph*)]\n\\item One\n\\begin{itemize}[noitemsep]\n\\item a\n\\item b\n\\end{itemize}\n\\item Two\n\\end{enumerate}')).toBe(expected);
    expect(shape('\\begin{enumerate} \\item One \\begin{itemize} \\item a \\item b \\end{itemize} \\item Two \\end{enumerate}')).toBe(expected);
  });

  it('text after a nested list stays in its item', () => {
    expect(shape('\\begin{enumerate}\n\\item One\n\\begin{itemize}\n\\item a\n\\end{itemize}\nmore\n\\item Two\n\\end{enumerate}')).toBe('<ol><li>One<ul><li>a</li></ul>more</li><li>Two</li></ol>');
  });

  it('\\itemsep is not an item', () => {
    expect(shape('\\begin{itemize}\\itemsep0pt\n\\item one\n\\item two\n\\end{itemize}')).toBe('<ul><li>one</li><li>two</li></ul>');
  });
});

describe('nested list markers', () => {
  it('follow LaTeX: itemize and enumerate count levels separately', () => {
    const css = nestedListCss('.doc');
    expect(css).toContain('.doc ul ul { list-style-type: "–  "; }');
    expect(css).toContain('.doc ol ol { list-style-type: lower-alpha; }');
    expect(css).toContain('.doc ol ol ol { list-style-type: lower-roman; }');
  });
});
