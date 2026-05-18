// Recursive-descent parser over the Groovy lexer's token stream. Produces
// an AST of named blocks and assignments. The parseConfig orchestrator
// later walks this AST to find `params { ... }` and flatten it.
//
// Error recovery is deliberate: every parse failure pushes a ParseError
// and tries to advance to the next plausible sync point (an identifier,
// a closing brace, or EOF) so we don't bail on the first typo and lose
// the rest of the file.

import type { ParsedValue, ParseError } from './types';
import type { Token } from './groovyLexer';

export type AstNode = AstAssignment | AstBlock;

export interface AstAssignment {
  readonly kind: 'assignment';
  readonly segments: readonly string[];
  readonly value: ParsedValue;
  readonly line: number;
  readonly col: number;
}

export interface AstBlock {
  readonly kind: 'block';
  readonly segments: readonly string[];
  readonly body: readonly AstNode[];
  readonly line: number;
  readonly col: number;
  // Source byte offsets covering the block from its leading identifier
  // through (and including) the matching closing brace. Used by
  // parseConfig to slice the verbatim text of outer blocks for the
  // "preserve outside-params" feature.
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface ParseAstResult {
  readonly nodes: readonly AstNode[];
  readonly errors: readonly ParseError[];
}

export function parseTokens(tokens: readonly Token[]): ParseAstResult {
  const errors: ParseError[] = [];
  let pos = 0;

  function peek(offset = 0): Token {
    const t = tokens[pos + offset];
    if (t !== undefined) return t;
    // Lexer always emits an EOF token at the end, so the last token is the
    // safe fallback when callers peek past the end.
    return tokens[tokens.length - 1]!;
  }

  function consume(): Token {
    const t = peek();
    pos++;
    return t;
  }

  function err(message: string, t: Token = peek()): void {
    errors.push({ message, line: t.line, col: t.col });
  }

  // Skip tokens until we land on something we can resume parsing from.
  function recover(): void {
    while (true) {
      const k = peek().kind;
      if (k === 'IDENT' || k === 'RBRACE' || k === 'EOF') return;
      pos++;
    }
  }

  function parseDottedName(): string[] {
    const segs: string[] = [];
    segs.push(consume().text); // caller already verified it's IDENT
    while (peek().kind === 'DOT') {
      consume();
      if (peek().kind !== 'IDENT') {
        err(`Expected identifier after '.'`);
        break;
      }
      segs.push(consume().text);
    }
    return segs;
  }

  function parseValue(): ParsedValue {
    const t = peek();
    switch (t.kind) {
      case 'STRING':
        consume();
        return (t.value as string | undefined) ?? '';
      case 'NUMBER':
        consume();
        return (t.value as number | undefined) ?? 0;
      case 'BOOL':
        consume();
        return (t.value as boolean | undefined) ?? false;
      case 'NULL':
        consume();
        return null;
      case 'LBRACKET':
        return parseListOrMap();
      default:
        err(`Expected a value, got ${t.kind}`, t);
        if (t.kind !== 'EOF') consume();
        return null;
    }
  }

  function parseListOrMap(): ParsedValue {
    const open = consume(); // [
    // Empty list.
    if (peek().kind === 'RBRACKET') {
      consume();
      return [];
    }
    // Empty map: [:].
    if (peek().kind === 'COLON') {
      consume();
      if (peek().kind !== 'RBRACKET') {
        err(`Expected ']' after ':'`, open);
      } else {
        consume();
      }
      return {};
    }
    // Distinguish map from list by lookahead: KEY ':' starts a map.
    if (
      (peek().kind === 'STRING' || peek().kind === 'IDENT') &&
      peek(1).kind === 'COLON'
    ) {
      return parseMapEntries();
    }
    return parseListItems();
  }

  function parseMapEntries(): { [key: string]: ParsedValue } {
    const out: { [key: string]: ParsedValue } = {};
    while (true) {
      const keyTok = peek();
      let key: string | null = null;
      if (keyTok.kind === 'STRING') {
        key = (keyTok.value as string | undefined) ?? '';
        consume();
      } else if (keyTok.kind === 'IDENT') {
        key = keyTok.text;
        consume();
      } else {
        err('Expected map key', keyTok);
        break;
      }
      if (peek().kind !== 'COLON') {
        err(`Expected ':' after map key`);
      } else {
        consume();
      }
      const value = parseValue();
      if (key !== null) out[key] = value;
      if (peek().kind === 'COMMA') {
        consume();
        if (peek().kind === 'RBRACKET') break;
        continue;
      }
      break;
    }
    if (peek().kind !== 'RBRACKET') {
      err(`Expected ']' to close map`);
    } else {
      consume();
    }
    return out;
  }

  function parseListItems(): ParsedValue[] {
    const out: ParsedValue[] = [];
    while (true) {
      const before = pos;
      out.push(parseValue());
      // Defensive: if parseValue made no progress, break to avoid hang.
      if (pos === before) break;
      if (peek().kind === 'COMMA') {
        consume();
        if (peek().kind === 'RBRACKET') break;
        continue;
      }
      break;
    }
    if (peek().kind !== 'RBRACKET') {
      err(`Expected ']' to close list`);
    } else {
      consume();
    }
    return out;
  }

  function parseNode(): AstNode | null {
    const start = peek();
    if (start.kind !== 'IDENT') {
      err(`Expected a name, got ${start.kind}`, start);
      if (start.kind !== 'EOF') consume();
      return null;
    }
    const segments = parseDottedName();
    const next = peek();
    if (next.kind === 'EQ') {
      consume();
      const value = parseValue();
      return {
        kind: 'assignment',
        segments,
        value,
        line: start.line,
        col: start.col,
      };
    }
    if (next.kind === 'LBRACE') {
      consume();
      const body = parseBody();
      let endOffset: number;
      if (peek().kind !== 'RBRACE') {
        err(`Expected '}' to close block '${segments.join('.')}'`, start);
        // Fall back to the last consumed token's offset so we don't
        // produce nonsensical end positions for malformed blocks.
        const last = tokens[Math.max(0, pos - 1)];
        endOffset = last !== undefined ? last.offset + last.text.length : start.offset;
      } else {
        const closing = consume();
        endOffset = closing.offset + closing.text.length;
      }
      return {
        kind: 'block',
        segments,
        body,
        line: start.line,
        col: start.col,
        startOffset: start.offset,
        endOffset,
      };
    }
    err(
      `Expected '=' or '{' after '${segments.join('.')}', got ${next.kind}`,
      start,
    );
    return null;
  }

  function parseBody(): AstNode[] {
    const out: AstNode[] = [];
    while (peek().kind !== 'RBRACE' && peek().kind !== 'EOF') {
      const before = pos;
      const node = parseNode();
      if (node) {
        out.push(node);
      } else {
        // Guarantee progress even when parseNode bails without advancing.
        if (pos === before) pos++;
        recover();
      }
    }
    return out;
  }

  const top = parseBody();
  return { nodes: top, errors };
}
