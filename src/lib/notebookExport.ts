/**
 * Shared, isomorphic (client + server) helpers for turning notebook pages into
 * exportable HTML. Used by the live preview pane and by the server-side
 * Puppeteer PDF export route, so both stay visually consistent.
 */
import { parseLatexToHtml } from './latex/renderer';
import { sanitizeNotebookHtml, sanitizePlainText } from './sanitizeHtml';
import { nestedListCss } from './latex/listStyles';

export interface ExportPage {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface ExportOptions {
  notebookTitle: string;
  projectName: string | null;
  authorName: string;
  profile: 'article' | 'thesis' | 'preview' | 'daily' | 'full' | 'research' | 'minimal';
  titleFont: string;
  bodyFont: string;
  includeCover: boolean;
  includeHeader: boolean;
  includeFooter: boolean;
  includeSummary: boolean;
}

export function stripPageMetadata(content: string): string {
  if (!content) return '';
  return content.replace(/<!--RUNE_METADATA_START([\s\S]*?)RUNE_METADATA_END-->/g, '');
}

// Each metadata value is interpolated straight into a <style> block for PDF
// export, so every field is validated against a strict pattern before use -
// a crafted value must not be able to break out of the CSS declaration.
const CSS_LENGTH = /^-?\d{1,4}(\.\d{1,3})?(px|pt|em|rem|%)?$/;
const CSS_COLOR = /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\))$/;
const FONT_FAMILY = /^[A-Za-z0-9 _-]{1,40}$/;

function safeMeta(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === 'string' && pattern.test(value.trim()) ? value.trim() : undefined;
}

export function parsePageMetadata(content: string): { fontColor: string; textAlign: string; fontFamily?: string; fontSize?: string; fontWeight?: string; lineHeight?: string; paragraphSpacing?: string } {
  const defaultMeta = {
    fontColor: '#d4d4d8',
    textAlign: 'left'
  };
  if (!content) return defaultMeta;
  const match = content.match(/<!--RUNE_METADATA_START([\s\S]*?)RUNE_METADATA_END-->/);
  if (!match) return defaultMeta;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return defaultMeta;
  }
  if (!parsed || typeof parsed !== 'object') return defaultMeta;
  return {
    fontColor: safeMeta(parsed.fontColor, CSS_COLOR) || defaultMeta.fontColor,
    textAlign: ['left', 'center', 'right', 'justify'].includes(String(parsed.textAlign)) ? String(parsed.textAlign) : 'left',
    fontFamily: safeMeta(parsed.fontFamily, FONT_FAMILY),
    fontSize: safeMeta(parsed.fontSize, CSS_LENGTH),
    fontWeight: /^(normal|bold|[1-9]00)$/.test(String(parsed.fontWeight)) ? String(parsed.fontWeight) : undefined,
    lineHeight: safeMeta(parsed.lineHeight, CSS_LENGTH) || (/^\d(\.\d+)?$/.test(String(parsed.lineHeight)) ? String(parsed.lineHeight) : undefined),
    paragraphSpacing: safeMeta(parsed.paragraphSpacing, CSS_LENGTH),
  };
}

