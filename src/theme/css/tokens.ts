/**
 * A tokenizer for CSS, after CSS Syntax Level 3, in plain TypeScript so the browser and the hub read alike.
 * Escapes are resolved, so a name is compared as what it is; comments are left out.
 */
export type TokenType =
  | 'ident' | 'function' | 'at' | 'hash' | 'string' | 'bad-string' | 'url' | 'bad-url' | 'number' | 'percentage' | 'dimension'
  | 'space' | 'colon' | 'semicolon' | 'comma' | '(' | ')' | '[' | ']' | '{' | '}' | 'delim';

export interface Token {
  type: TokenType;
  /** The resolved text: the name of an ident, function or at-rule (without @), a string's content, a number as written. */
  value: string;
  /** For numbers, percentages and dimensions. */
  number?: number;
  /** For dimensions, in lower case. */
  unit?: string;
  line: number;
}

const isNameStart = (c: string): boolean => /[a-zA-Z_]/.test(c) || c.charCodeAt(0) >= 0x80;
const isName = (c: string): boolean => isNameStart(c) || /[0-9-]/.test(c);
const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
const isHex = (c: string | undefined): boolean => c !== undefined && /[0-9a-fA-F]/.test(c);
const isSpace = (c: string | undefined): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const MAX_CODE_POINT = 0x10ffff;

export function tokenize(input: string): Token[] {
  const text = input.replace(/\r\n?|\f/g, '\n').replace(/\0/g, '�');
  const tokens: Token[] = [];
  let at = 0;
  let line = 1;
  const peek = (offset = 0): string | undefined => text[at + offset];
  const next = (): string => {
    const c = text[at++]!;
    if (c === '\n') line += 1;
    return c;
  };
  const validEscape = (a: string | undefined, b: string | undefined): boolean => a === '\\' && b !== '\n' && b !== undefined;
  const startsIdent = (a = peek(), b = peek(1), c = peek(2)): boolean => {
    if (a === '-') return (b !== undefined && (isNameStart(b) || b === '-')) || validEscape(b, c);
    if (a !== undefined && isNameStart(a)) return true;
    return validEscape(a, b);
  };
  const startsNumber = (a = peek(), b = peek(1), c = peek(2)): boolean => {
    if (a === '+' || a === '-') return isDigit(b) || (b === '.' && isDigit(c));
    if (a === '.') return isDigit(b);
    return isDigit(a);
  };
  const escape = (): string => {
    // the backslash is consumed already
    const c = next();
    if (!isHex(c)) return c;
    let hex = c;
    while (hex.length < 6 && isHex(peek())) hex += next();
    if (isSpace(peek())) next();
    const code = parseInt(hex, 16);
    return code === 0 || code > MAX_CODE_POINT || (code >= 0xd800 && code <= 0xdfff) ? '�' : String.fromCodePoint(code);
  };
  const name = (): string => {
    let out = '';
    while (at < text.length) {
      const c = peek()!;
      if (isName(c)) out += next();
      else if (validEscape(c, peek(1))) { next(); out += escape(); }
      else break;
    }
    return out;
  };
  const numeric = (startLine: number): Token => {
    let raw = '';
    if (peek() === '+' || peek() === '-') raw += next();
    while (isDigit(peek())) raw += next();
    if (peek() === '.' && isDigit(peek(1))) { raw += next(); while (isDigit(peek())) raw += next(); }
    if ((peek() === 'e' || peek() === 'E') && (isDigit(peek(1)) || ((peek(1) === '+' || peek(1) === '-') && isDigit(peek(2))))) {
      raw += next();
      if (peek() === '+' || peek() === '-') raw += next();
      while (isDigit(peek())) raw += next();
    }
    const number = Number(raw);
    if (startsIdent()) {
      const unit = name().toLowerCase();
      return { type: 'dimension', value: `${raw}${unit}`, number, unit, line: startLine };
    }
    if (peek() === '%') { next(); return { type: 'percentage', value: `${raw}%`, number, line: startLine }; }
    return { type: 'number', value: raw, number, line: startLine };
  };
  const string = (quote: string, startLine: number): Token => {
    let out = '';
    while (at < text.length) {
      const c = next();
      if (c === quote) return { type: 'string', value: out, line: startLine };
      if (c === '\n') return { type: 'bad-string', value: out, line: startLine };
      if (c === '\\') {
        if (at >= text.length) break;
        if (peek() === '\n') { next(); continue; }
        out += escape();
      } else out += c;
    }
    return { type: 'string', value: out, line: startLine };
  };
  const url = (startLine: number): Token => {
    while (isSpace(peek())) next();
    let out = '';
    while (at < text.length) {
      const c = next();
      if (c === ')') return { type: 'url', value: out, line: startLine };
      if (isSpace(c)) {
        while (isSpace(peek())) next();
        if (peek() === ')' ) { next(); return { type: 'url', value: out, line: startLine }; }
        break;
      }
      if (c === '"' || c === "'" || c === '(' ) break;
      if (c === '\\') { if (validEscape(c, peek())) { out += escape(); continue; } break; }
      out += c;
    }
    // what is left of a broken url, up to its end
    while (at < text.length && peek() !== ')') { if (peek() === '\\' && peek(1) !== undefined) next(); next(); }
    if (peek() === ')') next();
    return { type: 'bad-url', value: '', line: startLine };
  };

  while (at < text.length) {
    const startLine = line;
    const c = peek()!;
    if (c === '/' && peek(1) === '*') {
      next(); next();
      while (at < text.length && !(peek() === '*' && peek(1) === '/')) next();
      if (at < text.length) { next(); next(); }
      continue;
    }
    if (isSpace(c)) {
      while (isSpace(peek())) next();
      tokens.push({ type: 'space', value: ' ', line: startLine });
      continue;
    }
    if (c === '"' || c === "'") { next(); tokens.push(string(c, startLine)); continue; }
    if (c === '#') {
      next();
      if (at < text.length && (isName(peek()!) || validEscape(peek(), peek(1)))) tokens.push({ type: 'hash', value: name(), line: startLine });
      else tokens.push({ type: 'delim', value: '#', line: startLine });
      continue;
    }
    if (startsNumber()) { tokens.push(numeric(startLine)); continue; }
    if (startsIdent()) {
      const value = name();
      if (peek() === '(') {
        next();
        if (value.toLowerCase() === 'url') {
          let look = 0;
          while (isSpace(peek(look))) look += 1;
          if (peek(look) !== '"' && peek(look) !== "'") { tokens.push(url(startLine)); continue; }
        }
        tokens.push({ type: 'function', value, line: startLine });
      } else tokens.push({ type: 'ident', value, line: startLine });
      continue;
    }
    if (c === '@') {
      next();
      if (startsIdent()) tokens.push({ type: 'at', value: name(), line: startLine });
      else tokens.push({ type: 'delim', value: '@', line: startLine });
      continue;
    }
    next();
    const single: Record<string, TokenType> = { ':': 'colon', ';': 'semicolon', ',': 'comma', '(': '(', ')': ')', '[': '[', ']': ']', '{': '{', '}': '}' };
    tokens.push({ type: single[c] ?? 'delim', value: c, line: startLine });
  }
  return tokens;
}
