import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { renderMathCached } from '@/lib/latex/katexCache';

/**
 * The notebook preview re-renders the whole document after each edit; the
 * cache is what keeps unchanged equations from being re-typeset every time.
 */
describe('renderMathCached', () => {
  it('returns exactly what KaTeX would', () => {
    const expr = String.raw`\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`;
    expect(renderMathCached(expr, { displayMode: true, throwOnError: false })).toBe(
      katex.renderToString(expr, { displayMode: true, throwOnError: false })
    );
  });

  it('keeps inline and display renderings of the same expression apart', () => {
    const inline = renderMathCached('a^2+b^2', { displayMode: false, throwOnError: false });
    const display = renderMathCached('a^2+b^2', { displayMode: true, throwOnError: false });
    expect(inline).not.toBe(display);
    expect(display).toContain('katex-display');
  });

  it('serves a repeat render from the cache (much faster than typesetting)', () => {
    const expr = String.raw`\sum_{k=0}^{n} \binom{n}{k} x^k y^{n-k} = (x+y)^n`;
    renderMathCached(expr, { displayMode: true, throwOnError: false });
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) renderMathCached(expr, { displayMode: true, throwOnError: false });
    const cached = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) katex.renderToString(expr, { displayMode: true, throwOnError: false });
    const uncachedPer = (performance.now() - t1) / 20;
    expect(cached / 500).toBeLessThan(uncachedPer);
  });
});
