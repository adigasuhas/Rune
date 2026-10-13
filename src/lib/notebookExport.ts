/**
 * Shared, isomorphic (client + server) helpers for turning notebook pages into
 * exportable HTML. Used by the live preview pane and by the server-side
 * Puppeteer PDF export route, so both stay visually consistent.
 */
import { parseLatexToHtml } from './latex/renderer';
import { sanitizeNotebookHtml, sanitizePlainText } from './sanitizeHtml';

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
  profile: 'daily' | 'full' | 'research' | 'minimal';
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

export function getPdfStyles(
  profile: string,
  titleFont: string,
  bodyFont: string,
  fontSize: string = '11pt',
  fontWeight: string = '400',
  lineHeight: string = '1.6',
  paragraphSpacing: string = '1.2rem',
  textAlign: string = 'left'
): { css: string; margin: string } {
  // Font names are interpolated into a <style> block - allow only a plain
  // family token so a crafted value can't break out of the declaration.
  const cleanFont = (f: string, fallback: string) => (FONT_FAMILY.test((f || '').trim()) ? f.trim() : fallback);
  const titleFamily = `'${cleanFont(titleFont, 'Raleway')}', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const bodyFamily = `'${cleanFont(bodyFont, 'Inter')}', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  let margin = '2.5cm';
  const baseStyles = `
    body {
      font-family: ${bodyFamily};
      color: #1f2937;
      background-color: #ffffff;
      line-height: ${lineHeight};
      font-size: ${fontSize === '1rem' ? '11pt' : fontSize};
      font-weight: ${fontWeight};
      text-align: ${textAlign};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: ${titleFamily};
      color: #111827;
      font-weight: 700;
      page-break-after: avoid;
    }
    p {
      margin-bottom: ${paragraphSpacing};
    }
    code, pre {
      font-family: courier, Courier, monospace !important;
    }
    .page-break-inside-avoid {
      page-break-inside: avoid;
    }
  `;

  let customStyles = '';

  if (profile === 'research') {
    margin = '2cm';
    customStyles = `
      h1, .ltx-1 { font-size: 22pt; font-family: ${titleFamily}; font-weight: 800; border-bottom: 2px solid #111; padding-bottom: 8px; margin-top: 35px; margin-bottom: 18px; text-transform: uppercase; letter-spacing: 0.05em; }
      h2:not(.ltx-1), .ltx-2 { font-size: 16pt; font-family: ${titleFamily}; font-weight: 700; border-bottom: 1px solid #4b5563; padding-bottom: 4px; margin-top: 28px; margin-bottom: 14px; }
      h3:not(.ltx-2), .ltx-3 { font-size: 13pt; font-family: ${titleFamily}; font-weight: 600; margin-top: 22px; margin-bottom: 10px; }
      blockquote {
        border-left: 3.5px solid #111827;
        padding: 8px 16px;
        margin: 18px 0;
        font-style: italic;
        color: #374151;
        background-color: #f9fafb;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 25px 0;
        font-size: 10pt;
      }
      th {
        border-top: 2px solid #111;
        border-bottom: 1.5px solid #111;
        padding: 10px 12px;
        font-weight: bold;
        text-align: left;
        background-color: #f3f4f6;
      }
      td {
        border-bottom: 1px solid #e5e7eb;
        padding: 8px 12px;
      }
      tr:last-child td {
        border-bottom: 2px solid #111;
      }
      pre {
        background-color: #f3f4f6;
        border-left: 3px solid #6b7280;
        font-family: monospace;
        padding: 12px;
        margin: 15px 0;
        font-size: 9.5pt;
        overflow-x: auto;
        border-radius: 4px;
      }
    `;
  } else if (profile === 'minimal') {
    margin = '1.8cm';
    customStyles = `
      h1, .ltx-1 { font-size: 20pt; font-family: ${titleFamily}; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-top: 24px; margin-bottom: 12px; }
      h2:not(.ltx-1), .ltx-2 { font-size: 15pt; font-family: ${titleFamily}; margin-top: 20px; margin-bottom: 10px; }
      h3:not(.ltx-2), .ltx-3 { font-size: 12pt; font-family: ${titleFamily}; margin-top: 16px; margin-bottom: 8px; }
      blockquote {
        border-left: 2px solid #d1d5db;
        padding-left: 12px;
        margin: 15px 0;
        color: #6b7280;
        font-style: italic;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 15px 0;
      }
      th {
        border-bottom: 1px solid #d1d5db;
        padding: 6px;
        font-weight: bold;
        text-align: left;
      }
      td {
        border-bottom: 1px solid #f3f4f6;
        padding: 6px;
      }
      pre {
        background-color: #fafafa;
        border: 1px solid #e5e7eb;
        padding: 10px;
        font-size: 9pt;
        border-radius: 4px;
      }
    `;
  } else {
    margin = '2.5cm';
    customStyles = `
      h1, .ltx-1 { font-size: 24pt; font-family: ${titleFamily}; font-weight: 700; color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; margin-top: 30px; margin-bottom: 15px; }
      h2:not(.ltx-1), .ltx-2 { font-size: 18pt; font-family: ${titleFamily}; font-weight: 600; color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-top: 24px; margin-bottom: 12px; }
      h3:not(.ltx-2), .ltx-3 { font-size: 14pt; font-family: ${titleFamily}; font-weight: 600; color: #1e3a8a; margin-top: 18px; margin-bottom: 10px; }
      blockquote {
        background-color: #eff6ff;
        border-left: 4px solid #3b82f6;
        padding: 12px 18px;
        margin: 20px 0;
        border-radius: 0 6px 6px 0;
        font-style: italic;
        color: #1e40af;
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        margin: 20px 0;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #e5e7eb;
      }
      th {
        background-color: #f0f4ff;
        color: #1e3a8a;
        padding: 10px 14px;
        font-weight: bold;
        text-align: left;
        border-bottom: 1px solid #e5e7eb;
      }
      td {
        border-bottom: 1px solid #e5e7eb;
        padding: 10px 14px;
      }
      tr:last-child td {
        border-bottom: none;
      }
      pre {
        background-color: #1e293b;
        color: #f8fafc;
        border-radius: 8px;
        padding: 14px;
        margin: 18px 0;
        font-size: 9.5pt;
        overflow-x: auto;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.06);
      }
    `;
  }

  const css = `
    ${baseStyles}
    ${customStyles}

    .page-break {
      page-break-before: always;
    }

    .meta {
      font-size: 9.5pt;
      color: #6b7280;
      font-family: monospace;
      margin-bottom: 20px;
      border-bottom: 1px solid #f3f4f6;
      padding-bottom: 8px;
    }
    .meta-item {
      margin-right: 15px;
    }

    img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      margin: 15px auto;
      display: block;
      page-break-inside: avoid;
    }

    .page-header-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 6px;
      margin-bottom: 25px;
      font-size: 8.5pt;
      color: #6b7280;
      font-family: ${bodyFamily};
    }

    .page-footer-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #e5e7eb;
      padding-top: 6px;
      margin-top: 35px;
      font-size: 8.5pt;
      color: #6b7280;
      font-family: ${bodyFamily};
    }

    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 90vh;
      text-align: center;
      font-family: ${bodyFamily};
      padding: 3cm 2cm;
      box-sizing: border-box;
    }

    .cover-top {
      margin-top: 10vh;
    }

    .cover-title {
      font-family: ${titleFamily};
      font-size: 30pt;
      font-weight: 800;
      margin-bottom: 15px;
      color: #111827;
      line-height: 1.25;
    }

    .cover-subtitle {
      font-size: 15pt;
      color: #4b5563;
      margin-bottom: 40px;
      font-weight: 300;
      letter-spacing: 0.05em;
    }

    .cover-meta {
      font-size: 10pt;
      color: #4b5563;
      border-top: 1.5px solid #d1d5db;
      padding-top: 25px;
      width: 70%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      line-height: 1.5;
    }

    .table-of-contents {
      padding: 2cm 1cm;
      font-family: ${bodyFamily};
    }
    .toc-title {
      font-family: ${titleFamily};
      font-size: 22pt;
      font-weight: 800;
      margin-bottom: 30px;
      text-align: left;
      border-bottom: 2px solid #111827;
      padding-bottom: 10px;
    }
    .toc-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .toc-item {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      font-size: 11pt;
    }
    .toc-name {
      font-weight: 600;
      color: #111827;
    }
    .toc-leader {
      flex-grow: 1;
      border-bottom: 1px dotted #9ca3af;
      margin: 0 10px;
    }
    .toc-page {
      color: #4b5563;
      font-family: monospace;
    }

    .summary-page {
      padding: 2cm 1cm;
      font-family: ${bodyFamily};
    }
    .summary-title {
      font-family: ${titleFamily};
      font-size: 22pt;
      font-weight: 800;
      margin-bottom: 30px;
      text-align: left;
      border-bottom: 2px solid #111827;
      padding-bottom: 10px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 20px;
    }
    .summary-card {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .summary-label {
      font-size: 9pt;
      text-transform: uppercase;
      color: #6b7280;
      font-weight: bold;
      letter-spacing: 0.05em;
    }
    .summary-value {
      font-size: 16pt;
      font-weight: 700;
      color: #111827;
    }
  `;

  return { css, margin };
}