export function formatDateLong(dateStr?: string | null): string {
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  const day = d.getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatDateDisplay(dateStr?: string | null): string {
  if (!dateStr) return 'No date';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${day} ${months[monthIndex]} ${year}`;
    }
  }
  return dateStr;
}

export function parseMarkdownToHtml(
  markdown: string,
  pagesArray: ExportPage[] = [],
  currentPageId: string = '',
  isPdfExport: boolean = false,
  runsMap: Record<string, { name: string; status: string }> = {}
): string {
  if (!markdown) return '';
  const cleanContent = stripPageMetadata(markdown);
  const rendered = parseLatexToHtml(cleanContent, pagesArray, currentPageId, isPdfExport, runsMap);
  // Untrusted, user-authored (and in Team mode cross-user) content is about to
  // be handed to dangerouslySetInnerHTML / Puppeteer - scrub it first.
  return sanitizeNotebookHtml(rendered);
}

/**
 * The three looks a PDF can take. Each is a complete typographic system
 * (face, measure, heading scheme, tables, captions, running head and foot),
 * not a colour swap.
 *
 *  article  The default. LaTeX's article class: Computer Modern (KaTeX's own
 *           font files - the same face the maths is set in, so text and
 *           equations match), justified and hyphenated, indented paragraphs,
 *           numbered sections, booktabs rules, a centred title block and a
 *           centred page number.
 *  thesis   After the author's own Beamer deck: Geist set like Figtree, navy
 *           (#000061) headings with numbered square markers, the pale-blue
 *           (#DEF0FF) panels, and the deck's footline - author left, n/N right.
 *  preview  What the notebook preview shows: Newsreader, unnumbered headings,
 *           open paragraph spacing.
 */
export type PdfStyle = 'article' | 'thesis' | 'preview';

/** Old profile names, still sent by older clients, map onto the styles. */
export function pdfStyleFor(profile: string | undefined): PdfStyle {
  if (profile === 'full' || profile === 'thesis') return 'thesis';
  if (profile === 'minimal' || profile === 'preview') return 'preview';
  return 'article';
}

const CM = `KaTeX_Main, 'Latin Modern Roman', 'CMU Serif', 'Computer Modern', Georgia, serif`;
const CM_TT = `KaTeX_Typewriter, 'Latin Modern Mono', 'CMU Typewriter Text', 'Courier New', monospace`;
const SANS = `'Geist', 'Figtree', 'Helvetica Neue', Arial, sans-serif`;
const SERIF_PREVIEW = `'Newsreader', 'Iowan Old Style', Georgia, serif`;
const NAVY = '#000061';
const NAVY_2 = '#000080';
const PANEL = '#def0ff';
const PANEL_EDGE = '#b9d6f5';

/** Page margins per style (top right bottom left), leaving room for the running head and foot. */
export function pdfMargins(style: PdfStyle): { top: string; right: string; bottom: string; left: string } {
  if (style === 'thesis') return { top: '2.4cm', right: '2.2cm', bottom: '2.3cm', left: '2.2cm' };
  if (style === 'preview') return { top: '2.4cm', right: '2.4cm', bottom: '2.4cm', left: '2.4cm' };
  // article: LaTeX's a4paper margins are wide; this keeps a ~75-character measure at 11pt.
  return { top: '2.8cm', right: '2.9cm', bottom: '2.8cm', left: '2.9cm' };
}

export function getPdfStyles(
  profile: string,
  _titleFont: string,
  bodyFont: string,
  fontSize?: string,
  _fontWeight?: string,
  lineHeight?: string,
  paragraphSpacing?: string,
  textAlign?: string
): { css: string; margin: string } {
  const style = pdfStyleFor(profile);
  const m = pdfMargins(style);
  const margin = `${m.top} ${m.right} ${m.bottom} ${m.left}`;
  // The page's own formatting settings, when the writer set them, still
  // apply; the style supplies everything else. A typeface setting only
  // counts in the Preview style - Article is Computer Modern by definition.
  const size = fontSize && fontSize !== '1rem' ? fontSize : style === 'article' ? '11pt' : style === 'thesis' ? '10.5pt' : '11.5pt';
  const leading = lineHeight || (style === 'article' ? '1.36' : style === 'thesis' ? '1.5' : '1.62');
  const align = textAlign && textAlign !== 'left' ? textAlign : style === 'article' ? 'justify' : 'left';
  const previewFace = FONT_FAMILY.test((bodyFont || '').trim()) && style === 'preview' && bodyFont !== 'Figtree' && bodyFont !== 'Inter'
    ? `'${bodyFont.trim()}', ${SERIF_PREVIEW}` : SERIF_PREVIEW;
  const body = style === 'article' ? CM : style === 'thesis' ? SANS : previewFace;
  const paraGap = paragraphSpacing || (style === 'preview' ? '0.85em' : style === 'thesis' ? '0.6em' : '0');

  // ---- Shared bones: every style ------------------------------------------
  const base = `
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0; font-family: ${body}; font-size: ${size}; line-height: ${leading};
      color: #111; background: #fff; text-align: ${align};
      hyphens: auto; -webkit-hyphens: auto; hanging-punctuation: first;
      font-variant-numeric: oldstyle-nums proportional-nums;
      font-kerning: normal; text-rendering: optimizeLegibility;
      orphans: 3; widows: 3;
    }
    .katex { font-size: 1.08em; }
    .katex, .katex * { font-variant-numeric: normal; }
    p { margin: 0 0 ${paraGap}; }
    h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; text-align: left; hyphens: manual; }
    a { color: inherit; text-decoration: none; }
    strong, b { font-weight: 700; }
    img { max-width: 100%; height: auto; }
    .page-break { break-before: page; page-break-before: always; height: 0; }
    .page-break-inside-avoid, .ltx-equation, .ltx-figure, .ltx-table { break-inside: avoid; page-break-inside: avoid; }

    /* Code: paper can't scroll - long lines wrap instead of running off. */
    code, pre { font-family: ${style === 'article' ? CM_TT : `'Geist Mono', ${CM_TT}`}; }
    pre { white-space: pre-wrap !important; overflow-wrap: anywhere; }
    .ltx-tt { font-size: 0.95em; background: none; border: 0; padding: 0; }

    /* Lists, LaTeX's markers and spacing. */
    ul, ol { margin: 0.45em 0 0.7em; padding-left: 1.6em; }
    li { margin: 0.18em 0; padding-left: 0.15em; }
    li > p, dd > p { margin: 0; }
    ${nestedListCss()}
    .ltx-description { margin: 0.5em 0 0.8em; }
    .ltx-ditem { margin: 0 0 0.35em; }
    .ltx-description dt { display: inline; font-weight: 700; }
    .ltx-description dt::after { content: ' '; }
    .ltx-description dd { display: inline; margin: 0; color: inherit; padding: 0; }

    /* Display maths. The equation number is KaTeX's own (n) at the right
       margin, as in LaTeX - the preview's "Equation (n)" caption isn't printed. */
    .ltx-equation { margin: 0.9em 0; padding: 0; border: 0; background: none; text-align: center; }
    .ltx-eqlabel { display: none; }
    .ltx-math { padding: 0; overflow: visible; }
    .katex-display { margin: 0.75em 0; }
    .ltx-equation .katex-display { margin: 0; }

    /* Figures and tables. */
    .ltx-figure, .ltx-table { margin: 1.3em 0; padding: 0; border: 0; background: none; text-align: center; }
    .ltx-img { display: block; margin: 0 auto; max-height: 9.5cm; width: auto; border-radius: 0; }
    .ltx-figure .ltx-caption { margin-top: 0.65em; }
    .ltx-table .ltx-caption { margin-bottom: 0.55em; }
    .ltx-caption { font-size: 0.9em; line-height: 1.35; max-width: 88%; margin-left: auto; margin-right: auto; text-align: center; color: inherit; }
    .ltx-tabular-wrap { display: flex; justify-content: center; }
    table { border-collapse: collapse; border-spacing: 0; font-size: 0.92em; margin: 0 auto; }
    th, td { padding: 0.32em 0.85em; text-align: left; vertical-align: baseline; background: none; color: inherit; }

    /* Inline colour from \textcolor / \colorbox. */
    .ltx-colorbox { padding: 0.04em 0.15em; border-radius: 1.5px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }

    /* Unknown environments read like amsthm's plain style: "Theorem. Body". */
    .ltx-env { margin: 0.9em 0; padding: 0; border: 0; background: none; }
    .ltx-env-name { display: inline; font-weight: 700; font-size: inherit; letter-spacing: 0; text-transform: none; color: inherit; font-family: inherit; margin: 0; }
    .ltx-env-kind { display: none; }
    .ltx-env-title { text-transform: capitalize; }
    .ltx-env-title::after { content: '. '; }
    .ltx-env > p:first-of-type { display: inline; }

    .ltx-quote > :last-child, .ltx-env > :last-child, .ltx-abstract-body > :last-child { margin-bottom: 0; }
    .doc-tags { font-size: 0.85em; margin: 0 0 1.4em; text-align: center; }
  `;

  // ---- Article: LaTeX's article class -------------------------------------
  const article = `
    body { counter-reset: sec; font-variant-numeric: normal; }
    p { margin: 0; }
    p + p { text-indent: 1.5em; }
    .ltx-1 + p, .ltx-2 + p, .ltx-3 + p { text-indent: 0; }

    .title-block { text-align: center; margin: 0.4cm 0 1.5em; }
    .title-block .doc-title { font-family: ${CM}; font-weight: 400; font-size: 17.3pt; line-height: 1.25; margin: 0 0 0.75em; letter-spacing: 0; }
    .title-block .doc-author { font-size: 12pt; margin: 0 0 0.35em; }
    .title-block .doc-date { font-size: 12pt; margin: 0; }
    .title-block .doc-project { font-size: 10pt; font-variant: small-caps; letter-spacing: 0.06em; margin: 0 0 1.1em; color: #333; }

    h2.ltx-1 { font-family: ${CM}; font-size: 14.4pt; font-weight: 700; margin: 1.5em 0 0.65em; line-height: 1.25; counter-increment: sec; counter-reset: subsec; border: 0; padding: 0; color: #000; }
    h3.ltx-2 { font-family: ${CM}; font-size: 12pt; font-weight: 700; margin: 1.25em 0 0.55em; line-height: 1.3; counter-increment: subsec; counter-reset: subsubsec; border: 0; padding: 0; color: #000; }
    h4.ltx-3 { font-family: ${CM}; font-size: 11pt; font-weight: 700; margin: 1.1em 0 0.45em; counter-increment: subsubsec; color: #000; }
    h2.ltx-1:not(.ltx-nonum)::before { content: counter(sec); display: inline-block; min-width: 1.5em; }
    h3.ltx-2:not(.ltx-nonum)::before { content: counter(sec) "." counter(subsec); display: inline-block; min-width: 2.3em; }
    h4.ltx-3:not(.ltx-nonum)::before { content: counter(sec) "." counter(subsec) "." counter(subsubsec); display: inline-block; min-width: 3em; }

    /* booktabs: a heavy top and bottom rule, a light one under the head, nothing else. */
    table { border-top: 1pt solid #000; border-bottom: 1pt solid #000; }
    th { font-weight: 400; border-bottom: 0.55pt solid #000; }
    td { border: 0; }
    .ltx-captag { font-weight: 400; }

    .ltx-abstract { margin: 1.2em 2.6em 1.6em; padding: 0; border: 0; background: none; max-width: none; }
    .ltx-abstract-title { font-family: ${CM}; font-size: 10pt; font-weight: 700; text-align: center; letter-spacing: 0; text-transform: none; margin: 0 0 0.45em; color: #000; }
    .ltx-abstract-body { font-size: 10pt; font-style: normal; text-align: justify; font-family: ${CM}; color: #000; line-height: 1.35; }
    .ltx-quote { margin: 0.8em 2.4em; padding: 0; border: 0; background: none; font-style: normal; font-size: inherit; color: inherit; border-radius: 0; }
    .ltx-verbatim { margin: 0.8em 0 0.8em 1.5em; padding: 0; background: none; border: 0; font-size: 9.5pt; line-height: 1.3; color: #000; border-radius: 0; }
    .ltx-env-title { font-variant: normal; }
    .ltx-env > p { font-style: italic; }
    a[href^="http"] { color: #1f3b8f; }
    .ltx-tt { font-size: 1em; }
  `;

  // ---- Thesis: the Beamer deck, on A4 --------------------------------------
  const thesis = `
    body { counter-reset: sec; color: #161616; }
    .title-block { margin: 0 0 1.8em; padding: 0 0 0.9em; border-bottom: 1.5pt solid ${PANEL_EDGE}; }
    .title-block .doc-project { font-size: 9pt; font-weight: 600; letter-spacing: 0.02em; color: ${NAVY_2}; margin: 0 0 0.6em; }
    .title-block .doc-title { font-family: ${SANS}; font-weight: 500; font-size: 22pt; line-height: 1.15; letter-spacing: -0.012em; color: ${NAVY}; margin: 0 0 0.45em; }
    .title-block .doc-author { font-size: 10.5pt; color: ${NAVY_2}; margin: 0; display: inline; }
    .title-block .doc-date { font-size: 10.5pt; color: #444; margin: 0; display: inline; }
    .title-block .doc-date::before { content: '  ·  '; color: #999; white-space: pre; }

    h2.ltx-1 { font-family: ${SANS}; font-size: 15pt; font-weight: 500; letter-spacing: -0.008em; color: ${NAVY}; margin: 1.6em 0 0.6em; padding: 0; border: 0; counter-increment: sec; counter-reset: subsec; display: flex; align-items: center; gap: 0.5em; }
    h2.ltx-1:not(.ltx-nonum)::before { content: counter(sec); flex: none; display: inline-grid; place-items: center; width: 1.45em; height: 1.45em; font-size: 0.72em; font-weight: 600; color: #fff; background: ${NAVY_2}; border-radius: 2px; letter-spacing: 0; }
    h3.ltx-2 { font-family: ${SANS}; font-size: 11.5pt; font-weight: 500; color: ${NAVY}; background: ${PANEL}; padding: 0.28em 0.6em; margin: 1.3em 0 0.6em; border: 0; border-radius: 2px; counter-increment: subsec; }
    h3.ltx-2:not(.ltx-nonum)::before { content: counter(sec) "." counter(subsec) "  "; white-space: pre; color: ${NAVY_2}; font-weight: 600; }
    h4.ltx-3 { font-family: ${SANS}; font-size: 10.5pt; font-weight: 600; color: ${NAVY_2}; margin: 1.1em 0 0.4em; }

    strong, b { color: ${NAVY_2}; font-weight: 600; }
    a[href^="http"] { color: ${NAVY_2}; text-decoration: underline; text-decoration-color: ${PANEL_EDGE}; text-underline-offset: 2px; }
    ul { list-style-type: disc; }
    li::marker { color: ${NAVY_2}; }

    table { border: 0; font-size: 0.93em; }
    th { background: ${PANEL}; color: ${NAVY}; font-weight: 600; border-bottom: 1pt solid ${PANEL_EDGE}; }
    td { border-bottom: 0.5pt solid #dfe6ef; }
    tr:last-child td { border-bottom: 1pt solid ${PANEL_EDGE}; }
    .ltx-captag { color: ${NAVY}; font-weight: 600; }
    .ltx-caption { color: #333; }

    .ltx-abstract { margin: 0 0 1.6em; padding: 0.85em 1.1em; background: ${PANEL}; border: 0; border-radius: 4px; max-width: none; }
    .ltx-abstract-title { font-family: ${SANS}; font-size: 9pt; font-weight: 600; text-transform: none; letter-spacing: 0.02em; color: ${NAVY}; text-align: left; margin: 0 0 0.35em; }
    .ltx-abstract-body { font-family: ${SANS}; font-style: normal; font-size: 10pt; color: #1c1c3a; text-align: left; }
    .ltx-quote { margin: 0.9em 0; padding: 0.6em 1em; background: #f3f8ff; border: 0; border-left: 2.5pt solid ${NAVY_2}; border-radius: 0 3px 3px 0; font-style: normal; color: #1c1c3a; font-size: inherit; }
    .ltx-verbatim { margin: 0.8em 0; padding: 0.7em 0.9em; background: #f5f7fb; border: 0.5pt solid #dfe6ef; border-radius: 3px; font-size: 8.8pt; line-height: 1.45; color: #1c1c3a; }
    .ltx-tt { color: #b20000; }
    .ltx-env { padding: 0.65em 0.95em; background: #f3f8ff; border-radius: 3px; }
    .ltx-env-name { color: ${NAVY}; }
  `;

  // ---- Preview: the notebook preview on paper -----------------------------
  const preview = `
    .title-block { margin: 0 0 1.6em; }
    .title-block .doc-project { font-size: 9.5pt; color: #666; margin: 0 0 0.4em; }
    .title-block .doc-title { font-family: ${previewFace}; font-weight: 500; font-size: 25pt; line-height: 1.1; letter-spacing: -0.015em; margin: 0 0 0.35em; color: #111; }
    .title-block .doc-author, .title-block .doc-date { font-size: 10.5pt; color: #555; margin: 0; display: inline; }
    .title-block .doc-date::before { content: '  ·  '; white-space: pre; }
    h2.ltx-1, h3.ltx-2, h4.ltx-3 { font-family: ${previewFace}; font-weight: 500; letter-spacing: -0.012em; color: #111; border: 0; padding: 0; }
    h2.ltx-1 { font-size: 17pt; margin: 1.5em 0 0.5em; }
    h3.ltx-2 { font-size: 13.5pt; margin: 1.3em 0 0.4em; }
    h4.ltx-3 { font-size: 11.5pt; font-weight: 600; margin: 1.1em 0 0.35em; }
    table { border-top: 0.8pt solid #222; border-bottom: 0.8pt solid #222; }
    th { font-weight: 600; border-bottom: 0.5pt solid #222; }
    .ltx-captag { font-weight: 600; }
    .ltx-abstract { margin: 0 0 1.5em; padding: 0 0 0 1em; border: 0; border-left: 1.5pt solid #ccc; background: none; max-width: none; }
    .ltx-abstract-title { font-size: 9pt; font-weight: 600; text-transform: none; letter-spacing: 0; font-family: ${previewFace}; color: #555; text-align: left; margin: 0 0 0.25em; }
    .ltx-abstract-body { font-style: italic; font-size: inherit; text-align: left; font-family: ${previewFace}; color: #222; }
    .ltx-quote { margin: 0.9em 0; padding: 0 0 0 1em; border: 0; border-left: 1.5pt solid #ccc; background: none; font-style: italic; color: #333; font-size: inherit; }
    .ltx-verbatim { padding: 0.65em 0.85em; background: #f6f5f1; border: 0; border-radius: 3px; font-size: 9pt; line-height: 1.45; }
    .ltx-tt { background: #f3f1ea; padding: 0 0.2em; border-radius: 2px; }
    a[href^="http"] { text-decoration: underline; text-decoration-color: #bbb; text-underline-offset: 2px; }
  `;

  // ---- Title page (optional) ----------------------------------------------
  const cover = `
    .cover-page { height: 100%; min-height: 23cm; display: flex; flex-direction: column; justify-content: center; text-align: ${style === 'thesis' ? 'left' : 'center'}; }
    .cover-page .cover-project { font-size: 10pt; letter-spacing: 0.06em; ${style === 'article' ? 'font-variant: small-caps;' : `font-weight: 600; color: ${style === 'thesis' ? NAVY_2 : '#666'};`} margin: 0 0 1.4cm; }
    .cover-page .cover-title { text-align: inherit; font-size: ${style === 'article' ? '24.9pt' : '30pt'}; line-height: 1.18; font-weight: ${style === 'article' ? 400 : 500}; letter-spacing: ${style === 'article' ? '0' : '-0.015em'}; color: ${style === 'thesis' ? NAVY : '#000'}; margin: 0 0 0.5cm; font-family: ${style === 'article' ? CM : style === 'thesis' ? SANS : previewFace}; }
    .cover-page .cover-rule { width: ${style === 'thesis' ? '3.2cm' : '100%'}; height: 0; border-top: ${style === 'thesis' ? `3pt solid ${PANEL_EDGE}` : '0.6pt solid #000'}; margin: ${style === 'thesis' ? '0 0 0.7cm' : '0 auto 0.7cm'}; }
    .cover-page .cover-author { font-size: 14pt; margin: 0 0 0.25cm; color: ${style === 'thesis' ? NAVY_2 : '#000'}; }
    .cover-page .cover-date { font-size: 12pt; color: #333; margin: 0; }
  `;

  // ---- Summary page (several pages exported together) ---------------------
  const extras = `
    .summary-page h2 { font-size: 15pt; margin: 0 0 1em; font-weight: ${style === 'article' ? 700 : 500}; color: ${style === 'thesis' ? NAVY : '#000'}; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.9em; }
    .summary-card { padding: 0.7em 0.9em; border-top: 0.8pt solid #000; }
    .summary-label { display: block; font-size: 9pt; color: #555; }
    .summary-value { display: block; font-size: 18pt; }
    .toc-list { display: flex; flex-direction: column; gap: 0.4em; }
    .toc-item { display: flex; align-items: baseline; gap: 0.5em; }
    .toc-leader { flex: 1; border-bottom: 0.6pt dotted #777; }
  `;

  const css = `${base}${style === 'article' ? article : style === 'thesis' ? thesis : preview}${cover}${extras}`;
  return { css, margin };
}

/**
 * Builds the full standalone export HTML (title page or title block, then
 * the rendered document) in the caller's intended order. `katexCssBlock`
 * must be a complete <style> tag with KaTeX's CSS and fonts inlined - the
 * Article style sets its text in those same Computer Modern files.
 * `fontCssBlock` carries the other faces (Geist, Newsreader) for the Thesis
 * and Preview styles, also inlined; without it they fall back gracefully.
 */
export function buildNotebookExportHtml(
  pages: ExportPage[],
  options: ExportOptions,
  katexCssBlock: string,
  fontCssBlock: string = ''
): string {
  const isSingle = pages.length === 1;
  const firstPageMeta = isSingle ? parsePageMetadata(pages[0].content) : null;
  const style = pdfStyleFor(options.profile);

  // Every value below is user-authored and lands in the PDF's HTML shell as
  // markup - scrub each to plain text before interpolation.
  const safeNotebookTitle = sanitizePlainText(options.notebookTitle) || 'Notebook';
  const safeAuthor = sanitizePlainText(options.authorName) || '';
  const safeProjectName = options.projectName ? sanitizePlainText(options.projectName) : null;

  const { css: styles, margin } = getPdfStyles(
    options.profile,
    options.titleFont,
    firstPageMeta?.fontFamily || options.bodyFont,
    firstPageMeta?.fontSize,
    firstPageMeta?.fontWeight,
    firstPageMeta?.lineHeight,
    firstPageMeta?.paragraphSpacing,
    firstPageMeta?.textAlign
  );

  // \today, as LaTeX prints it: "3 November 2026".
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  let coverPageHtml = '';
  if (options.includeCover) {
    const title = isSingle ? sanitizePlainText(pages[0].title) || safeNotebookTitle : safeNotebookTitle;
    coverPageHtml = `
      <section class="cover-page">
        ${safeProjectName ? `<p class="cover-project">${safeProjectName}</p>` : ''}
        <h1 class="cover-title">${title}</h1>
        <div class="cover-rule"></div>
        ${safeAuthor ? `<p class="cover-author">${safeAuthor}</p>` : ''}
        <p class="cover-date">${today}</p>
      </section>
      <div class="page-break"></div>
    `;
  }

  let summaryPageHtml = '';
  if (!isSingle && options.includeSummary) {
    let totalImages = 0;
    let totalEquations = 0;
    pages.forEach(p => {
      totalImages += (p.content.match(/!\[.*?\]\(.*?\)/g) || []).length + (p.content.match(/<img/g) || []).length + (p.content.match(/\\(begin{figure}|image)/g) || []).length;
      totalEquations += Math.floor((p.content.match(/\$\$/g) || []).length / 2) + (p.content.match(/\\begin{(equation|align|gather|math)}/g) || []).length;
    });
    summaryPageHtml = `
      <section class="summary-page">
        <h2>Summary</h2>
        <div class="summary-grid">
          <div class="summary-card"><span class="summary-label">Sections</span><span class="summary-value">${pages.length}</span></div>
          <div class="summary-card"><span class="summary-label">Images</span><span class="summary-value">${totalImages}</span></div>
          <div class="summary-card"><span class="summary-label">Equations</span><span class="summary-value">${totalEquations}</span></div>
        </div>
      </section>
      <div class="page-break"></div>
    `;
  }

  let pagesHtml = '';
  pages.forEach((page, index) => {
    const parsedContent = parseMarkdownToHtml(page.content, pages, page.id, true);
    const pageBreak = index < pages.length - 1 ? '<div class="page-break"></div>' : '';
    const tags = page.tags && page.tags.length > 0
      ? `<p class="doc-tags">${page.tags.map(t => sanitizePlainText(t)).join(' · ')}</p>`
      : '';
    // \maketitle: on the first page unless a title page already says it.
    const titleBlock = options.includeCover && index === 0 ? '' : `
      <header class="title-block">
        ${style !== 'article' && safeProjectName ? `<p class="doc-project">${safeProjectName}</p>` : ''}
        <h1 class="doc-title">${sanitizePlainText(page.title)}</h1>
        ${safeAuthor ? `<p class="doc-author">${safeAuthor}</p>` : ''}
        <p class="doc-date">${today}</p>
        ${style === 'article' && safeProjectName ? `<p class="doc-project" style="margin:0.5em 0 0">${safeProjectName}</p>` : ''}
      </header>
    `;
    pagesHtml += `
      <article id="page-${page.id}" class="notebook-page-pdf">
        ${titleBlock}
        ${tags}
        <div class="content-body">${parsedContent}</div>
      </article>
      ${pageBreak}
    `;
  });

  const docTitle = isSingle ? `${sanitizePlainText(pages[0].title)} - ${safeNotebookTitle}` : safeNotebookTitle;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${docTitle}</title>
    ${safeAuthor ? `<meta name="author" content="${safeAuthor.replace(/"/g, '&quot;')}" />` : ''}
    ${katexCssBlock}
    ${fontCssBlock}
    <style>
      ${styles}
      @page { size: A4; margin: ${margin}; }
    </style>
  </head>
  <body class="pdf-${style}">
    ${coverPageHtml}${summaryPageHtml}${pagesHtml}
  </body>
</html>`;
}

/**
 * Chromium's print header and footer, drawn in the page margins with the
 * real page numbers (Puppeteer fills the pageNumber / totalPages spans).
 * Templates can't see the page's fonts, so `fontCss` (an inlined @font-face
 * block) is repeated inside them.
 *
 *   article  head: title in italic small caps, project right, a hairline;
 *            foot: the page number, centred - LaTeX's \pagestyle{headings}.
 *   thesis   foot: author left, n/N right in navy - the deck's footline.
 *   preview  foot: the title left, the page number right.
 */
export function buildPdfFooterTemplate(notebookTitle: string, opts: { profile?: string; author?: string; fontCss?: string } = {}): string {
  const style = pdfStyleFor(opts.profile);
  const m = pdfMargins(style);
  const title = sanitizePlainText(notebookTitle);
  const author = sanitizePlainText(opts.author || '');
  const fontCss = opts.fontCss ? `<style>${opts.fontCss}</style>` : '';
  if (style === 'article') {
    return `${fontCss}<div style="width:100%;margin:0 ${m.right} 0 ${m.left};font-family:${CM};font-size:10pt;color:#000;text-align:center;">`
      + `<span class="pageNumber"></span></div>`;
  }
  if (style === 'thesis') {
    return `${fontCss}<div style="width:100%;margin:0 ${m.right} 0 ${m.left};font-family:${SANS};font-size:7.5pt;color:${NAVY_2};display:flex;justify-content:space-between;align-items:center;">`
      + `<span>${author || title}</span><span style="color:${NAVY}"><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;
  }
  return `${fontCss}<div style="width:100%;margin:0 ${m.right} 0 ${m.left};font-family:${SERIF_PREVIEW};font-size:8pt;color:#666;display:flex;justify-content:space-between;">`
    + `<span>${title}</span><span><span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}

export function buildPdfHeaderTemplate(notebookTitle: string, opts: { profile?: string; projectName?: string | null; fontCss?: string } = {}): string {
  const style = pdfStyleFor(opts.profile);
  const m = pdfMargins(style);
  const title = sanitizePlainText(notebookTitle);
  const project = opts.projectName ? sanitizePlainText(opts.projectName) : '';
  const fontCss = opts.fontCss ? `<style>${opts.fontCss}</style>` : '';
  if (style === 'article') {
    return `${fontCss}<div style="width:100%;margin:0 ${m.right} 0 ${m.left};padding-bottom:3pt;border-bottom:0.4pt solid #000;font-family:${CM};font-size:9pt;font-style:italic;color:#000;display:flex;justify-content:space-between;">`
      + `<span style="font-variant:small-caps;letter-spacing:0.03em">${title}</span><span>${project}</span></div>`;
  }
  if (style === 'thesis') {
    return `${fontCss}<div style="width:100%;margin:0 ${m.right} 0 ${m.left};font-family:${SANS};font-size:7.5pt;color:${NAVY_2};display:flex;justify-content:space-between;padding-bottom:3pt;border-bottom:0.75pt solid ${PANEL_EDGE};">`
      + `<span>${title}</span><span>${project}</span></div>`;
  }
  return `${fontCss}<div style="width:100%;margin:0 ${m.right} 0 ${m.left};font-family:${SERIF_PREVIEW};font-size:8pt;color:#888;text-align:right;">${project || title}</div>`;
}
