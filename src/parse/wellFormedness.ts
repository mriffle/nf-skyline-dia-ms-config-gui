// Syntactic well-formedness checker for the Groovy subset accepted by the
// upload pipeline. Treat this module as a pre-flight gate that runs BEFORE
// `parseConfig` / `mapToState`: if it finds any issues, the caller should
// reject the file outright rather than feeding partial / recovered entries
// downstream.
//
// The module is intentionally generic across "Groovy subset" config files:
// it knows nothing about the schema, paramMetadata, or any other
// project-specific concept. It only knows about the structural concept of a
// "scoped block" — by convention named `params { }` — that demarcates the
// region whose contents the host app models semantically. Everything outside
// that block is treated as opaque round-trip content (process { },
// profiles { }, etc.) and only the basic textual invariants are enforced
// there. That makes the module reusable from any other GUI built on the
// same parse stack with a different scoped-block name.
//
// What it catches:
//
//   FILE-WIDE (everywhere in the source — outer blocks included):
//     * Unterminated strings (single, double, triple-quoted).
//     * Unterminated /* */ block comments.
//     * Unmatched / mismatched braces and brackets at any nesting depth.
//
//   SCOPED to the `params { }` block (NOT enforced in outer blocks):
//     * GString interpolation `${...}` inside double-quoted strings.
//     * Unexpected characters (e.g. `@`, operators, semicolons).
//     * Invalid number literals.
//     * Any error reported by the parser (missing `=` / `{`, expected-value
//       with the wrong token kind, lists / maps not properly closed,
//       Nextflow-only selectors like `withName:NAME { … }`, dotted
//       reference values like `params.max_cpus` inside map literals, etc.).
//
// The scoping matters because outer blocks (process { }, profiles { }, etc.)
// round-trip verbatim — the parser captures their source slices via
// startOffset/endOffset and `parseConfig.collectOuterScope` re-emits them
// untouched. Their contents may use the full Groovy / Nextflow grammar; we
// don't model it, so we don't get to call it "malformed".
//
// The returned issues include a pre-formatted source-line snippet with a
// caret indicator so the consumer can render them directly in a fixed-width
// box without re-walking the source.

import { lex, type Token } from './groovyLexer';
import { parseTokens, type AstBlock, type AstNode } from './groovyParser';
import type { ParseError } from './types';

// The name of the "scoped" block. Hard-coded as 'params' to match the
// Nextflow convention. Callers from a different config grammar can fork
// this module and change this constant.
const SCOPED_BLOCK_NAME = 'params';

export type SyntaxIssueSeverity = 'error';

export interface SyntaxIssue {
  readonly message: string;
  readonly line: number; // 1-based
  readonly col: number; // 1-based
  readonly severity: SyntaxIssueSeverity;
  // Pre-formatted multi-line snippet: the source line(s) plus a caret on
  // the next line pointing at `col`. Ready to drop into a <pre>. Empty
  // string when the issue's position falls outside the source (e.g. EOF
  // after a truncated file).
  readonly snippet: string;
}

export interface WellFormednessReport {
  readonly isWellFormed: boolean;
  readonly issues: readonly SyntaxIssue[];
}

