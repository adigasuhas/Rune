export function isLatex(content: string): boolean {
  if (!content) return false;
  // If it has \section, \subsection, \begin{ or \item, it's LaTeX
  return (
    content.includes('\\section') ||
    content.includes('\\subsection') ||
    content.includes('\\begin{') ||
    content.includes('\\item') ||
    content.includes('\\textbf{') ||
    content.includes('\\textit{')
  );
}

export function convertMarkdownToLatex(markdown: string): string {
  if (!markdown) return '';

  let latex = markdown;

  // 1. Convert headers
  // # Title -> \section{Title}
  latex = latex.replace(/^#\s+(.*?)$/gm, '\\section{$1}');
  // ## Subtitle -> \subsection{Subtitle}
  latex = latex.replace(/^##\s+(.*?)$/gm, '\\subsection{$1}');
  // ### Subsubtitle -> \subsubsection{Subsubtitle}
  latex = latex.replace(/^###\s+(.*?)$/gm, '\\subsubsection{$1}');

  // 2. Convert Bold and Italics
  // **bold** -> \textbf{bold}
  latex = latex.replace(/\*\*(.*?)\*\*/g, '\\textbf{$1}');
  latex = latex.replace(/__(.*?)__/g, '\\textbf{$1}');
  // *italic* -> \textit{italic}
  latex = latex.replace(/\*(.*?)\*/g, '\\textit{$1}');
  latex = latex.replace(/_(.*?)_/g, '\\textit{$1}');

  // 3. Underline <u>text</u> -> \underline{text}
  latex = latex.replace(/<u>(.*?)<\/u>/g, '\\underline{$1}');

  // 4. Strikethrough ~~text~~ -> \textrm{\sout{text}} (or just text)
  latex = latex.replace(/~~(.*?)~~/g, '$1');

  // 5. Code blocks: ```code``` -> \begin{verbatim}code\end{verbatim}
  latex = latex.replace(/```(?:[a-zA-Z]+)?\n([\s\S]*?)```/g, '\\begin{verbatim}\n$1\\end{verbatim}');
  // Inline code: `code` -> \texttt{code}
  latex = latex.replace(/`(.*?)`/g, '\\texttt{$1}');

  // 6. Figure images: ![alt \label{fig:name}](url) -> \begin{figure} \includegraphics{url} \caption{alt} \label{fig:name} \end{figure}
  // If label exists inside alt
  latex = latex.replace(/!\[([^\]]*?)\\label\{([a-zA-Z0-9_\-:]+)\}([^\]]*?)\]\((.*?)\)/g, (match, altBefore, label, altAfter, url) => {
    const caption = (altBefore + altAfter).trim();
    return `\\begin{figure}\n  \\includegraphics{${url}}\n  \\caption{${caption}}\n  \\label{${label}}\n\\end{figure}`;
  });
  // Simple markdown image: ![alt](url) -> \begin{figure} \includegraphics{url} \caption{alt} \end{figure}
  latex = latex.replace(/!\[([^\]]*?)\]\((.*?)\)/g, (match, alt, url) => {
    return `\\begin{figure}\n  \\includegraphics{${url}}\n  \\caption{${alt}}\n\\end{figure}`;
  });

  // 7. Math equations
  // $$ ... $$ -> \begin{equation} ... \end{equation} (if not already in one)
  // Let's do a simple replace, but skip replacing if it's already inside an equation environment
  latex = latex.replace(/\$\$([\s\S]*?)\$\$/g, (match, eq) => {
    // Check if it already has a label
    const labelMatch = eq.match(/\\label\{([a-zA-Z0-9_\-:]+)\}/);
    if (labelMatch) {
      return `\\begin{equation}\n  ${eq.trim()}\n\\end{equation}`;
    }
    return `\\begin{equation*}\n  ${eq.trim()}\n\\end{equation*}`;
  });

  // 8. Lists (Unordered & Ordered)
  // Convert lines starting with * or - to \item.
  // We'll run a line-by-line processor for list blocks
  const lines = latex.split('\n');
  let inItemize = false;
  let inEnumerate = false;
  
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const uListMatch = line.match(/^\s*[\*\-]\s+(.*)$/);
    const oListMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    
    if (uListMatch) {
      if (!inItemize) {
        // If we were in enumerate, close it
        if (inEnumerate) {
          lines[idx - 1] += '\n\\end{enumerate}';
          inEnumerate = false;
        }
        lines[idx] = '\\begin{itemize}\n  \\item ' + uListMatch[1];
        inItemize = true;
      } else {
        lines[idx] = '  \\item ' + uListMatch[1];
      }
    } else if (oListMatch) {
      if (!inEnumerate) {
        // If we were in itemize, close it
        if (inItemize) {
          lines[idx - 1] += '\n\\end{itemize}';
          inItemize = false;
        }
        lines[idx] = '\\begin{enumerate}\n  \\item ' + oListMatch[1];
        inEnumerate = true;
      } else {
        lines[idx] = '  \\item ' + oListMatch[1];
      }
    } else {
      // Line is not a list item. If we were in a list, close it!
      if (inItemize) {
        lines[idx - 1] += '\n\\end{itemize}';
        inItemize = false;
      }
      if (inEnumerate) {
        lines[idx - 1] += '\n\\end{enumerate}';
        inEnumerate = false;
      }
    }
  }
  
  // Close any trailing lists
  if (inItemize) {
    lines[lines.length - 1] += '\n\\end{itemize}';
  }
  if (inEnumerate) {
    lines[lines.length - 1] += '\n\\end{enumerate}';
  }

  latex = lines.join('\n');

  return latex;
}
