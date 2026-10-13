/** First ~280 characters of readable text from a LaTeX document. */
export function latexExcerpt(src: string): string {
  return (src || '')
    .replace(/%.*$/gm, ' ')
    .replace(/\\(?:section|subsection|subsubsection|paragraph|textbf|textit|emph)\*?\{([^}]*)\}/g, '$1. ')
    .replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, ' ')
    .replace(/\$\$?([^$]*)\$\$?/g, '$1')
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, (m, _o, arg) => (arg ? arg.slice(1, -1) : ' '))
    .replace(/[{}_^~\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(\.\s*){2,}/g, '. ')
    .trim()
    .slice(0, 280);
}