export function checkWellFormedness(source: string): WellFormednessReport {
  const sourceLines = splitLines(source);
  const collected: SyntaxIssue[] = [];

  const lexed = lex(source);

  // File-wide lex errors: textual integrity failures that affect the
  // whole file regardless of where they occur. An unterminated string at
  // the very end of a process { } block still mangles every token that
  // follows it; we have to report those.
  for (const e of lexed.errors) {
    if (isFileWideLexError(e.message)) {
      collected.push(toIssue(e, sourceLines));
    }
  }

  // File-wide balance check. The parser uses brace/bracket nesting to
  // identify block boundaries, so balance has to hold across the entire
  // file — even inside outer blocks we don't otherwise interpret.
  for (const e of checkBalance(lexed.tokens)) {
    collected.push(toIssue(e, sourceLines));
  }

  // Everything below is scoped to the `params { }` block (if present).
  // Outer blocks may use richer Groovy / Nextflow syntax (Nextflow
  // selectors like `withName:NAME { … }`, dotted reference values like
  // `params.max_cpus`, GString interpolation `${...}`, Groovy closures,
  // operators, etc.) that we deliberately don't model — they round-trip
  // verbatim via parseConfig's preservedOuterBlocks pipeline.
  const parsed = parseTokens(lexed.tokens);
  const scopedRange = findScopedBlockLineRange(source, parsed.nodes);

  if (scopedRange !== null) {
    const inScope = (e: ParseError): boolean =>
      e.line >= scopedRange.startLine && e.line <= scopedRange.endLine;

    // Scoped lex errors — the "subset violations" the lexer would
    // otherwise have surfaced everywhere.
    for (const e of lexed.errors) {
      if (!isFileWideLexError(e.message) && inScope(e)) {
        collected.push(toIssue(e, sourceLines));
      }
    }
    // Parse errors only count when they fall inside the scoped block.
    for (const e of parsed.errors) {
      if (inScope(e)) {
        collected.push(toIssue(e, sourceLines));
      }
    }
  }
  // When there's no scoped block, we don't report any scoped issues.
  // The downstream caller (parseConfig) will produce its own "no
  // params { } block found" diagnostic with better context.

  const issues = dedupe(collected);
  return {
    isWellFormed: issues.length === 0,
    issues,
  };
}

// Recognises lexer error messages whose problem applies to the whole
// file. Truly fatal lexical issues — anything that breaks the lexer's
// ability to find subsequent tokens. Other lex errors (GString
// interpolation, unexpected chars, invalid numbers) are "subset
// violations" that are valid Groovy / Nextflow even though we don't
// model them; those are scoped to inside the params block.
function isFileWideLexError(message: string): boolean {
  return /^Unterminated /.test(message);
}

// Walks the parsed AST to find the scoped block (`params { }`) and
// returns its line range. Uses the same two-pass strategy as
// `parseConfig.findParamsBlock`: prefer a top-level block before
// descending into wrappers like `profiles { standard { params { } } }`.
function findScopedBlockLineRange(
  source: string,
  nodes: readonly AstNode[],
): { readonly startLine: number; readonly endLine: number } | null {
  const block = findScopedBlockNode(nodes);
  if (!block) return null;
  return {
    startLine: block.line,
    endLine: offsetToLine(source, block.endOffset),
  };
}

function findScopedBlockNode(nodes: readonly AstNode[]): AstBlock | null {
  for (const node of nodes) {
    if (node.kind !== 'block') continue;
    if (node.segments[0] === SCOPED_BLOCK_NAME) return node;
  }
  for (const node of nodes) {
    if (node.kind !== 'block') continue;
    const nested = findScopedBlockNode(node.body);
    if (nested) return nested;
  }
  return null;
}

