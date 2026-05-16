// Lexer for the Groovy subset used by pipeline.config files. Accepts the
// shapes the emitter produces plus reasonable hand-edited variations
// (double-quoted strings, triple-quoted strings, scientific numbers, _
// digit separators, type suffixes, /* */ comments).
//
// Out of scope: GString interpolation (${...}), arithmetic operators,
// closures, statements other than assignments and named blocks. These
// are reported as errors rather than ignored.

import type { ParseError } from './types';

export type TokenKind =
  | 'STRING'
  | 'NUMBER'
  | 'IDENT'
  | 'BOOL'
  | 'NULL'
  | 'LBRACE'
  | 'RBRACE'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'EQ'
  | 'COLON'
  | 'COMMA'
  | 'DOT'
  | 'EOF';

export interface Token {
  readonly kind: TokenKind;
  readonly text: string; // raw lexeme for diagnostics
  readonly line: number; // 1-based
  readonly col: number; // 1-based
  // Decoded value for STRING/NUMBER/BOOL/NULL. undefined for syntax tokens.
  readonly value?: string | number | boolean | null;
}

export interface LexResult {
  readonly tokens: readonly Token[];
  readonly errors: readonly ParseError[];
}

export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const errors: ParseError[] = [];
  const len = source.length;
  let i = 0;
  let line = 1;
  let col = 1;

  function advance(): void {
    if (source[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
    i++;
  }

  function pushTok(
    kind: TokenKind,
    text: string,
    l: number,
    c: number,
    value?: string | number | boolean | null,
  ): void {
    tokens.push({ kind, text, line: l, col: c, value });
  }

  function pushErr(message: string, l: number, c: number): void {
    errors.push({ message, line: l, col: c });
  }

  function isDigit(c: string | undefined): boolean {
    return c !== undefined && c >= '0' && c <= '9';
  }

  function isIdentStart(c: string | undefined): boolean {
    if (c === undefined) return false;
    return (
      (c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      c === '_' ||
      c === '$'
    );
  }

  function isIdentCont(c: string | undefined): boolean {
    return isIdentStart(c) || isDigit(c);
  }

  function lexLineComment(): void {
    while (i < len && source[i] !== '\n') advance();
  }

  function lexBlockComment(startLine: number, startCol: number): void {
    advance();
    advance();
    while (i < len) {
      if (source[i] === '*' && source[i + 1] === '/') {
        advance();
        advance();
        return;
      }
      advance();
    }
    pushErr('Unterminated /* */ comment', startLine, startCol);
  }

  // Common escape decoder used by both quoted-string forms.
  function decodeEscape(): string {
    const next = source[i + 1];
    if (next === undefined) {
      pushErr('Unterminated escape sequence', line, col);
      advance();
      return '';
    }
    let out: string;
    switch (next) {
      case '\\':
        out = '\\';
        break;
      case "'":
        out = "'";
        break;
      case '"':
        out = '"';
        break;
      case 'n':
        out = '\n';
        break;
      case 'r':
        out = '\r';
        break;
      case 't':
        out = '\t';
        break;
      case 'b':
        out = '\b';
        break;
      case 'f':
        out = '\f';
        break;
      case '0':
        out = '\0';
        break;
      case '\n':
        // Line continuation in triple strings — drop the newline.
        out = '';
        break;
      default:
        // Unknown escape: keep the raw character (lenient).
        out = next;
        break;
    }
    advance();
    advance();
    return out;
  }

  // Skip past a Groovy GString interpolation `${...}`. Used only to keep
  // the lexer in a sane state after we've already reported the error.
  function skipInterpolation(): void {
    advance(); // $
    advance(); // {
    let depth = 1;
    while (i < len && depth > 0) {
      const c = source[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      advance();
    }
  }

  function lexString(quote: '"' | "'"): void {
    const startLine = line;
    const startCol = col;
    const startIdx = i;

    const isTriple = source[i + 1] === quote && source[i + 2] === quote;
    if (isTriple) {
      advance();
      advance();
      advance();
      let value = '';
      let closed = false;
      while (i < len) {
        if (
          source[i] === quote &&
          source[i + 1] === quote &&
          source[i + 2] === quote
        ) {
          advance();
          advance();
          advance();
          closed = true;
          break;
        }
        if (source[i] === '\\') {
          value += decodeEscape();
          continue;
        }
        if (quote === '"' && source[i] === '$' && source[i + 1] === '{') {
          pushErr(
            'Groovy GString interpolation (${...}) is not supported. Use a plain literal.',
            line,
            col,
          );
          skipInterpolation();
          continue;
        }
        value += source[i] ?? '';
        advance();
      }
      if (!closed) pushErr('Unterminated triple-quoted string', startLine, startCol);
      pushTok('STRING', source.slice(startIdx, i), startLine, startCol, value);
      return;
    }

    advance(); // opening quote
    let value = '';
    let closed = false;
    while (i < len) {
      const c = source[i];
      if (c === '\\') {
        value += decodeEscape();
        continue;
      }
      if (c === quote) {
        advance();
        closed = true;
        break;
      }
      if (c === '\n') {
        pushErr(
          'Unterminated string literal (newline before closing quote)',
          startLine,
          startCol,
        );
        break;
      }
      if (quote === '"' && c === '$' && source[i + 1] === '{') {
        pushErr(
          'Groovy GString interpolation (${...}) is not supported. Use a plain literal.',
          line,
          col,
        );
        skipInterpolation();
        continue;
      }
      value += c ?? '';
      advance();
    }
    if (!closed && i >= len) {
      pushErr('Unterminated string literal', startLine, startCol);
    }
    pushTok('STRING', source.slice(startIdx, i), startLine, startCol, value);
  }

  function lexNumber(): void {
    const startLine = line;
    const startCol = col;
    const startIdx = i;

    if (source[i] === '-') advance();

    let hasDigits = false;

    // Integer part (and leading-dot decimals are caught by the caller).
    while (isDigit(source[i]) || source[i] === '_') {
      if (source[i] !== '_') hasDigits = true;
      advance();
    }

    // Fractional part.
    if (source[i] === '.' && isDigit(source[i + 1])) {
      advance();
      while (isDigit(source[i]) || source[i] === '_') {
        if (source[i] !== '_') hasDigits = true;
        advance();
      }
    } else if (source[i] === '.' && tokens.length > 0) {
      // A trailing dot like "3." is unusual; not handled — leaves the dot
      // for the next pass to treat as a DOT token. Most files won't hit
      // this and the parser will surface a helpful error.
    }

    // Scientific notation.
    if (source[i] === 'e' || source[i] === 'E') {
      advance();
      if (source[i] === '+' || source[i] === '-') advance();
      while (isDigit(source[i]) || source[i] === '_') advance();
    }

    // Optional Groovy numeric type suffix.
    const suffix = source[i];
    if (suffix !== undefined && /[LGFDIlgfdi]/.test(suffix)) advance();

    if (!hasDigits) {
      pushErr('Invalid number literal', startLine, startCol);
      pushTok('NUMBER', source.slice(startIdx, i), startLine, startCol, 0);
      return;
    }

    const raw = source.slice(startIdx, i);
    const cleaned = raw.replace(/_/g, '').replace(/[LGFDIlgfdi]$/, '');
    const value = Number(cleaned);
    if (!Number.isFinite(value)) {
      pushErr(`Invalid number: ${raw}`, startLine, startCol);
      pushTok('NUMBER', raw, startLine, startCol, 0);
      return;
    }
    pushTok('NUMBER', raw, startLine, startCol, value);
  }

  function lexIdent(): void {
    const startLine = line;
    const startCol = col;
    const startIdx = i;
    advance();
    while (isIdentCont(source[i])) advance();
    const text = source.slice(startIdx, i);
    switch (text) {
      case 'true':
        pushTok('BOOL', text, startLine, startCol, true);
        return;
      case 'false':
        pushTok('BOOL', text, startLine, startCol, false);
        return;
      case 'null':
        pushTok('NULL', text, startLine, startCol, null);
        return;
      default:
        pushTok('IDENT', text, startLine, startCol);
    }
  }

  while (i < len) {
    const startLine = line;
    const startCol = col;
    const c = source[i];

    // Whitespace.
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance();
      continue;
    }

    // Comments.
    if (c === '/' && source[i + 1] === '/') {
      lexLineComment();
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      lexBlockComment(startLine, startCol);
      continue;
    }

    // Single-char punctuators.
    switch (c) {
      case '{':
        pushTok('LBRACE', '{', startLine, startCol);
        advance();
        continue;
      case '}':
        pushTok('RBRACE', '}', startLine, startCol);
        advance();
        continue;
      case '[':
        pushTok('LBRACKET', '[', startLine, startCol);
        advance();
        continue;
      case ']':
        pushTok('RBRACKET', ']', startLine, startCol);
        advance();
        continue;
      case '=':
        pushTok('EQ', '=', startLine, startCol);
        advance();
        continue;
      case ':':
        pushTok('COLON', ':', startLine, startCol);
        advance();
        continue;
      case ',':
        pushTok('COMMA', ',', startLine, startCol);
        advance();
        continue;
      default:
        break;
    }

    if (c === '.') {
      // Leading-dot decimals like .5 are valid in Groovy.
      if (isDigit(source[i + 1])) {
        lexNumber();
        continue;
      }
      pushTok('DOT', '.', startLine, startCol);
      advance();
      continue;
    }

    if (c === "'" || c === '"') {
      lexString(c);
      continue;
    }

    if (
      isDigit(c) ||
      (c === '-' &&
        (isDigit(source[i + 1]) ||
          (source[i + 1] === '.' && isDigit(source[i + 2]))))
    ) {
      lexNumber();
      continue;
    }

    if (isIdentStart(c)) {
      lexIdent();
      continue;
    }

    pushErr(`Unexpected character: ${JSON.stringify(c)}`, startLine, startCol);
    advance();
  }

  pushTok('EOF', '', line, col);
  return { tokens, errors };
}
