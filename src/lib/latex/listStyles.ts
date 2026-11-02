/**
 * Markers for nested lists, as LaTeX numbers them: itemize and enumerate
 * count their levels separately, so an itemize inside an enumerate is still
 * a first-level bullet. Descendant selectors give exactly that.
 *
 *   itemize:    •  –  ∗  ·
 *   enumerate:  1.  a.  i.  A.
 *
 * Shared by the live preview and the PDF export so both read the same.
 * `scope` is the selector the rules are limited to ('' for the whole page).
 */
export function nestedListCss(scope = ''): string {
  const s = scope ? `${scope} ` : '';
  return `
    ${s}ul { list-style-type: disc; }
    ${s}ul ul { list-style-type: "–  "; }
    ${s}ul ul ul { list-style-type: "∗  "; }
    ${s}ul ul ul ul { list-style-type: "·  "; }
    ${s}ol { list-style-type: decimal; }
    ${s}ol ol { list-style-type: lower-alpha; }
    ${s}ol ol ol { list-style-type: lower-roman; }
    ${s}ol ol ol ol { list-style-type: upper-alpha; }
    ${s}li > ul, ${s}li > ol, ${s}dd > ul, ${s}dd > ol { margin-top: 0.35em; margin-bottom: 0.35em; }
  `;
}
