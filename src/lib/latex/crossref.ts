export interface LabelInfo {
  id: string;
  type: 'Section' | 'Equation' | 'Figure' | 'Table' | 'Page';
  num: number;
  text: string;
  pageId: string;
}

export type LabelMap = Record<string, LabelInfo>;

export function buildLabelMap(pages: any[]): LabelMap {
  const labelMap: LabelMap = {};
  
  let sectionGlobal = 0;
  let figureGlobal = 0;
  let equationGlobal = 0;
  let tableGlobal = 0;

  // 1. Map pages themselves
  pages.forEach(p => {
    const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    labelMap[`page://${slug}`] = {
      id: `page-${p.id}`,
      type: 'Page',
      num: 0,
      text: p.title,
      pageId: p.id
    };
    if (p.date) {
      labelMap[`page://${p.date}`] = {
        id: `page-${p.id}`,
        type: 'Page',
        num: 0,
        text: p.title,
        pageId: p.id
      };
    }
  });

  // 2. Scan labels within pages
  pages.forEach(p => {
    const content = p.content || '';

    // A. LaTeX \section / \subsection / \subsubsection labels
    // Matches \section{Title}\label{sec:title} or \section{Title} \label{sec:title}
    const sectionLabelRegex = /\\(section|subsection|subsubsection)\*?\{([^}]+)\}(?:\s*\\label\{([^}]+)\})/g;
    let match;
    while ((match = sectionLabelRegex.exec(content)) !== null) {
      sectionGlobal++;
      const name = match[3];
      labelMap[name] = {
        id: `label-${name}`,
        type: 'Section',
        num: sectionGlobal,
        text: `Section ${sectionGlobal}`,
        pageId: p.id
      };
    }

    // B. Legacy Markdown header labels (e.g., # Title \label{sec:title})
    const headerLabelRegex = /^(#+)\s*(.*?)\s*\\label\{([a-zA-Z0-9_\-:]+)\}/gm;
    while ((match = headerLabelRegex.exec(content)) !== null) {
      sectionGlobal++;
      const name = match[3];
      labelMap[name] = {
        id: `label-${name}`,
        type: 'Section',
        num: sectionGlobal,
        text: `Section ${sectionGlobal}`,
        pageId: p.id
      };
    }

    // C. Equation labels inside display math $$ ... \label{eq:name} ... $$
    const eqLabelRegex = /\$\$([\s\S]*?)\\label\{([a-zA-Z0-9_\-:]+)\}([\s\S]*?)\$\$/g;
    while ((match = eqLabelRegex.exec(content)) !== null) {
      equationGlobal++;
      const name = match[2];
      labelMap[name] = {
        id: `label-${name}`,
        type: 'Equation',
        num: equationGlobal,
        text: `Equation (${equationGlobal})`,
        pageId: p.id
      };
    }

    // D. LaTeX equation environments: \begin{equation}\label{eq:name}...\end{equation}
    const eqEnvRegex = /\\begin\{equation\*?\}\s*([\s\S]*?)\\label\{([a-zA-Z0-9_\-:]+)\}([\s\S]*?)\\end\{equation\*?\}/g;
    while ((match = eqEnvRegex.exec(content)) !== null) {
      equationGlobal++;
      const name = match[2];
      labelMap[name] = {
        id: `label-${name}`,
        type: 'Equation',
        num: equationGlobal,
        text: `Equation (${equationGlobal})`,
        pageId: p.id
      };
    }

    // E. LaTeX align/gather environments: \begin{align}\label{eq:name}...\end{align}
    const mathEnvRegex = /\\begin\{(align|gather)\*?\}\s*([\s\S]*?)\\label\{([a-zA-Z0-9_\-:]+)\}([\s\S]*?)\\end\{\1\*?\}/g;
    while ((match = mathEnvRegex.exec(content)) !== null) {
      equationGlobal++;
      const name = match[3];
      labelMap[name] = {
        id: `label-${name}`,
        type: 'Equation',
        num: equationGlobal,
        text: `Equation (${equationGlobal})`,
        pageId: p.id
      };
    }

    // F. Figure environments: \begin{figure}...\label{fig:name}...\end{figure}
    const figEnvRegex = /\\begin\{figure\*?\}\s*([\s\S]*?)\\label\{([a-zA-Z0-9_\-:]+)\}([\s\S]*?)\\end\{figure\*?\}/g;
    while ((match = figEnvRegex.exec(content)) !== null) {
      figureGlobal++;
      const name = match[2];
      labelMap[name] = {
        id: `label-${name}`,
        type: 'Figure',
        num: figureGlobal,
        text: `Figure ${figureGlobal}`,
        pageId: p.id
      };
    }

    // G. Legacy markdown figure labels: ![alt \label{fig:name}](url)
    const mdFigLabelRegex = /!\[([^\]]*?)\\label\{([a-zA-Z0-9_\-:]+)\}([^\]]*?)\]\((.*?)\)/g;
    while ((match = mdFigLabelRegex.exec(content)) !== null) {
      figureGlobal++;
      const name = match[2];
      labelMap[name] = {
        id: `label-${name}`,
        type: 'Figure',
        num: figureGlobal,
        text: `Figure ${figureGlobal}`,
        pageId: p.id
      };
    }

    // H. Table environments: \begin{table}...\label{tab:name}...\end{table}
    const tabEnvRegex = /\\begin\{table\*?\}\s*([\s\S]*?)\\label\{([a-zA-Z0-9_\-:]+)\}([\s\S]*?)\\end\{table\*?\}/g;
    while ((match = tabEnvRegex.exec(content)) !== null) {
      tableGlobal++;
      const name = match[2];
      labelMap[name] = {
        id: `label-${name}`,
        type: 'Table',
        num: tableGlobal,
        text: `Table ${tableGlobal}`,
        pageId: p.id
      };
    }

    // I. General remaining labels (e.g. \label{...})
    const generalLabelRegex = /\\label\{([a-zA-Z0-9_\-:]+)\}/g;
    while ((match = generalLabelRegex.exec(content)) !== null) {
      const name = match[1];
      if (!labelMap[name]) {
        if (name.startsWith('tab:')) {
          tableGlobal++;
          labelMap[name] = {
            id: `label-${name}`,
            type: 'Table',
            num: tableGlobal,
            text: `Table ${tableGlobal}`,
            pageId: p.id
          };
        } else if (name.startsWith('fig:')) {
          figureGlobal++;
          labelMap[name] = {
            id: `label-${name}`,
            type: 'Figure',
            num: figureGlobal,
            text: `Figure ${figureGlobal}`,
            pageId: p.id
          };
        } else if (name.startsWith('eq:')) {
          equationGlobal++;
          labelMap[name] = {
            id: `label-${name}`,
            type: 'Equation',
            num: equationGlobal,
            text: `Equation (${equationGlobal})`,
            pageId: p.id
          };
        } else {
          sectionGlobal++;
          labelMap[name] = {
            id: `label-${name}`,
            type: 'Section',
            num: sectionGlobal,
            text: `Section ${sectionGlobal}`,
            pageId: p.id
          };
        }
      }
    }
  });

  return labelMap;
}
