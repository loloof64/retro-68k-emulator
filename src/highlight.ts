export type TokenType =
  'comment' | 'label' | 'mnemonic' | 'directive' | 'size' | 'register' | 'number' | 'string';
export interface Token {
  type?: TokenType;
  text: string;
}

// Same quote rule as the assembler's stripComment: a ';' inside quotes isn't a comment.
function commentStart(text: string): number {
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ';') return i;
  }
  return text.length;
}

const DIRECTIVES = new Set(['ORG', 'DC', 'DS', 'EQU', 'EVEN', 'END']);

const OPERAND = /"[^"]*"|'[^']*'|\b(?:[DA][0-7]|SP|PC|CCR|SR)\b|\$[0-9A-Fa-f]+|%[01]+|\b\d+\b/gi;

// Tokenizes one source line; the tokens' texts concatenate back to the line.
// Mirrors the assembler's line shape: [label] [mnemonic[.size]] [operands] [; comment].
export function highlightLine(line: string): Token[] {
  if (line.startsWith('*')) return [{ type: 'comment', text: line }];
  const cut = commentStart(line);
  const tokens: Token[] = [];
  let rest = line.slice(0, cut);

  const label = /^(\s*)(\S+)/.exec(rest);
  if (label && (label[1] === '' || label[2].endsWith(':'))) {
    if (label[1]) tokens.push({ text: label[1] });
    tokens.push({ type: 'label', text: label[2] });
    rest = rest.slice(label[0].length);
  }
  const mn = /^(\s*)([^\s.]+)(\.\w+)?/.exec(rest);
  if (mn) {
    if (mn[1]) tokens.push({ text: mn[1] });
    tokens.push({
      type: DIRECTIVES.has(mn[2].toUpperCase()) ? 'directive' : 'mnemonic',
      text: mn[2],
    });
    if (mn[3]) tokens.push({ type: 'size', text: mn[3] });
    rest = rest.slice(mn[0].length);
  }
  let last = 0;
  for (const m of rest.matchAll(OPERAND)) {
    if (m.index > last) tokens.push({ text: rest.slice(last, m.index) });
    const t = m[0];
    tokens.push({
      type: t[0] === '"' || t[0] === "'" ? 'string' : /^[$%\d]/.test(t) ? 'number' : 'register',
      text: t,
    });
    last = m.index + t.length;
  }
  if (last < rest.length) tokens.push({ text: rest.slice(last) });
  if (cut < line.length) tokens.push({ type: 'comment', text: line.slice(cut) });
  return tokens;
}
