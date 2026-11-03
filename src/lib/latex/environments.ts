import { renderMathCached } from './katexCache';
import { parseLatex } from './parser';
import { commandArg, latexToPlainText } from './inline';

/**
 * Finds the first \label{...} in `content`, looks up its number in `labelMap`,
 * and returns the resolved tag (e.g. "3") plus the content with that \label
 * command stripped out. Shared by the math/figure/table environment renderers
 * below instead of each re-implementing the same match+lookup+strip logic.
 */
function extractLabelTag(content: string, labelMap: Record<string, any>): { tagValue: string; cleaned: string } {
  const labelMatch = content.match(/\\label\{([a-zA-Z0-9_\-:]+)\}/);
  if (!labelMatch) {
    return { tagValue: '', cleaned: content };
  }
  const label = labelMap[labelMatch[1]];
  const tagValue = label ? String(label.num) : '';
  const cleaned = content.replace(/\\label\{[^}]+\}/g, '');
  return { tagValue, cleaned };
}

export function renderEnvironment(
  name: string,
  content: string,
  args: string[],
  labelMap: Record<string, any>,
  isPdfExport: boolean,
  renderNodes: (nodes: any[]) => string
): string {
  const nameClean = name.toLowerCase().trim();
  // Captions, list labels and table cells are LaTeX too: math and
  // formatting inside them typeset like anywhere else.
  const inline = (src: string) => renderNodes(parseLatex(src));

  // 1. Math Environments
  const mathEnvs = ['equation', 'align', 'gather', 'cases', 'matrix', 'pmatrix', 'align*', 'gather*', 'equation*'];
  if (mathEnvs.includes(nameClean)) {
    const { tagValue, cleaned: eqContentCleaned } = extractLabelTag(content.trim(), labelMap);
    let eqContent = eqContentCleaned;

    try {
      const katexOptions: any = {
        displayMode: true,
        throwOnError: false,
        trust: true
      };
      
      if (tagValue && !nameClean.endsWith('*')) {
        eqContent = `${eqContent} \\tag{${tagValue}}`;
      }
      
      // Wrap in corresponding amsmath environment if it doesn't already have it
      let mathExpr = eqContent;
      if (nameClean !== 'equation' && nameClean !== 'equation*') {
        mathExpr = `\\begin{${nameClean}}${eqContent}\\end{${nameClean}}`;
      }
      
      const rendered = renderMathCached(mathExpr, katexOptions);

      const borderClass = isPdfExport 
        ? 'border-y border-[#e5e7eb] bg-slate-50/10' 
        : 'border-y border-border bg-surface-sunken/60';
      const labelClass = isPdfExport 
        ? 'text-[9pt] font-bold text-gray-500 font-sans' 
        : 'text-[10px] font-bold text-ink-secondary tracking-wider uppercase font-mono';

      return `
        <div class="ltx-equation my-6 py-4 px-6 ${borderClass} flex flex-col items-center relative gap-2 page-break-inside-avoid">
          ${tagValue && !nameClean.endsWith('*') ? `<div class="ltx-eqlabel ${labelClass}">Equation (${tagValue})</div>` : ''}
          <div class="ltx-math w-full overflow-x-auto py-2 text-center">${rendered}</div>
        </div>
      `;
    } catch (err) {
      console.error(`KaTeX Environment (${nameClean}) Render Error:`, err);
      return `<div class="text-danger font-bold p-3 border border-danger my-4 rounded-md">Error rendering math environment \\begin{${name}}: ${content}</div>`;
    }
  }

  // 2. Figure Environment
  if (nameClean === 'figure' || nameClean === 'figure*') {
    // Extract \includegraphics
    const imgMatch = content.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/);
    const imgUrl = imgMatch ? imgMatch[1] : '';
    
    // Brace-balanced, so a caption like "Crystal of $\text{Cs}_3$" isn't cut short.
    const captionText = commandArg(content, 'caption');
    const altText = escapeAttr(latexToPlainText(captionText));

    // Extract label
    const { tagValue } = extractLabelTag(content, labelMap);

    const borderClass = isPdfExport
      ? 'border border-[#e5e7eb] bg-white'
      : 'border border-border bg-surface-sunken/50';
    const capClass = isPdfExport
      ? 'text-[9.5pt] text-gray-600 font-sans'
      : 'text-xs text-ink-secondary font-light';
    const tagClass = isPdfExport
      ? 'font-bold text-gray-800'
      : 'font-bold text-foreground';

    return `
      <div class="ltx-figure my-6 p-4 rounded-md ${borderClass} flex flex-col items-center gap-4 page-break-inside-avoid">
        ${imgUrl ? `<img src="${imgUrl}" alt="${altText}" class="ltx-img max-h-96 w-auto object-contain rounded-md" />` : '<div class="text-ink-secondary text-xs italic">[No Image Specified]</div>'}
        ${captionText ? `
          <div class="ltx-caption text-center ${capClass} max-w-lg leading-relaxed">
            <span class="ltx-captag ${tagClass}">Figure ${tagValue || ''}:</span> ${inline(captionText)}
          </div>
        ` : ''}
      </div>
    `;
  }

  // 3. Table Environment
  if (nameClean === 'table' || nameClean === 'table*') {
    const captionText = commandArg(content, 'caption');

    // Extract label
    const { tagValue } = extractLabelTag(content, labelMap);

    // Extract tabular block
    const tabularMatch = content.match(/\\begin\{tabular\}\{([^}]+)\}([\s\S]*?)\\end\{tabular\}/);
    const tabularCols = tabularMatch ? tabularMatch[1] : '';
    const tabularBody = tabularMatch ? tabularMatch[2] : content;

    const renderedTable = renderTabular(tabularBody, tabularCols, isPdfExport, inline);

    const borderClass = isPdfExport ? 'border border-[#e5e7eb]' : 'border border-border bg-surface-sunken/40';
    const capClass = isPdfExport ? 'text-[9.5pt] text-gray-600 font-sans' : 'text-xs text-ink-secondary font-light';
    const tagClass = isPdfExport ? 'font-bold text-gray-800' : 'font-bold text-foreground';

    return `
      <div class="ltx-table my-6 p-4 rounded-md ${borderClass} flex flex-col items-center gap-4 page-break-inside-avoid">
        ${captionText ? `
          <div class="ltx-caption text-center ${capClass} max-w-lg leading-relaxed">
            <span class="ltx-captag ${tagClass}">Table ${tagValue || ''}:</span> ${inline(captionText)}
          </div>
        ` : ''}
        <div class="ltx-tabular-wrap w-full overflow-x-auto flex justify-center">${renderedTable}</div>
      </div>
    `;
  }

  // 4. List Environments: itemize / enumerate / description
  if (nameClean === 'itemize' || nameClean === 'enumerate' || nameClean === 'description') {
    // Split content by \item
    const items = splitListItems(content);
    
    const renderedItems = items.map(item => {
      const itemContent = item.text.trim();
      const renderedInner = renderNodes(parseLatex(itemContent));
      
      if (nameClean === 'description') {
        const label = item.label || '';
        return `
          <div class="ltx-ditem mb-3">
            <dt class="font-bold text-foreground">${inline(label)}</dt>
            <dd class="pl-4 text-ink-secondary">${renderedInner}</dd>
          </div>
        `;
      }
      return `<li class="mb-1.5 text-foreground leading-relaxed">${renderedInner}</li>`;
    }).join('\n');

    if (nameClean === 'itemize') {
      return `<ul class="ltx-list list-disc pl-6 my-4 space-y-1">${renderedItems}</ul>`;
    } else if (nameClean === 'enumerate') {
      return `<ol class="ltx-list list-decimal pl-6 my-4 space-y-1">${renderedItems}</ol>`;
    } else {
      return `<dl class="ltx-description my-4 space-y-2">${renderedItems}</dl>`;
    }
  }

  // 5. Verbatim Environment
  if (nameClean === 'verbatim') {
    return `<pre class="ltx-verbatim bg-surface-sunken border border-border rounded-md p-4 my-4 overflow-x-auto font-mono text-xs text-foreground"><code>${content.replace(/^[ \t]*\r?\n/, '').replace(/\s+$/, '')}</code></pre>`;
  }

  // 6. Quote Environment
  if (nameClean === 'quote') {
    const quoteClass = isPdfExport 
      ? 'border-l-4 border-gray-300 bg-gray-50 text-gray-700' 
      : 'border-l-4 border-border bg-surface-sunken text-foreground';
    return `
      <blockquote class="ltx-quote my-4 py-3 pl-5 pr-4 rounded-r-md italic text-sm ${quoteClass} leading-relaxed">
        ${renderNodes(parseLatex(content))}
      </blockquote>
    `;
  }

  // 7. Abstract Environment
  if (nameClean === 'abstract') {
    const abstractClass = isPdfExport 
      ? 'border border-[#e5e7eb] bg-slate-50/20' 
      : 'border border-border bg-surface-sunken/40';
    return `
      <div class="ltx-abstract my-6 p-6 rounded-md ${abstractClass} max-w-2xl mx-auto">
        <h4 class="ltx-abstract-title text-xs font-bold uppercase tracking-widest text-center text-ink-secondary mb-3 font-mono">Abstract</h4>
        <div class="ltx-abstract-body italic text-sm text-foreground leading-relaxed text-justify font-serif">
          ${renderNodes(parseLatex(content))}
        </div>
      </div>
    `;
  }

  // Fallback for custom or unhandled environments
  return `
    <div class="ltx-env my-4 p-4 border border-border rounded-md bg-surface-sunken/60">
      <div class="ltx-env-name text-[10px] font-bold text-ink-secondary uppercase tracking-widest font-mono mb-2"><span class="ltx-env-kind">Environment: </span><span class="ltx-env-title">${escapeAttr(name)}</span></div>
      ${renderNodes(parseLatex(content))}
    </div>
  `;
}