function offsetToLine(source: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Balance pass — catches unmatched / mismatched `{` `}` `[` `]`.
//
// The parser already complains about most cases (e.g. it knows it expected
// `}` when EOF arrives mid-block), but a stray closing `}` or `]` at file
// scope is silently consumed by `parseBody`'s loop termination. This pass
// fills that hole and also gives nicer diagnostics for nested mismatches
// like `{ ... ]`.
// ---------------------------------------------------------------------------

interface OpenBrace {
  readonly kind: 'BRACE' | 'BRACKET';
  readonly token: Token;
}

function checkBalance(tokens: readonly Token[]): ParseError[] {
  const stack: OpenBrace[] = [];
  const errors: ParseError[] = [];

  for (const t of tokens) {
    switch (t.kind) {
      case 'LBRACE':
        stack.push({ kind: 'BRACE', token: t });
        break;
      case 'LBRACKET':
        stack.push({ kind: 'BRACKET', token: t });
        break;
      case 'RBRACE': {
        const top = stack[stack.length - 1];
        if (!top) {
          errors.push({
            message: "Unmatched '}' (no opening '{' to close)",
            line: t.line,
            col: t.col,
          });
        } else if (top.kind !== 'BRACE') {
          errors.push({
            message: `Mismatched '}' — expected ']' to close '[' opened at line ${top.token.line}, col ${top.token.col}`,
            line: t.line,
            col: t.col,
          });
          // Deliberately do NOT pop. The user almost certainly meant to
          // write the matching closer for `top`; leaving it on the stack
          // lets the next correct closer match it, so we don't cascade a
          // single typo into two "unmatched" errors.
        } else {
          stack.pop();
        }
        break;
      }
      case 'RBRACKET': {
        const top = stack[stack.length - 1];
        if (!top) {
          errors.push({
            message: "Unmatched ']' (no opening '[' to close)",
            line: t.line,
            col: t.col,
          });
        } else if (top.kind !== 'BRACKET') {
          errors.push({
            message: `Mismatched ']' — expected '}' to close '{' opened at line ${top.token.line}, col ${top.token.col}`,
            line: t.line,
            col: t.col,
          });
        } else {
          stack.pop();
        }
        break;
      }
      default:
        break;
    }
  }

  for (const open of stack) {
    errors.push({
      message:
        open.kind === 'BRACE'
          ? "Unmatched '{' — no closing '}' before end of file"
          : "Unmatched '[' — no closing ']' before end of file",
      line: open.token.line,
      col: open.token.col,
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Snippet construction
// ---------------------------------------------------------------------------

function splitLines(source: string): string[] {
  // Handle CRLF, LF, and mixed line endings.
  return source.split(/\r\n|\r|\n/);
}

function toIssue(e: ParseError, sourceLines: readonly string[]): SyntaxIssue {
  return {
    message: e.message,
    line: e.line,
    col: e.col,
    severity: 'error',
    snippet: buildSnippet(sourceLines, e.line, e.col),
  };
}

const GUTTER_WIDTH = 4; // line numbers up to 9999 fit; longer files just shift.

function buildSnippet(
  sourceLines: readonly string[],
  line: number,
  col: number,
): string {
  if (line < 1 || line > sourceLines.length) return '';
  const text = sourceLines[line - 1] ?? '';
  const lineNumStr = String(line).padStart(GUTTER_WIDTH);
  const gutterFiller = ' '.repeat(GUTTER_WIDTH);
  // Match the column position character-for-character so tabs in the
  // source line indent the caret the same way. Non-tab characters become
  // single spaces so other whitespace doesn't blow up the indent.
  const colOffset = Math.max(0, col - 1);
  const pad = text
    .slice(0, Math.min(colOffset, text.length))
    .replace(/[^\t]/g, ' ');
  // If col extends past the line content (e.g. an "expected closing brace"
  // points at EOF on a blank line), pad with spaces so the caret still
  // lines up where the diagnostic claims.
  const overshoot = colOffset > text.length ? ' '.repeat(colOffset - text.length) : '';
  const caret = `${gutterFiller} | ${pad}${overshoot}^`;
  return `${lineNumStr} | ${text}\n${caret}`;
}

// ---------------------------------------------------------------------------
// Dedupe
//
// Combining lex + structural + parse errors occasionally surfaces the same
// underlying problem from two angles (e.g. a missing `]` is flagged by
// both the balance pass and the parser's "Expected ']' to close list").
// Keep the first occurrence at each (line, col, message) key — later
// duplicates would just be noise in the dialog.
// ---------------------------------------------------------------------------

function dedupe(issues: readonly SyntaxIssue[]): SyntaxIssue[] {
  const seen = new Set<string>();
  const out: SyntaxIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.line}:${issue.col}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  out.sort((a, b) => a.line - b.line || a.col - b.col);
  return out;
}
