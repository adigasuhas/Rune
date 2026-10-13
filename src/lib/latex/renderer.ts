import { renderMathCached } from './katexCache';
import { parseLatex, LatexNode } from './parser';
import { buildLabelMap, LabelMap } from './crossref';
import { renderEnvironment } from './environments';
import { parseBibtex, formatCitation, extractBibliographyContent } from './bibliography';

export function parseLatexToHtml(
  latex: string,
  pagesArray: any[] = [],
  currentPageId: string = '',
  isPdfExport: boolean = false,
  runsMap: Record<string, { name: string; status: string }> = {}
): string {
  if (!latex) return '';

  // 1. Build label map for cross-referencing
  const labelMap = buildLabelMap(pagesArray);

  // 2. Extract and parse bibliography if references.bib page exists
  const bibtexContent = extractBibliographyContent(pagesArray);
  const bibEntries = parseBibtex(bibtexContent);

  // 3. Track citations in this rendering run
  const citedKeys: string[] = [];

  function escapeHtml(text: string): string {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Only http(s)/mailto links survive; anything else (javascript:, data:,
  // attribute-breakout attempts) is dropped. The result is also HTML-escaped
  // so it is safe to drop straight into an href="" attribute.
  function safeUrl(raw: string): string {
    const url = String(raw ?? '').trim();
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return '';
    return escapeHtml(url);
  }

  function renderNodes(nodes: LatexNode[]): string {
    let html = '';

    for (let idx = 0; idx < nodes.length; idx++) {
      const node = nodes[idx];

      if (node.type === 'text') {
        // Handle normal line breaks. In LaTeX, a double newline represents a paragraph break.
        // We'll process paragraph breaks later, but we can preserve basic text content here.
        html += escapeHtml(node.content);
      } else if (node.type === 'comment') {
        html += `<!-- ${escapeHtml(node.content)} -->`;
      } else if (node.type === 'group') {
        html += renderNodes(node.content);
      } else if (node.type === 'math') {
        // Raw math equations rendered by KaTeX
        try {
          const rendered = renderMathCached(node.content, {
            displayMode: node.display,
            throwOnError: false
          });
          if (node.display) {
            const borderClass = isPdfExport 
              ? 'border-y border-[#e5e7eb] bg-slate-50/10' 
              : 'border-y border-border bg-surface-sunken/40';
            html += `
              <div class="my-6 py-4 px-6 ${borderClass} flex flex-col items-center relative page-break-inside-avoid">
                <div class="w-full overflow-x-auto py-2 flex justify-center">${rendered}</div>
              </div>
            `;
          } else {
            html += rendered;
          }
        } catch (err) {
          console.error('KaTeX Math Render Error:', err);
          html += `<span class="text-danger font-bold">${escapeHtml(node.content)}</span>`;
        }
      } else if (node.type === 'environment') {
        html += renderEnvironment(
          node.name,
          node.content,
          node.args,
          labelMap,
          isPdfExport,
          renderNodes
        );
      } else if (node.type === 'command') {
        const cmdName = node.name.toLowerCase();
        
        // A. Section commands
        if (cmdName === 'section') {
          const title = escapeHtml(node.args[0] || 'Section');
          // Sections sit one level below the document title (the page's h1).
          html += `<h2 class="ltx-1 text-2xl font-bold font-sans mt-8 mb-4 border-b border-border pb-2 text-foreground">${title}</h2>`;
        } else if (cmdName === 'subsection') {
          const title = escapeHtml(node.args[0] || 'Subsection');
          html += `<h3 class="ltx-2 text-xl font-semibold font-sans mt-6 mb-3 border-b border-border pb-1 text-foreground">${title}</h3>`;
        } else if (cmdName === 'subsubsection') {
          const title = escapeHtml(node.args[0] || 'Subsubsection');
          html += `<h4 class="ltx-3 text-lg font-semibold font-sans mt-4 mb-2 text-foreground">${title}</h4>`;
        }
        
        // B. Formatting commands
        else if (cmdName === 'textbf') {
          const argNodes = parseLatex(node.args[0] || '');
          html += `<strong>${renderNodes(argNodes)}</strong>`;
        } else if (cmdName === 'textit' || cmdName === 'emph') {
          const argNodes = parseLatex(node.args[0] || '');
          html += `<em>${renderNodes(argNodes)}</em>`;
        } else if (cmdName === 'underline') {
          const argNodes = parseLatex(node.args[0] || '');
          html += `<u>${renderNodes(argNodes)}</u>`;
        } else if (cmdName === 'texttt') {
          const contentStr = node.args[0] || '';
          html += `<code class="bg-surface-sunken border border-border px-1.5 py-0.5 rounded text-xs font-mono text-foreground">${escapeHtml(contentStr)}</code>`;
        } else if (cmdName === 'textsf') {
          const argNodes = parseLatex(node.args[0] || '');
          html += `<span class="font-sans">${renderNodes(argNodes)}</span>`;
        } else if (cmdName === 'textrm') {
          const argNodes = parseLatex(node.args[0] || '');
          html += `<span class="font-serif">${renderNodes(argNodes)}</span>`;
        } else if (cmdName === 'textcolor') {
          const colorName = node.args[0] || 'white';
          const textContent = node.args[1] || '';
          const COLOR_MAP: Record<string, string> = {
            red: '#ef4444',
            blue: '#3b82f6',
            green: '#10b981',
            yellow: '#f59e0b',
            purple: '#8b5cf6',
            pink: '#ec4899',
            white: '#ffffff',
            gray: '#71717a',
            zinc: '#d4d4d8'
          };
          const colorVal = COLOR_MAP[colorName.toLowerCase()] || COLOR_MAP.white;
          const argNodes = parseLatex(textContent);
          html += `<span style="color: ${colorVal};">${renderNodes(argNodes)}</span>`;
        } else if (cmdName === 'colorbox') {
          const colorName = node.args[0] || 'yellow';
          const textContent = node.args[1] || '';
          const BG_COLOR_MAP: Record<string, string> = {
            red: 'rgba(239, 68, 68, 0.2)',
            blue: 'rgba(59, 130, 246, 0.2)',
            green: 'rgba(16, 185, 129, 0.2)',
            yellow: 'rgba(245, 158, 11, 0.2)',
            purple: 'rgba(139, 92, 246, 0.2)',
            pink: 'rgba(236, 72, 153, 0.2)',
            white: 'rgba(255, 255, 255, 0.15)',
            gray: 'rgba(113, 113, 122, 0.2)'
          };
          const bgVal = BG_COLOR_MAP[colorName.toLowerCase()] || BG_COLOR_MAP.yellow;
          const argNodes = parseLatex(textContent);
          html += `<span style="background-color: ${bgVal}; padding: 2px 6px; border-radius: 4px; display: inline-block;">${renderNodes(argNodes)}</span>`;
        }
        
        // C. Paragraph breaks / Newlines
        else if (node.name === '\\') {
          html += `<br />`;
        }
        
        // D. Cross-referencing
        else if (cmdName === 'label') {
          const labelName = (node.args[0] || '').replace(/[^A-Za-z0-9_:.-]/g, '');
          html += `<a id="label-${labelName}"></a>`;
        } else if (cmdName === 'ref' || cmdName === 'eqref') {
          const labelName = node.args[0] || '';
          const label = labelMap[labelName];
          const isEq = cmdName === 'eqref';

          if (label) {
            const displayText = escapeHtml(isEq ? `(${label.num})` : String(label.text ?? ''));
            const safeId = escapeHtml(label.id);
            if (isPdfExport) {
              html += `<a href="#${safeId}" class="clickable-reference text-primary" style="text-decoration: underline;">${displayText}</a>`;
            } else {
              if (label.pageId === currentPageId) {
                html += `<a href="#${safeId}" class="clickable-reference text-primary hover:underline" data-scroll-to="${safeId}">${displayText}</a>`;
              } else {
                const pageTitle = escapeHtml(pagesArray.find(p => p.id === label.pageId)?.title || 'another page');
                html += `<a href="#" class="clickable-reference text-primary hover:underline" data-page-id="${escapeHtml(label.pageId)}" data-scroll-to="${escapeHtml(label.id)}">${escapeHtml(String(displayText))} (on ${pageTitle})</a>`;
              }
            }
          } else {
            html += `<span class="text-danger font-mono">[??: ${escapeHtml(labelName)}]</span>`;
          }
        }

        // D2. Research object linking - \run{<jobId>} references a
        // Run/experiment, resolved against whichever runs the caller passed
        // in (the active page's linked runs, in the notebook editor). Unlike
        // an unresolved \ref{} (always a same-document typo), an unresolved
        // \run{} may just mean this render context didn't have run data
        // available (PDF export, the review page) - so it degrades to a
        // plain, unstyled mention rather than the red "broken reference" look.
        else if (cmdName === 'run') {
          const jobId = node.args[0] || '';
          const run = runsMap[jobId];
          if (run) {
            const label = escapeHtml(`${run.name} · ${run.status}`);
            if (isPdfExport) {
              html += `<span class="text-primary font-semibold">${label}</span>`;
            } else {
              html += `<a href="#" class="clickable-reference text-primary hover:underline font-semibold" data-run-id="${escapeHtml(jobId)}">${label}</a>`;
            }
          } else {
            html += `<span class="text-ink-faint font-mono text-sm" title="Not resolvable in this view">Run ${escapeHtml(jobId.slice(0, 8))}</span>`;
          }
        }

        // E. Hyperlinks
        else if (cmdName === 'href') {
          const rawUrl = node.args[0] || '';
          const text = escapeHtml(node.args[1] || rawUrl);
          const url = safeUrl(rawUrl);
          
          if (rawUrl.startsWith('page://')) {
            const slug = escapeHtml(rawUrl.substring(7));
            const label = labelMap[rawUrl];
            if (label) {
              if (isPdfExport) {
                html += `<a href="#${escapeHtml(label.id)}" class="clickable-reference text-primary" style="text-decoration: underline;">${text}</a>`;
              } else {
                html += `<a href="#" class="clickable-reference text-primary hover:underline" data-page-id="${escapeHtml(label.pageId)}">${text}</a>`;
              }
            } else {
              html += `<span class="text-danger font-mono">[Page not found: ${slug}]</span>`;
            }
          } else {
            html += url
              ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-450 hover:underline">${text}</a>`
              : `<span class="text-blue-450">${text}</span>`;
          }
        } else if (cmdName === 'url') {
          const rawUrl = node.args[0] || '';
          const url = safeUrl(rawUrl);
          const shown = escapeHtml(rawUrl);
          html += url
            ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-450 hover:underline">${shown}</a>`
            : `<span class="text-blue-450">${shown}</span>`;
        }
        
        // F. Bibliography Citations
        else if (cmdName === 'cite') {
          const keysStr = node.args[0] || '';
          const keys = keysStr.split(',').map(k => k.trim());
          const citationIndices = keys.map(key => {
            let citeIdx = citedKeys.indexOf(key);
            if (citeIdx === -1) {
              citedKeys.push(key);
              citeIdx = citedKeys.length - 1;
            }
            return citeIdx + 1;
          });
          
          // Render citation indices [1, 2]
          html += `<span class="text-primary font-semibold cursor-pointer select-none" title="${escapeHtml(keysStr)}">[${citationIndices.join(', ')}]</span>`;
        }
        
        // G. Print Bibliography command
        else if (cmdName === 'printbibliography') {
          html += `<!--BIBLIOGRAPHY_PLACEHOLDER-->`;
        }
      }
    }

    return html;
  }

  // Parse root latex into nodes
  const nodes = parseLatex(latex);
  let rendered = renderNodes(nodes);

  // 4. Resolve Paragraphs
  // In LaTeX, double newlines split paragraphs.
  const paragraphs = rendered.split(/\n\s*\n/);
  const formattedParagraphs = paragraphs.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    // Skip wrapping if it's already an environment block (starts with block container tags)
    if (
      trimmed.startsWith('<div') ||
      trimmed.startsWith('<h1') ||
      trimmed.startsWith('<h2') ||
      trimmed.startsWith('<h3') ||
      trimmed.startsWith('<h4') ||
      trimmed.startsWith('<blockquote') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<dl') ||
      trimmed.startsWith('<pre') ||
      trimmed.startsWith('<!--') ||
      trimmed.startsWith('<table')
    ) {
      return trimmed;
    }
    return `<p class="mb-4 text-foreground leading-relaxed">${trimmed}</p>`;
  });
  
  rendered = formattedParagraphs.filter(Boolean).join('\n');

  // 5. Inject Bibliography if placeholder is present or if we have citations and no placeholder (add to end)
  const renderBibHtml = () => {
    if (citedKeys.length === 0) return '';
    
    let bibHtml = `
      <div class="mt-12 pt-8 border-t border-border page-break-inside-avoid">
        <h2 class="text-xl font-bold font-sans text-foreground mb-6 font-mono tracking-wider uppercase">References</h2>
        <ol class="list-decimal pl-6 space-y-4 text-xs text-ink-secondary">
    `;
    
    citedKeys.forEach((key, idx) => {
      const entry = bibEntries[key];
      const citationText = entry 
        ? formatCitation(entry) 
        : `<span class="text-danger font-mono">[Missing BibTeX Entry: ${escapeHtml(key)}]</span>`;
        
      bibHtml += `
        <li id="cite-${encodeURIComponent(key)}" class="pl-2 leading-relaxed">
          ${citationText}
        </li>
      `;
    });
    
    bibHtml += `
        </ol>
      </div>
    `;
    return bibHtml;
  };

  if (rendered.includes('<!--BIBLIOGRAPHY_PLACEHOLDER-->')) {
    rendered = rendered.replace('<!--BIBLIOGRAPHY_PLACEHOLDER-->', renderBibHtml());
  } else if (citedKeys.length > 0) {
    rendered += renderBibHtml();
  }

  return rendered;
}