/** Parses a `{l|c|r}`-style column spec into per-column CSS text-align values. */
function parseColumnAlignments(cols: string): Array<'left' | 'center' | 'right'> {
  const aligns: Array<'left' | 'center' | 'right'> = [];
  for (const ch of cols) {
    if (ch === 'l') aligns.push('left');
    else if (ch === 'c') aligns.push('center');
    else if (ch === 'r') aligns.push('right');
    // '|', spaces, p{...}/m{...}/b{...} width specs etc. are ignored (not column letters)
  }
  return aligns;
}

/** Splits a table row on unescaped '&', treating '\&' as a literal ampersand. */
function splitTableCells(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '&' && row[i - 1] === '\\') {
      current = current.slice(0, -1) + '&';
    } else if (row[i] === '&') {
      cells.push(current);
      current = '';
    } else {
      current += row[i];
    }
  }
  cells.push(current);
  return cells;
}

function renderTabular(body: string, cols: string, isPdfExport: boolean, inline: (src: string) => string): string {
  const rows = body.split('\\\\');
  const columnAligns = parseColumnAlignments(cols);

  const thClass = isPdfExport
    ? 'bg-slate-100 text-gray-800 font-bold border-b border-gray-300'
    : 'bg-surface-sunken text-foreground font-semibold border-b border-border';
  const tdClass = isPdfExport
    ? 'border-b border-gray-200 text-gray-700'
    : 'border-b border-border text-foreground';

  let html = `<table class="ltx-tabular min-w-[50%] border-collapse border-spacing-0 my-2 text-xs text-left font-light rounded-md overflow-hidden">`;

  let isFirstRow = true;
  rows.forEach(row => {
    // Strip \hline and \cline{m-n} row-rule commands (previously only \hline was stripped).
    const cleanRow = row.replace(/\\cline\{[^}]*\}/g, '').replace(/\\hline/g, '').trim();
    if (!cleanRow) return;

    const rawCells = splitTableCells(cleanRow);
    html += `<tr>`;

    let colIndex = 0;
    rawCells.forEach(cell => {
      let cellContent = cell.trim();
      let colspan = 1;
      let alignOverride: 'left' | 'center' | 'right' | undefined;

      // \multicolumn{n}{align}{content} — colspan with its own alignment override.
      const multicolMatch = cellContent.match(/^\\multicolumn\{(\d+)\}\{([^}]*)\}\{([\s\S]*)\}$/);
      if (multicolMatch) {
        colspan = parseInt(multicolMatch[1], 10) || 1;
        const spec = multicolMatch[2];
        if (spec.includes('c')) alignOverride = 'center';
        else if (spec.includes('r')) alignOverride = 'right';
        else if (spec.includes('l')) alignOverride = 'left';
        cellContent = multicolMatch[3].trim();
      }

      const align = alignOverride || columnAligns[colIndex] || columnAligns[columnAligns.length - 1];
      const styleAttr = align && align !== 'left' ? ` style="text-align:${align};"` : '';
      const colspanAttr = colspan > 1 ? ` colspan="${colspan}"` : '';

      if (isFirstRow) {
        html += `<th class="ltx-th ${thClass} p-3"${styleAttr}${colspanAttr}>${inline(cellContent)}</th>`;
      } else {
        html += `<td class="ltx-td ${tdClass} p-3"${styleAttr}${colspanAttr}>${inline(cellContent)}</td>`;
      }
      colIndex += colspan;
    });

    html += `</tr>`;
    isFirstRow = false;
  });

  html += `</table>`;
  return html;
}

