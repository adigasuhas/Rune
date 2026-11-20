/**
 * How a notebook is laid out as a document.
 *
 *  standard  The default: numbered sections in the Article and Thesis PDF
 *            styles, one continuous flow.
 *  minutes   Minutes of meeting: every top-level \section is one meeting.
 *            No heading carries a number, and each meeting after the first
 *            starts on a new page. Nothing in the source changes, so a
 *            notebook can switch format (either way) at any time.
 */
export type NotebookLayout = 'standard' | 'minutes';

export const NOTEBOOK_LAYOUTS: ReadonlyArray<{ value: NotebookLayout; label: string; hint: string }> = [
  { value: 'standard', label: 'Standard', hint: 'Numbered sections in one continuous document.' },
  { value: 'minutes', label: 'Minutes of meeting', hint: 'Each \\section is a meeting: unnumbered, and each starts on a new page.' },
];

export function normalizeLayout(value: unknown): NotebookLayout {
  return value === 'minutes' ? 'minutes' : 'standard';
}

/** The class a rendered document carries to take the layout's rules. */
export function layoutClass(layout: NotebookLayout | null | undefined): string {
  return layout === 'minutes' ? 'layout-minutes' : '';
}

/** One meeting, as a new minutes notebook starts. `date` is shown as written. */
export function minutesMeetingSkeleton(date: string): string {
  return `\\section{Meeting, ${date}}
\\begin{description}
  \\item[Attendees]
  \\item[Purpose]
\\end{description}

\\subsection{Agenda}
\\begin{itemize}
  \\item
\\end{itemize}

\\subsection{Discussion}


\\subsection{Decisions}
\\begin{itemize}
  \\item
\\end{itemize}

\\subsection{Action items}
\\begin{enumerate}
  \\item
\\end{enumerate}
`;
}

/**
 * The rules for a minutes document on paper (PDF export, and the readable
 * HTML in backups): no heading numbers at any level, and every meeting
 * after the first begins a new page. A manual \newpage right before a
 * meeting doesn't add a blank page on top.
 */
export function minutesPrintCss(scope = '.layout-minutes'): string {
  return `
    ${scope} h2.ltx-1::before, ${scope} h3.ltx-2::before, ${scope} h4.ltx-3::before { content: none !important; display: none !important; }
    ${scope} h2.ltx-1 ~ h2.ltx-1 { break-before: page; page-break-before: always; margin-top: 0; }
    ${scope} .page-break + h2.ltx-1 { break-before: auto; page-break-before: auto; }
  `;
}

/**
 * The same rules in the live preview, which isn't paginated: where a new
 * page would begin, a quiet ruled marker says so.
 */
export function minutesPreviewCss(scope: string): string {
  const marker = `
      content: 'New page'; position: absolute; left: 0; right: 0; top: -0.62em; margin: 0 auto; width: max-content;
      padding: 0 0.75em; background: var(--surface); color: var(--text-faint);
      font: 500 10.5px/1.2 var(--font-sans), system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase;`;
  return `
    ${scope}.layout-minutes h2.ltx-1 ~ h2.ltx-1 { position: relative; margin-top: 3em; padding-top: 1.6em; border-top: 1px dashed var(--border-strong); }
    ${scope}.layout-minutes h2.ltx-1 ~ h2.ltx-1::before {${marker} }
    ${scope}.layout-minutes .ltx-newpage + h2.ltx-1 { margin-top: 0; padding-top: 0; border-top: 0; }
    ${scope}.layout-minutes .ltx-newpage + h2.ltx-1::before { content: none; }
    ${scope} .ltx-newpage { position: relative; height: 0; margin: 2.4em 0 1.6em; border-top: 1px dashed var(--border-strong); }
    ${scope} .ltx-newpage::before {${marker} }
  `;
}
