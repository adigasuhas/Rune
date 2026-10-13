/**
 * Default section headings for a brand-new project notebook's single
 * document, as `\section{}` markers - not separate pages/rows. A notebook
 * is one continuous LaTeX file (Overleaf-style); these just give it a
 * starting skeleton to write into.
 *
 * Pure data, no server-only imports - shared by the server-side seeding
 * logic (`notebookDefaults.ts`) and the client-side "Add content" quick-
 * insert menu (`NotebookView.tsx`), which must stay out of the client
 * bundle's server-only (`db`) dependency chain.
 */
// Standard scientific-paper structure - the order a formal write-up reads
// in, front to back.
export const DEFAULT_PROJECT_SECTIONS = [
  'Introduction',
  'Method',
  'Results',
  'References'
];

/** Builds the starter document body: one blank `\section{}` per default heading. */
export function buildDefaultSectionContent(): string {
  return DEFAULT_PROJECT_SECTIONS.map((title) => `\\section{${title}}\n\n`).join('\n');
}
