// Top-level entry point for the parse pipeline.
//
//   text  →  lex  →  parseTokens  →  locate `params { }`  →  flatten  →  ParseResult
//
// Phase 1 stops here. Phase 2 (mapToState) takes the ParsedEntry list and
// turns it into a FormState plus an UploadReport.

import { lex } from './groovyLexer';
import { parseTokens, type AstBlock, type AstNode } from './groovyParser';
import type {
  DuplicatePath,
  IgnoredOuterBlock,
  ParseError,
  ParseResult,
  ParsedEntry,
} from './types';

export function parseConfig(text: string): ParseResult {
  const lexed = lex(text);
  const parsed = parseTokens(lexed.tokens);
  const errors: ParseError[] = [...lexed.errors, ...parsed.errors];

  const located = findParamsBlock(parsed.nodes, []);
  const ignoredOuterBlocks: IgnoredOuterBlock[] = collectIgnoredOuterBlocks(
    parsed.nodes,
    located,
  );

  if (!located) {
    return {
      entries: [],
      errors,
      ignoredOuterBlocks,
      duplicates: [],
      hadParamsBlock: false,
    };
  }

  const raw: ParsedEntry[] = [];
  flatten(located.block.body, located.initialPrefix, raw);

  const { entries, duplicates } = deduplicate(raw);

  return {
    entries,
    errors,
    ignoredOuterBlocks,
    duplicates,
    hadParamsBlock: true,
  };
}

interface LocatedParams {
  readonly block: AstBlock;
  // Path prefix for everything inside `block.body`. For a plain
  // `params { }` block this is empty; for `params.pdc { ... }` it's
  // `['pdc']` so entries inside become `pdc.study_id` etc.
  readonly initialPrefix: readonly string[];
  // Outer path from file root to (but not including) the `params` segment.
  // Empty when params is top-level; ['profiles', 'standard'] when wrapped.
  readonly outerPath: readonly string[];
}

// Two-pass search: prefer a `params` block at the current depth before
// descending into wrappers. This means `process { } params { }` finds the
// real params block, and `profiles { standard { params { } } }` still
// works for files wrapped in a profile.
function findParamsBlock(
  nodes: readonly AstNode[],
  path: readonly string[],
): LocatedParams | null {
  for (const node of nodes) {
    if (node.kind !== 'block') continue;
    if (node.segments[0] === 'params') {
      return {
        block: node,
        initialPrefix: node.segments.slice(1),
        outerPath: path,
      };
    }
  }
  for (const node of nodes) {
    if (node.kind !== 'block') continue;
    const nested = findParamsBlock(node.body, [...path, ...node.segments]);
    if (nested) return nested;
  }
  return null;
}

function collectIgnoredOuterBlocks(
  topLevel: readonly AstNode[],
  located: LocatedParams | null,
): IgnoredOuterBlock[] {
  const out: IgnoredOuterBlock[] = [];
  // Identify the top-level node that contains the chosen params block so
  // we don't report it as ignored.
  const hostingTopName: string | null =
    located && located.outerPath.length > 0 ? (located.outerPath[0] ?? null) : null;
  for (const node of topLevel) {
    if (node.kind === 'assignment') {
      // Top-level assignments are outside `params { }` and not loaded.
      out.push({
        name: node.segments.join('.'),
        line: node.line,
        col: node.col,
      });
      continue;
    }
    if (located && located.outerPath.length === 0 && node === located.block) {
      // The chosen top-level params block — not ignored.
      continue;
    }
    if (hostingTopName !== null && node.segments[0] === hostingTopName) {
      // The wrapper that contains the chosen params block — not ignored.
      continue;
    }
    out.push({
      name: node.segments.join('.'),
      line: node.line,
      col: node.col,
    });
  }
  return out;
}

function flatten(
  nodes: readonly AstNode[],
  prefix: readonly string[],
  out: ParsedEntry[],
): void {
  for (const node of nodes) {
    if (node.kind === 'assignment') {
      const path = [...prefix, ...node.segments].join('.');
      out.push({
        path,
        value: node.value,
        line: node.line,
        col: node.col,
      });
    } else {
      flatten(node.body, [...prefix, ...node.segments], out);
    }
  }
}

interface DedupeResult {
  readonly entries: ParsedEntry[];
  readonly duplicates: DuplicatePath[];
}

function deduplicate(rawEntries: readonly ParsedEntry[]): DedupeResult {
  const byPath = new Map<string, ParsedEntry[]>();
  for (const e of rawEntries) {
    const arr = byPath.get(e.path);
    if (arr) arr.push(e);
    else byPath.set(e.path, [e]);
  }
  const entries: ParsedEntry[] = [];
  const duplicates: DuplicatePath[] = [];
  for (const e of rawEntries) {
    const arr = byPath.get(e.path);
    if (!arr) continue;
    if (arr.length === 1) {
      entries.push(e);
      continue;
    }
    const last = arr[arr.length - 1]!;
    if (e !== last) continue;
    entries.push(e);
    const first = arr[0]!;
    duplicates.push({
      path: e.path,
      firstValue: first.value,
      finalValue: last.value,
      firstLine: first.line,
      finalLine: last.line,
    });
  }
  return { entries, duplicates };
}