/**
 * Builds the full standalone export HTML (cover/summary/TOC + rendered pages)
 * for one or more notebook pages, already in the caller's intended order.
 * `katexCssBlock` should be a complete <style> or <link> tag string — the
 * caller controls whether that's CDN-based (unused now) or fully inlined
 * (the PDF export route inlines it so the export works offline).
 */
export function buildNotebookExportHtml(
  pages: ExportPage[],
  options: ExportOptions,
  katexCssBlock: string
): string {
  const isSingle = pages.length === 1;
  const firstPageMeta = isSingle ? parsePageMetadata(pages[0].content) : null;

  // Every value below is user-authored and lands in the PDF's HTML shell as
  // markup - scrub each to plain text before interpolation.
  const safeNotebookTitle = sanitizePlainText(options.notebookTitle) || 'Notebook';
  const safeAuthor = sanitizePlainText(options.authorName) || 'Unknown author';
  const safeProjectName = options.projectName ? sanitizePlainText(options.projectName) : null;

  const { css: styles, margin } = getPdfStyles(
    options.profile,
    firstPageMeta?.fontFamily || options.titleFont,
    firstPageMeta?.fontFamily || options.bodyFont,
    firstPageMeta?.fontSize,
    firstPageMeta?.fontWeight,
    firstPageMeta?.lineHeight,
    firstPageMeta?.paragraphSpacing,
    firstPageMeta?.textAlign
  );

  const sortedPages = pages;

  const projectLabel = safeProjectName ? safeProjectName.toUpperCase() : 'PERSONAL';

  let coverPageHtml = '';
  const includeCover = options.includeCover || (!isSingle && options.profile === 'research');
  if (includeCover) {
    const todayDate = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const subtitle = isSingle
      ? sanitizePlainText(pages[0].title)
      : (options.profile === 'research' ? 'Research report' : 'Notebook export');

    coverPageHtml = `
      <div class="cover-page">
        <div class="cover-top">
          <h1 class="cover-title">${safeNotebookTitle.toUpperCase()}</h1>
          <p class="cover-subtitle">${subtitle}</p>
        </div>
        <div class="cover-meta">
          ${safeProjectName ? `<div><strong>Project:</strong> ${safeProjectName}</div>` : ''}
          <div><strong>Author:</strong> ${safeAuthor}</div>
          <div><strong>Exported:</strong> ${todayDate}</div>
          <div style="margin-top: 15px; font-size: 8.5pt; color: #9ca3af; font-family: monospace;">Generated by Rune</div>
        </div>
      </div>
      <div class="page-break"></div>
    `;
  }

  let summaryPageHtml = '';
  if (!isSingle && options.includeSummary) {
    let totalImages = 0;
    let totalEquations = 0;
    sortedPages.forEach(p => {
      const markdownImages = (p.content.match(/!\[.*?\]\(.*?\)/g) || []).length;
      const htmlImages = (p.content.match(/<img/g) || []).length;
      const latexImages = (p.content.match(/\\(begin{figure}|image)/g) || []).length;
      totalImages += markdownImages + htmlImages + latexImages;

      const displayMath = (p.content.match(/\$\$/g) || []).length / 2;
      const latexEqs = (p.content.match(/\\begin{(equation|align|gather|math)}/g) || []).length;
      totalEquations += Math.floor(displayMath) + latexEqs;
    });

    summaryPageHtml = `
      <div class="summary-page">
        <h2 class="summary-title">Summary</h2>
        <div class="summary-grid">
          <div class="summary-card">
            <span class="summary-label">Sections</span>
            <span class="summary-value">${sortedPages.length}</span>
          </div>
          <div class="summary-card">
            <span class="summary-label">Images</span>
            <span class="summary-value">${totalImages}</span>
          </div>
          <div class="summary-card">
            <span class="summary-label">Equations</span>
            <span class="summary-value">${totalEquations}</span>
          </div>
        </div>
      </div>
      <div class="page-break"></div>
    `;
  }

  let tocPageHtml = '';
  if (!isSingle && options.profile === 'research') {
    const tocOffset = options.includeSummary ? 1 : 0;
    tocPageHtml = `
      <div class="table-of-contents">
        <h2 class="toc-title">Contents</h2>
        <div class="toc-list">
          ${sortedPages.map((p, idx) => `
            <div class="toc-item">
              <span class="toc-name">${sanitizePlainText(p.title)}</span>
              <span class="toc-leader"></span>
              <span class="toc-page">Page ${idx + 1 + tocOffset}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="page-break"></div>
    `;
  }

  let pagesHtml = '';
  sortedPages.forEach((page, index) => {
    const parsedContent = parseMarkdownToHtml(page.content, sortedPages, page.id, true);
    const pageBreak = index < sortedPages.length - 1 ? '<div class="page-break"></div>' : '';

    const headerHtml = options.includeHeader ? `
      <div class="page-header-container">
        <span>PROJECT: ${projectLabel}</span>
      </div>
    ` : '';

    const footerHtml = options.includeFooter ? `
      <div class="page-footer-container">
        <span></span>
        <span>Page ${index + 1} of ${sortedPages.length}</span>
      </div>
    ` : '';

    const metaHtml = (page.tags && page.tags.length > 0)
      ? `<div class="meta"><span class="meta-item"><strong>Tags:</strong> ${page.tags.map(t => '#' + sanitizePlainText(t)).join(', ')}</span></div>`
      : '';

    pagesHtml += `
      <div id="page-${page.id}" class="notebook-page-pdf">
        ${headerHtml}
        <h1>${sanitizePlainText(page.title)}</h1>
        ${metaHtml}
        <div class="content-body">${parsedContent}</div>
        ${footerHtml}
      </div>
      ${pageBreak}
    `;
  });

  const docTitle = isSingle ? `${sanitizePlainText(pages[0].title)} - Rune notebook` : `${safeNotebookTitle} - Rune notebook`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${docTitle}</title>
        ${katexCssBlock}
        <style>
          ${styles}
          @page {
            size: A4;
            margin: ${margin};
          }
        </style>
      </head>
      <body>
        ${coverPageHtml}${summaryPageHtml}${tocPageHtml}${pagesHtml}
      </body>
    </html>
  `;
}
