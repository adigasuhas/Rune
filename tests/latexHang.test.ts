import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseLatex } from '@/lib/latex/parser';
import { parseMarkdownToHtml } from '@/lib/notebookExport';

/**
 * The notebook froze for good when a `}` with no open group was typed:
 * parseLatex looped on it forever. A hang can't be caught by an in-process
 * test timeout (the loop never yields), so the random-input sweep runs in
 * its own process with a hard deadline.
 */
const page = (c: string) => [{ id: 'p', content: c, title: 'Doc', tags: [], category: 'notes', order: 0 } as never];

describe('LaTeX parser never stalls', () => {
  it('keeps a stray closing brace as text', () => {
    expect(parseLatex('}')).toEqual([{ type: 'text', content: '}' }]);
    expect(parseLatex('a}b').map((n) => (n.type === 'text' ? n.content : n.type)).join('')).toBe('a}b');
  });

  it('renders what the frozen editor held: a \\begin{equation} block with a brace left over', () => {
    const html = parseMarkdownToHtml('\\begin{equation}\n  E = mc^2\n\\end{equation}}', page('x'), 'p');
    expect(html).toContain('katex');
    expect(html).toContain('}');
  });

  it('renders every prefix of an equation being typed, at the start, middle and end of a note', () => {
    const doc = '\\section{Introduction}\n\n\\section{Method}\n\n\\section{Results}\n';
    for (const piece of ['\\begin{equation}\nE = mc^2\n\\end{equation}', '\\begin{}', '\\[x\\]', '$$y$$', '\\\\begin{equation}']) {
      for (const at of [0, 23, doc.length]) {
        for (let k = 1; k <= piece.length; k++) {
          const src = doc.slice(0, at) + piece.slice(0, k) + doc.slice(at);
          expect(() => parseMarkdownToHtml(src, page(src), 'p')).not.toThrow();
        }
      }
    }
  });

  it('survives 6000 random malformed documents without hanging (separate process, 60 s limit)', () => {
    const root = path.resolve(__dirname, '..');
    const run = spawnSync(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'tests/fixtures/latexFuzz.ts', '6000', '42'], {
      cwd: root,
      timeout: 60_000,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const lastCase = (run.stdout || '').trim().split('\n').filter((l) => l.startsWith('CASE')).pop();
    expect(run.signal, `hung on ${lastCase}`).toBeNull();
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('DONE 6000');
  }, 70_000);
});
