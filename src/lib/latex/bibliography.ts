export interface BibtexEntry {
  key: string;
  type: string;
  fields: Record<string, string>;
}

export function parseBibtex(content: string): Record<string, BibtexEntry> {
  const entries: Record<string, BibtexEntry> = {};
  if (!content) return entries;

  // Regex to match BibTeX entries like @article{key, ...}
  // Matches: @type{key, fields}
  const entryRegex = /@([a-zA-Z]+)\s*\{\s*([a-zA-Z0-9_\-:]+)\s*,\s*([\s\S]*?)\s*\n\s*\}/g;
  
  // Since we also want to catch entries where the closing brace is on a line with other fields
  // Let's use a more robust character scanner for entries to ensure nesting of braces inside fields is handled
  let i = 0;
  while (i < content.length) {
    const char = content[i];
    if (char === '@') {
      const typeStart = i + 1;
      let typeEnd = typeStart;
      while (typeEnd < content.length && /[a-zA-Z]/.test(content[typeEnd])) {
        typeEnd++;
      }
      const type = content.substring(typeStart, typeEnd).toLowerCase();
      
      let braceIdx = typeEnd;
      while (braceIdx < content.length && content[braceIdx] !== '{') {
        braceIdx++;
      }
      
      if (braceIdx < content.length) {
        const keyStart = braceIdx + 1;
        let keyEnd = keyStart;
        while (keyEnd < content.length && /[a-zA-Z0-9_\-:]/.test(content[keyEnd])) {
          keyEnd++;
        }
        const key = content.substring(keyStart, keyEnd);
        
        // Find matching closing brace for this entry, respecting nested braces (e.g. author = {Cooper, L. {N.}})
        let depth = 1;
        let fieldsStart = keyEnd;
        while (fieldsStart < content.length && content[fieldsStart] !== ',') {
          fieldsStart++;
        }
        if (fieldsStart < content.length) {
          fieldsStart++; // Skip ','
        }
        
        let ptr = fieldsStart;
        while (ptr < content.length && depth > 0) {
          const c = content[ptr];
          if (c === '{') depth++;
          else if (c === '}') {
            depth--;
            if (depth === 0) break;
          }
          ptr++;
        }
        
        if (depth === 0) {
          const rawFields = content.substring(fieldsStart, ptr);
          const fields = parseBibtexFields(rawFields);
          
          entries[key] = {
            key,
            type,
            fields
          };
          
          i = ptr + 1;
          continue;
        }
      }
    }
    i++;
  }

  return entries;
}

function parseBibtexFields(fieldsStr: string): Record<string, string> {
  const fields: Record<string, string> = {};
  
  let i = 0;
  while (i < fieldsStr.length) {
    // Skip whitespace, commas
    while (i < fieldsStr.length && (/\s/.test(fieldsStr[i]) || fieldsStr[i] === ',')) {
      i++;
    }
    if (i >= fieldsStr.length) break;
    
    // Scan key
    const keyStart = i;
    while (i < fieldsStr.length && /[a-zA-Z0-9_\-]/.test(fieldsStr[i])) {
      i++;
    }
    const key = fieldsStr.substring(keyStart, i).toLowerCase().trim();
    if (!key) {
      i++;
      continue;
    }
    
    // Scan equals sign
    while (i < fieldsStr.length && fieldsStr[i] !== '=') {
      i++;
    }
    if (i < fieldsStr.length) {
      i++; // Skip '='
    }
    
    // Skip whitespace
    while (i < fieldsStr.length && /\s/.test(fieldsStr[i])) {
      i++;
    }
    
    // Scan value (can be brace enclosed {value}, quotes "value", or plain value)
    let value = '';
    if (fieldsStr[i] === '{') {
      i++; // Skip '{'
      let braceDepth = 1;
      const valStart = i;
      while (i < fieldsStr.length && braceDepth > 0) {
        if (fieldsStr[i] === '{') braceDepth++;
        else if (fieldsStr[i] === '}') {
          braceDepth--;
          if (braceDepth === 0) break;
        }
        i++;
      }
      value = fieldsStr.substring(valStart, i);
      if (fieldsStr[i] === '}') {
        i++; // Skip '}'
      }
    } else if (fieldsStr[i] === '"') {
      i++; // Skip '"'
      const valStart = i;
      while (i < fieldsStr.length && fieldsStr[i] !== '"') {
        i++;
      }
      value = fieldsStr.substring(valStart, i);
      if (fieldsStr[i] === '"') {
        i++; // Skip '"'
      }
    } else {
      const valStart = i;
      while (i < fieldsStr.length && fieldsStr[i] !== ',' && !/\s/.test(fieldsStr[i])) {
        i++;
      }
      value = fieldsStr.substring(valStart, i);
    }
    
    fields[key] = value.replace(/\s+/g, ' ').trim();
  }
  
  return fields;
}

export function formatCitation(entry: BibtexEntry): string {
  const author = entry.fields['author'] || 'Unknown Author';
  const title = entry.fields['title'] || 'Untitled';
  const journal = entry.fields['journal'] || entry.fields['booktitle'] || '';
  const year = entry.fields['year'] || '';
  const volume = entry.fields['volume'] || '';
  const pages = entry.fields['pages'] || '';

  let citation = `${author}. `;
  citation += `"${title}." `;
  if (journal) {
    citation += `*${journal}*`;
    if (volume) citation += `, Vol. ${volume}`;
    if (pages) citation += `, pp. ${pages}`;
    if (year) citation += ` (${year})`;
  } else if (year) {
    citation += `(${year})`;
  }
  return citation;
}

export function extractBibliographyContent(pages: any[]): string {
  // Check for page titled "references.bib" or "bibliography.bib" or "references" or "bibliography"
  const bibPage = pages.find(p => {
    const titleLower = p.title.toLowerCase();
    return (
      titleLower === 'references.bib' ||
      titleLower === 'references' ||
      titleLower === 'bibliography.bib' ||
      titleLower === 'bibliography'
    );
  });
  
  return bibPage ? bibPage.content : '';
}
