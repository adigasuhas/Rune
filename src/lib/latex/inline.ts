import { renderMathCached } from './katexCache';

/**
 * Small helpers for LaTeX that appears inside a command argument - a
 * section title, a caption, a list label - where `$\text{Cs}_3$` and the
 * like must still typeset.
 */

/**
 * Reads a `{...}` group starting at `src[open]` (which must be `{`), with
 * nested groups balanced and `\{` / `\}` treated as literal braces. Returns
 * the inner text and the index just past the closing brace, or null if the
 * group never closes.
 */
export function readBraced(src: string, open: number): { content: string; end: number } | null {
  if (src[open] !== '{') return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return { content: src.slice(open + 1, i), end: i + 1 };
  }
  return null;
}

/** The (brace-balanced) argument of the first `\name{...}` in `src`, or '' if there is none. */
export function commandArg(src: string, name: string): string {
  const re = new RegExp(`\\\\${name}\\*?\\s*(?=\\{)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const group = readBraced(src, m.index + m[0].length);
    if (group) return group.content;
  }
  return '';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// $...$ and \(...\), with \$ left alone.
const INLINE_MATH = /(?<!\\)\$((?:\\.|[^$\\])+)\$|\\\(([\s\S]+?)\\\)/g;

const TEXT_WRAPPERS = /\\(?:textbf|textit|emph|underline|texttt|textsf|textrm|textup|textsc|text|mathrm|mathbf|mathit|mathsf|mathtt|operatorname|mbox)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;

/** Text outside math: drops formatting wrappers and escapes, keeps the words. */
function textToPlain(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) out = out.replace(TEXT_WRAPPERS, '$1'); // nested wrappers
  return out
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/~/g, ' ')
    .replace(/\\label\s*\{[^}]*\}/g, '')
    .replace(/[{}]/g, '');
}

const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ', i: 'ᵢ', j: 'ⱼ', r: 'ᵣ', u: 'ᵤ', v: 'ᵥ',
};
const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
};
const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
  upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', cdot: '·', pm: '±', mp: '∓', to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔',
  rightleftharpoons: '⇌', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', approx: '≈', sim: '∼',
  infty: '∞', circ: '°', degree: '°', partial: '∂', nabla: '∇', hbar: 'ħ', ell: 'ℓ', AA: 'Å', angstrom: 'Å',
  sum: 'Σ', prod: 'Π', int: '∫', sqrt: '√',
};

function scriptToPlain(body: string, map: Record<string, string>, marker: string): string {
  const chars = [...body];
  return chars.every((c) => map[c]) ? chars.map((c) => map[c]).join('') : `${marker}${body}`;
}

/** Math: an approximation good enough for a tooltip or a search box (Cs₃, α-Fe₂O₃). */
function mathToPlain(math: string): string {
  let out = math.replace(/\\[,;:! ]/g, ' ');
  for (let i = 0; i < 3; i++) out = out.replace(TEXT_WRAPPERS, '$1'); // nested wrappers
  out = out.replace(/\\([a-zA-Z]+)/g, (_, name: string) => SYMBOLS[name] ?? name).replace(/\\([&%$#_{}])/g, '$1');
  out = out
    .replace(/_\s*\{([^{}]*)\}|_\s*(\S)/g, (_, a, b) => scriptToPlain((a ?? b).trim(), SUB, '_'))
    .replace(/\^\s*\{([^{}]*)\}|\^\s*(\S)/g, (_, a, b) => scriptToPlain((a ?? b).trim(), SUP, '^'));
  return out.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * A plain-text reading of a LaTeX snippet, for places that can't show
 * typeset math: tooltips, `alt` text, the command palette, search.
 * `Growth of $\text{Cs}_3$Sb` -> `Growth of Cs₃Sb`.
 */
export function latexToPlainText(src: string): string {
  let out = '';
  let last = 0;
  for (const m of src.matchAll(INLINE_MATH)) {
    out += textToPlain(src.slice(last, m.index));
    out += mathToPlain(m[1] ?? m[2] ?? '');
    last = m.index! + m[0].length;
  }
  out += textToPlain(src.slice(last));
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * HTML for a short LaTeX snippet such as a section title, for UI outside
 * the document preview (the outline sidebar): inline math is typeset with
 * KaTeX, everything else is shown as plain, escaped text.
 */
export function renderInlineLatex(src: string): string {
  let html = '';
  let last = 0;
  for (const m of src.matchAll(INLINE_MATH)) {
    html += escapeHtml(textToPlain(src.slice(last, m.index)));
    html += renderMathCached(m[1] ?? m[2] ?? '', { displayMode: false, throwOnError: false });
    last = m.index! + m[0].length;
  }
  html += escapeHtml(textToPlain(src.slice(last)));
  return html;
}