interface ListItem {
  label?: string;
  text: string;
}

/**
 * Offsets of this list's own `\item`s: those outside any nested
 * \begin{...}...\end{...} (an itemize inside an enumerate keeps its items),
 * and not the start of a longer command such as `\itemsep`.
 */
function topLevelItemOffsets(content: string): number[] {
  const offsets: number[] = [];
  const re = /\\(begin|end)\s*\{[^}]*\}|\\item(?![a-zA-Z])|\\\\|\\./g;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1] === 'begin') depth++;
    else if (m[1] === 'end') depth = Math.max(0, depth - 1);
    else if (depth === 0 && m[0] === '\\item') offsets.push(m.index);
  }
  return offsets;
}

function splitListItems(content: string): ListItem[] {
  const offsets = topLevelItemOffsets(content);

  return offsets.map((idx, i) => {
    let itemStart = idx + 5; // Skip '\item'
    const itemEnd = i + 1 < offsets.length ? offsets[i + 1] : content.length;

    // Optional label: \item[label], skipping brackets inside braces (\item[{[a]}]).
    let label: string | undefined;
    let p = itemStart;
    while (p < itemEnd && (content[p] === ' ' || content[p] === '\t')) p++;
    if (content[p] === '[') {
      let braces = 0;
      for (let j = p + 1; j < itemEnd; j++) {
        const ch = content[j];
        if (ch === '\\') { j++; continue; }
        if (ch === '{') braces++;
        else if (ch === '}') braces = Math.max(0, braces - 1);
        else if (ch === ']' && braces === 0) {
          label = content.substring(p + 1, j);
          itemStart = j + 1;
          break;
        }
      }
    }

    return { label, text: content.substring(itemStart, itemEnd).trim() };
  });
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
