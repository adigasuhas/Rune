/**
 * Renders many random, mostly-malformed LaTeX snippets through the whole
 * notebook preview path. Run as its own process (tests/latexHang.test.ts
 * does, with a hard timeout) because a hang is a synchronous infinite loop
 * that no in-process test timeout can interrupt.
 *
 *   npx tsx tests/fixtures/latexFuzz.ts [count] [seed]
 */
import { parseMarkdownToHtml } from '../../src/lib/notebookExport';
import { computeOutline, computeEquationsList, computeReferencesList } from '../../src/app/notebook/notebookHelpers';

const PIECES = [
  '{', '}', '[', ']', '$', '$$', '\\', '\\\\', '\\[', '\\]', '\\(', '\\)', '%', '\n', '\n\n', ' ', 'x', 'E = mc^2', '&', '^', '_',
  '\\begin{equation}', '\\end{equation}', '\\begin{', '\\end{', '\\begin{align}', '\\end{align}', '\\begin{itemize}', '\\item', '\\end{itemize}',
  '\\begin{figure}', '\\end{figure}', '\\begin{tabular}{cc}', '\\end{tabular}', '\\begin{table}', '\\end{table}', '\\begin{verbatim}', '\\end{verbatim}',
  '\\section{', '\\section{A}', '\\label{', '\\label{eq:a}', '\\ref{', '\\eqref{eq:a}', '\\cite{', '\\cite{k}', '\\frac{', '\\left(', '\\right)',
  '\\textbf{', '\\emph{b}', '\\includegraphics{', '\\caption{', '\\run{', '**', '__', '`', '```', '![', '](', ')', '<!--', '-->', '@article{k,', '\n}',
];
let seed = Number(process.argv[3] || 7);
const rand = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const page = (c: string) => [{ id: 'p', content: c, title: 'Doc', tags: [], category: 'notes', order: 0 } as never];

const count = Number(process.argv[2] || 2000);
let worst = 0;
for (let n = 0; n < count; n++) {
  let src = '';
  const len = 1 + rand(40);
  for (let i = 0; i < len; i++) src += PIECES[rand(PIECES.length)];
  process.stdout.write(`CASE ${n} ${JSON.stringify(src)}\n`);
  const t = performance.now();
  parseMarkdownToHtml(src, page(src), 'p', false, {});
  computeOutline(src); computeEquationsList(src); computeReferencesList(src);
  worst = Math.max(worst, performance.now() - t);
}
process.stdout.write(`DONE ${count} worst=${worst.toFixed(1)}ms\n`);
