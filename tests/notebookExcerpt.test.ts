import { describe, expect, it } from 'vitest';
import { latexExcerpt } from '@/lib/notebookExcerpt';

describe('latexExcerpt', () => {
  it('turns a LaTeX document into a readable glimpse', () => {
    const src = '\\section{Aim}\nTrack the stability of MAPbI$_3$ films.\n% a comment\n\\section{Methods}\nSpin-coat at 4000 rpm, anneal at 150\\,$^\\circ$C.';
    const out = latexExcerpt(src);
    expect(out.startsWith('Aim. Track the stability of MAPbI 3 films.')).toBe(true);
    expect(out).not.toMatch(/\\|\$|%|\{|\}/);
    expect(out).toContain('Methods.');
  });
  it('is short and safe on empty input', () => {
    expect(latexExcerpt('')).toBe('');
    expect(latexExcerpt('x'.repeat(1000)).length).toBe(280);
  });
});
