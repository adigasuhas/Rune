import { stripPageMetadata } from '@/lib/notebookExport';
import type { Notebook, OutlineEntry } from './types';

/** A notebook's display color: its own override, else its parent project's color, else the neutral default. */
export function getNotebookColor(nb: Notebook | null): string {
  if (!nb) return '#71717A';
  if (nb.color) return nb.color;
  if (nb.project?.color) return nb.project.color;
  return '#71717A';
}

/** "#abc" or "#aabbcc" to an "rgba(r, g, b, alpha)" string. */
export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Triggers a browser download of a PDF Blob under `${fileNameBase}.pdf`. */
export function downloadPdfBlob(blob: Blob, fileNameBase: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileNameBase}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/** In-document outline: every \section/\subsection/\subsubsection heading, in document order, with its nesting level and line number for the jump-to-heading sidebar. */
export function computeOutline(pageContent: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const re = /^[ \t]*\\(section|subsection|subsubsection)\*?\{([^}]*)\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pageContent)) !== null) {
    const level = m[1] === 'section' ? 1 : m[1] === 'subsection' ? 2 : 3;
    entries.push({
      offset: m.index,
      line: pageContent.slice(0, m.index).split('\n').length,
      level,
      text: m[2].trim() || 'Untitled section'
    });
  }
  return entries;
}

export interface EquationEntry {
  latex: string;
  label: string;
}

/** Every numbered \begin{equation}/\end{equation} block and $$...$$ display-math block in the document, labeled by its \label{} if present, else an auto-incrementing "Equation (N)". */
export function computeEquationsList(pageContent: string): EquationEntry[] {
  if (!pageContent) return [];
  const clean = stripPageMetadata(pageContent);
  const results: EquationEntry[] = [];

  const eqRegex = /\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g;
  let match;
  let eqIndex = 1;
  while ((match = eqRegex.exec(clean)) !== null) {
    const latex = match[1].trim();
    const labelMatch = /\\label\{([a-zA-Z0-9_\-:]+)\}/.exec(latex);
    const label = labelMatch ? labelMatch[1] : `Equation (${eqIndex++})`;
    results.push({ latex: `\\begin{equation}${latex}\\end{equation}`, label });
  }

  const displayMathRegex = /\$\$([\s\S]*?)\$\$/g;
  while ((match = displayMathRegex.exec(clean)) !== null) {
    const latex = match[1].trim();
    const labelMatch = /\\label\{([a-zA-Z0-9_\-:]+)\}/.exec(latex);
    const label = labelMatch ? labelMatch[1] : `Equation (${eqIndex++})`;
    results.push({ latex: `$$${latex}$$`, label });
  }

  return results;
}

export interface ReferenceEntry {
  type: string;
  key: string;
  targetText: string;
}

/** Every \cite{}, \ref{}, and \label{} in the document, deduplicated by (type, key), for the "References" inspector panel. */
export function computeReferencesList(pageContent: string): ReferenceEntry[] {
  if (!pageContent) return [];
  const clean = stripPageMetadata(pageContent);
  const results: ReferenceEntry[] = [];

  const citeRegex = /\\cite\{([a-zA-Z0-9_\-:,]+)\}/g;
  let match;
  while ((match = citeRegex.exec(clean)) !== null) {
    match[1].split(',').forEach(k => {
      results.push({ type: 'Citation', key: k.trim(), targetText: `Citation to bibliographic entry [${k.trim()}]` });
    });
  }

  const refRegex = /\\ref\{([a-zA-Z0-9_\-:]+)\}/g;
  while ((match = refRegex.exec(clean)) !== null) {
    results.push({ type: 'Cross-Reference', key: match[1], targetText: `Internal reference to label: \\label{${match[1]}}` });
  }

  const labelRegex = /\\label\{([a-zA-Z0-9_\-:]+)\}/g;
  while ((match = labelRegex.exec(clean)) !== null) {
    results.push({ type: 'Label', key: match[1], targetText: `Anchor label defined: \\label{${match[1]}}` });
  }

  const seen = new Set<string>();
  return results.filter(item => {
    const id = `${item.type}-${item.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
