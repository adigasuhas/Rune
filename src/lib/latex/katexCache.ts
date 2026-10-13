import katex from 'katex';

/**
 * KaTeX output for a given expression and options never changes, and a
 * notebook re-renders its whole document on every edit - so without a cache
 * every equation in a long document was re-typeset per keystroke (the
 * notebook editor froze for most of a second per key on an 18 KB document).
 * Bounded so a long editing session can't grow it without limit.
 */
const MAX_ENTRIES = 1000;
const cache = new Map<string, string>();

export function renderMathCached(expr: string, options: katex.KatexOptions): string {
  const key = `${options.displayMode ? 'd' : 'i'}${options.trust ? 't' : ''}\u0000${expr}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Refresh recency: Map iteration order is insertion order.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const html = katex.renderToString(expr, options);
  cache.set(key, html);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return html;
}
