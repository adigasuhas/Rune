export type LatexNode =
  | { type: 'text'; content: string }
  | { type: 'command'; name: string; args: string[]; starred: boolean }
  | { type: 'environment'; name: string; args: string[]; content: string; innerNodes: LatexNode[] }
  | { type: 'group'; content: LatexNode[] }
  | { type: 'comment'; content: string }
  | { type: 'math'; display: boolean; content: string };

type Token =
  | { type: 'backslash' }
  | { type: 'word'; value: string }
  | { type: 'lbrace' }
  | { type: 'rbrace' }
  | { type: 'lbracket' }
  | { type: 'rbracket' }
  | { type: 'math_delimiter'; display: boolean; content: string }
  | { type: 'comment'; content: string }
  | { type: 'whitespace'; value: string }
  | { type: 'char'; value: string };

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    // Math delimiters: $$ or $
    if (char === '$') {
      // Check if this dollar sign is escaped by an odd number of backslashes
      let backslashCount = 0;
      let temp = i - 1;
      while (temp >= 0 && source[temp] === '\\') {
        backslashCount++;
        temp--;
      }
      const isEscaped = backslashCount % 2 === 1;

      if (isEscaped) {
        // Pop the backslash token from the list as it's representing the escape character
        if (tokens.length > 0 && tokens[tokens.length - 1].type === 'backslash') {
          tokens.pop();
        }
        tokens.push({ type: 'char', value: '$' });
        i++;
        continue;
      }

      if (source[i + 1] === '$') {
        // Double dollar display math
        const start = i + 2;
        let end = start;
        while (end < source.length) {
          if (source[end] === '$') {
            // Check if this closing display math delimiter is escaped
            let bsCount = 0;
            let t = end - 1;
            while (t >= 0 && source[t] === '\\') {
              bsCount++;
              t--;
            }
            if (bsCount % 2 === 0 && source[end + 1] === '$') {
              break;
            }
          }
          end++;
        }
        const mathContent = source.substring(start, end);
        tokens.push({ type: 'math_delimiter', display: true, content: mathContent });
        i = end + 2;
        continue;
      } else {
        // Single dollar inline math
        const start = i + 1;
        let end = start;
        while (end < source.length) {
          if (source[end] === '$') {
            // Check if this closing inline math delimiter is escaped
            let bsCount = 0;
            let t = end - 1;
            while (t >= 0 && source[t] === '\\') {
              bsCount++;
              t--;
            }
            if (bsCount % 2 === 0) {
              break;
            }
          }
          end++;
        }
        const mathContent = source.substring(start, end);
        tokens.push({ type: 'math_delimiter', display: false, content: mathContent });
        i = end + 1;
        continue;
      }
    }

    // LaTeX comments starting with %
    if (char === '%') {
      const start = i + 1;
      let end = start;
      while (end < source.length && source[end] !== '\n') {
        end++;
      }
      tokens.push({ type: 'comment', content: source.substring(start, end) });
      i = end; // Skip newline or keep it? Let's keep the newline as next token
      continue;
    }

    // Backslash for commands
    if (char === '\\') {
      // Check for math block syntax like \[ ... \] or \( ... \)
      if (source[i + 1] === '[') {
        const start = i + 2;
        let end = start;
        while (end < source.length) {
          if (source[end] === '\\' && source[end + 1] === ']') {
            break;
          }
          end++;
        }
        tokens.push({ type: 'math_delimiter', display: true, content: source.substring(start, end) });
        i = end + 2;
        continue;
      }
      if (source[i + 1] === '(') {
        const start = i + 2;
        let end = start;
        while (end < source.length) {
          if (source[end] === '\\' && source[end + 1] === ')') {
            break;
          }
          end++;
        }
        tokens.push({ type: 'math_delimiter', display: false, content: source.substring(start, end) });
        i = end + 2;
        continue;
      }

      tokens.push({ type: 'backslash' });
      i++;
      continue;
    }

    // Braces and brackets
    if (char === '{') {
      tokens.push({ type: 'lbrace' });
      i++;
      continue;
    }
    if (char === '}') {
      tokens.push({ type: 'rbrace' });
      i++;
      continue;
    }
    if (char === '[') {
      tokens.push({ type: 'lbracket' });
      i++;
      continue;
    }
    if (char === ']') {
      tokens.push({ type: 'rbracket' });
      i++;
      continue;
    }

    // Whitespace
    if (/\s/.test(char)) {
      const start = i;
      while (i < source.length && /\s/.test(source[i])) {
        i++;
      }
      tokens.push({ type: 'whitespace', value: source.substring(start, i) });
      continue;
    }

    // Alphabetical words (for command names and standard words)
    if (/[a-zA-Z]/.test(char)) {
      const start = i;
      while (i < source.length && /[a-zA-Z]/.test(source[i])) {
        i++;
      }
      tokens.push({ type: 'word', value: source.substring(start, i) });
      continue;
    }

    // Default single char
    tokens.push({ type: 'char', value: char });
    i++;
  }

  return tokens;
}

