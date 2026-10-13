import katex from 'katex';
import { parseLatex } from './parser';

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
      
      const rendered = katex.renderToString(mathExpr, katexOptions);

      const borderClass = isPdfExport 
        ? 'border-y border-[#e5e7eb] bg-slate-50/10' 
        : 'border-y border-border bg-surface-sunken/60';
      const labelClass = isPdfExport 
        ? 'text-[9pt] font-bold text-gray-500 font-sans' 
        : 'text-[10px] font-bold text-ink-secondary tracking-wider uppercase font-mono';

      return `
        <div class="my-6 py-4 px-6 ${borderClass} flex flex-col items-center relative gap-2 page-break-inside-avoid">
          ${tagValue && !nameClean.endsWith('*') ? `<div class="${labelClass}">Equation (${tagValue})</div>` : ''}
          <div class="w-full overflow-x-auto py-2 flex justify-center">${rendered}</div>
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
    
    // Extract caption
    const captionMatch = content.match(/\\caption\{([^}]+)\}/);
    const captionText = captionMatch ? captionMatch[1] : '';
    
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
      <div class="my-6 p-4 rounded-md ${borderClass} flex flex-col items-center gap-4 page-break-inside-avoid">
        ${imgUrl ? `<img src="${imgUrl}" alt="${captionText}" class="max-h-96 w-auto object-contain rounded-md" />` : '<div class="text-ink-secondary text-xs italic">[No Image Specified]</div>'}
        ${captionText ? `
          <div class="text-center ${capClass} max-w-lg leading-relaxed">
            <span class="${tagClass}">Figure ${tagValue || ''}:</span> ${captionText}
          </div>
        ` : ''}
      </div>
    `;
  }

  // 3. Table Environment
  if (nameClean === 'table' || nameClean === 'table*') {
    // Extract caption
    const captionMatch = content.match(/\\caption\{([^}]+)\}/);
    const captionText = captionMatch ? captionMatch[1] : '';

    // Extract label
    const { tagValue } = extractLabelTag(content, labelMap);

    // Extract tabular block
    const tabularMatch = content.match(/\\begin\{tabular\}\{([^}]+)\}([\s\S]*?)\\end\{tabular\}/);
    const tabularCols = tabularMatch ? tabularMatch[1] : '';
    const tabularBody = tabularMatch ? tabularMatch[2] : content;

    const renderedTable = renderTabular(tabularBody, tabularCols, isPdfExport);

    const borderClass = isPdfExport ? 'border border-[#e5e7eb]' : 'border border-border bg-surface-sunken/40';
    const capClass = isPdfExport ? 'text-[9.5pt] text-gray-600 font-sans' : 'text-xs text-ink-secondary font-light';
    const tagClass = isPdfExport ? 'font-bold text-gray-800' : 'font-bold text-foreground';

    return `
      <div class="my-6 p-4 rounded-md ${borderClass} flex flex-col items-center gap-4 page-break-inside-avoid">
        ${captionText ? `
          <div class="text-center ${capClass} max-w-lg leading-relaxed">
            <span class="${tagClass}">Table ${tagValue || ''}:</span> ${captionText}
          </div>
        ` : ''}
        <div class="w-full overflow-x-auto flex justify-center">${renderedTable}</div>
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
          <div class="mb-3">
            <dt class="font-bold text-foreground">${label}</dt>
            <dd class="pl-4 text-ink-secondary">${renderedInner}</dd>
          </div>
        `;
      }
      return `<li class="mb-1.5 text-foreground leading-relaxed">${renderedInner}</li>`;
    }).join('\n');

    if (nameClean === 'itemize') {
      return `<ul class="list-disc pl-6 my-4 space-y-1">${renderedItems}</ul>`;
    } else if (nameClean === 'enumerate') {
      return `<ol class="list-decimal pl-6 my-4 space-y-1">${renderedItems}</ol>`;
    } else {
      return `<dl class="my-4 space-y-2">${renderedItems}</dl>`;
    }
  }

  // 5. Verbatim Environment
  if (nameClean === 'verbatim') {
    return `<pre class="bg-surface-sunken border border-border rounded-md p-4 my-4 overflow-x-auto font-mono text-xs text-foreground"><code>${content}</code></pre>`;
  }

  // 6. Quote Environment
  if (nameClean === 'quote') {
    const quoteClass = isPdfExport 
      ? 'border-l-4 border-gray-300 bg-gray-50 text-gray-700' 
      : 'border-l-4 border-border bg-surface-sunken text-foreground';
    return `
      <blockquote class="my-4 py-3 pl-5 pr-4 rounded-r-md italic text-sm ${quoteClass} leading-relaxed">
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
      <div class="my-6 p-6 rounded-md ${abstractClass} max-w-2xl mx-auto">
        <h4 class="text-xs font-bold uppercase tracking-widest text-center text-ink-secondary mb-3 font-mono">Abstract</h4>
        <div class="italic text-sm text-foreground leading-relaxed text-justify font-serif">
          ${renderNodes(parseLatex(content))}
        </div>
      </div>
    `;
  }

  // Fallback for custom or unhandled environments
  return `
    <div class="my-4 p-4 border border-border rounded-md bg-surface-sunken/60">
      <div class="text-[10px] font-bold text-ink-secondary uppercase tracking-widest font-mono mb-2">Environment: ${name}</div>
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

function renderTabular(body: string, cols: string, isPdfExport: boolean): string {
  const rows = body.split('\\\\');
  const columnAligns = parseColumnAlignments(cols);

  const thClass = isPdfExport
    ? 'bg-slate-100 text-gray-800 font-bold border-b border-gray-300'
    : 'bg-surface-sunken text-foreground font-semibold border-b border-border';
  const tdClass = isPdfExport
    ? 'border-b border-gray-200 text-gray-700'
    : 'border-b border-border text-foreground';

  let html = `<table class="min-w-[50%] border-collapse border-spacing-0 my-2 text-xs text-left font-light rounded-md overflow-hidden">`;

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
        html += `<th class="${thClass} p-3"${styleAttr}${colspanAttr}>${cellContent}</th>`;
      } else {
        html += `<td class="${tdClass} p-3"${styleAttr}${colspanAttr}>${cellContent}</td>`;
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

function splitListItems(content: string): ListItem[] {
  const items: ListItem[] = [];
  
  // Find all \item tokens
  let ptr = 0;
  while (ptr < content.length) {
    const idx = content.indexOf('\\item', ptr);
    if (idx === -1) break;
    
    let itemStart = idx + 5; // Skip '\item'
    
    // Check if there is an optional label like \item[label]
    let label: string | undefined;
    if (content[itemStart] === '[') {
      const bracketEnd = content.indexOf(']', itemStart);
      if (bracketEnd !== -1) {
        label = content.substring(itemStart + 1, bracketEnd);
        itemStart = bracketEnd + 1;
      }
    }
    
    // Scan until next \item or end of environment
    const nextIdx = content.indexOf('\\item', itemStart);
    const itemText = nextIdx === -1 
      ? content.substring(itemStart) 
      : content.substring(itemStart, nextIdx);
    
    items.push({
      label,
      text: itemText.trim()
    });
    
    ptr = itemStart;
  }
  
  return items;
}