export function parseLatex(source: string): LatexNode[] {
  const tokens = tokenize(source);
  let index = 0;

  function peek(offset = 0): Token | undefined {
    return tokens[index + offset];
  }

  function next(): Token | undefined {
    return tokens[index++];
  }

  function parseNodes(endCond?: (t: Token) => boolean): LatexNode[] {
    const nodes: LatexNode[] = [];

    while (index < tokens.length) {
      const token = peek();
      if (!token) break;
      const startIndex = index;

      if (endCond && endCond(token)) {
        break;
      }

      // A closing brace with no group open (a typo, or one left behind by an
      // edit) is just a character. It used to stop the text loop below
      // without being consumed, so this loop spun on it forever and froze
      // the whole notebook tab the moment one was typed.
      if (token.type === 'rbrace') {
        next();
        nodes.push({ type: 'text', content: '}' });
        continue;
      }

      if (token.type === 'math_delimiter') {
        next();
        nodes.push({ type: 'math', display: token.display, content: token.content });
        continue;
      }

      if (token.type === 'comment') {
        next();
        nodes.push({ type: 'comment', content: token.content });
        continue;
      }

      if (token.type === 'backslash') {
        next(); // Consume '\\'
        const nameToken = peek();
        
        if (nameToken && (nameToken.type === 'word' || nameToken.type === 'char')) {
          next();
          const name = nameToken.type === 'word' ? nameToken.value : nameToken.value;
          
          // Check for star in command (e.g. \section*)
          let starred = false;
          const nextTok = peek();
          if (nextTok?.type === 'char' && nextTok.value === '*') {
            next();
            starred = true;
          }

          // Handle special environment commands: \begin and \end
          if (name === 'begin' || name === 'end') {
            // Must be followed by {env_name}
            const args = parseCommandArgs();
            const envName = args[0] || '';
            
            if (name === 'begin') {
              // We need to parse until we find matching \end{envName}
              const envContentTokens: Token[] = [];
              let depth = 1;
              
              while (index < tokens.length) {
                const currentToken = peek();
                if (!currentToken) break;
                
                if (currentToken.type === 'backslash' && peek(1)?.type === 'word') {
                  const cmdName = (peek(1) as any).value;
                  if (cmdName === 'begin' || cmdName === 'end') {
                    // Let's parse its env name argument temporarily
                    let tempIdx = index + 2;
                    let foundEnvArg = '';
                    while (tempIdx < tokens.length && tokens[tempIdx].type === 'whitespace') tempIdx++;
                    if (tokens[tempIdx]?.type === 'lbrace') {
                      tempIdx++;
                      while (tempIdx < tokens.length && tokens[tempIdx].type === 'whitespace') tempIdx++;
                      if (tokens[tempIdx]?.type === 'word') {
                        foundEnvArg = (tokens[tempIdx] as any).value;
                      }
                    }
                    
                    if (foundEnvArg === envName) {
                      if (cmdName === 'begin') {
                        depth++;
                      } else {
                        depth--;
                        if (depth === 0) {
                          // Found matching end! Skip past \end{envName}
                          index = tempIdx; // Move to environment name word
                          while (index < tokens.length && tokens[index].type !== 'rbrace') {
                            index++;
                          }
                          if (tokens[index]?.type === 'rbrace') index++; // Consume rbrace
                          break;
                        }
                      }
                    }
                  }
                }
                
                const t = next();
                if (t) envContentTokens.push(t);
              }
              
              // Reconstruct raw env content string
              const rawEnvContent = envContentTokens.map(t => {
                if (t.type === 'backslash') return '\\';
                if (t.type === 'math_delimiter') return t.display ? `$$${t.content}$$` : `$${t.content}$`;
                if (t.type === 'comment') return `%${t.content}\n`;
                if (t.type === 'lbrace') return '{';
                if (t.type === 'rbrace') return '}';
                if (t.type === 'lbracket') return '[';
                if (t.type === 'rbracket') return ']';
                if (t.type === 'whitespace' || t.type === 'word' || t.type === 'char') return t.value;
                return '';
              }).join('');
              
              // Recurse inner content
              const isMathEnv = ['equation', 'align', 'gather', 'cases', 'matrix', 'pmatrix', 'align*', 'gather*', 'equation*'].includes(envName);
              const innerNodes = isMathEnv ? [] : parseLatex(rawEnvContent);
              
              nodes.push({
                type: 'environment',
                name: envName,
                args: [],
                content: rawEnvContent,
                innerNodes
              });
            }
            continue;
          }

          // Parse other command arguments
          const cmdArgs = parseCommandArgs();
          nodes.push({
            type: 'command',
            name,
            args: cmdArgs,
            starred
          });
        } else {
          // Double backslash is newline
          nodes.push({ type: 'command', name: '\\', args: [], starred: false });
        }
        continue;
      }

      if (token.type === 'lbrace') {
        next();
        const groupNodes = parseNodes(t => t.type === 'rbrace');
        if (peek()?.type === 'rbrace') next(); // consume }
        nodes.push({ type: 'group', content: groupNodes });
        continue;
      }

      // Default text construction
      let textVal = '';
      while (index < tokens.length) {
        const nextT = peek();
        if (!nextT) break;
        if (
          nextT.type === 'backslash' ||
          nextT.type === 'lbrace' ||
          nextT.type === 'rbrace' ||
          nextT.type === 'math_delimiter' ||
          nextT.type === 'comment'
        ) {
          break;
        }
        next();
        if (nextT.type === 'whitespace') {
          textVal += nextT.value;
        } else if (nextT.type === 'word' || nextT.type === 'char') {
          textVal += nextT.value;
        } else if (nextT.type === 'lbracket') {
          textVal += '[';
        } else if (nextT.type === 'rbracket') {
          textVal += ']';
        }
      }
      
      if (textVal) {
        nodes.push({ type: 'text', content: textVal });
      }

      // Every pass must consume at least one token. Anything that didn't
      // (a token type no branch above handles) becomes literal text, so no
      // input - however malformed - can stall the parser.
      if (index === startIndex) {
        const stuck = next();
        if (stuck) nodes.push({ type: 'text', content: tokenText(stuck) });
      }
    }

    return nodes;
  }

  function parseCommandArgs(): string[] {
    const args: string[] = [];
    
    while (index < tokens.length) {
      // Skip whitespace between command and arg
      let wsOffset = 0;
      while (peek(wsOffset)?.type === 'whitespace') {
        wsOffset++;
      }
      
      const nextNonWs = peek(wsOffset);
      if (nextNonWs?.type === 'lbrace') {
        // Skip whitespace
        for (let j = 0; j < wsOffset; j++) next();
        next(); // consume {
        
        let argContent = '';
        let braceCount = 1;
        while (index < tokens.length) {
          const t = next();
          if (!t) break;
          if (t.type === 'lbrace') braceCount++;
          if (t.type === 'rbrace') {
            braceCount--;
            if (braceCount === 0) break;
          }
          
          if (t.type === 'backslash') argContent += '\\';
          else if (t.type === 'math_delimiter') argContent += t.display ? `$$${t.content}$$` : `$${t.content}$`;
          else if (t.type === 'comment') argContent += `%${t.content}\n`;
          else if (t.type === 'lbrace') argContent += '{';
          else if (t.type === 'rbrace') argContent += '}';
          else if (t.type === 'lbracket') argContent += '[';
          else if (t.type === 'rbracket') argContent += ']';
          else argContent += t.value;
        }
        args.push(argContent);
      } else if (nextNonWs?.type === 'lbracket') {
        // Parse optional arguments in square brackets
        for (let j = 0; j < wsOffset; j++) next();
        next(); // consume [
        
        let argContent = '';
        while (index < tokens.length) {
          const t = next();
          if (!t) break;
          if (t.type === 'rbracket') break;
          
          if (t.type === 'backslash') argContent += '\\';
          else if (t.type === 'math_delimiter') argContent += t.display ? `$$${t.content}$$` : `$${t.content}$`;
          else if (t.type === 'comment') argContent += `%${t.content}\n`;
          else if (t.type === 'lbrace') argContent += '{';
          else if (t.type === 'rbrace') argContent += '}';
          else if (t.type === 'lbracket') argContent += '[';
          else argContent += t.value;
        }
        args.push(argContent);
      } else {
        break;
      }
    }
    
    return args;
  }

  return parseNodes();
}

/** The source text a token stands for - used when a token has to be kept as plain text. */
function tokenText(t: Token): string {
  switch (t.type) {
    case 'backslash': return '\\';
    case 'lbrace': return '{';
    case 'rbrace': return '}';
    case 'lbracket': return '[';
    case 'rbracket': return ']';
    case 'math_delimiter': return t.display ? `$$${t.content}$$` : `$${t.content}$`;
    case 'comment': return '';
    case 'whitespace': case 'word': case 'char': return t.value;
  }
}
