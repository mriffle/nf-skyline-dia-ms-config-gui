// Shared types for the upload-parser pipeline. The parser reads a Groovy
// pipeline.config file (the format the emitter produces) and turns it into
// a flat list of (path, value) entries plus a structured report of any
// problems encountered.
//
// This module is the boundary between phase 1 (parsing) and phase 2
// (mapping to FormState). Anything in here is consumed by both.

export type ParsedValue =
  | string
  | number
  | boolean
  | null
  | readonly ParsedValue[]
  | { readonly [key: string]: ParsedValue };

export interface SourcePosition {
  readonly line: number; // 1-based
  readonly col: number; // 1-based
}

export interface ParsedEntry extends SourcePosition {
  readonly path: string; // dotted, e.g. "pdc.study_id"
  readonly value: ParsedValue;
}

export interface ParseError extends SourcePosition {
  readonly message: string;
}

export interface IgnoredOuterBlock extends SourcePosition {
  readonly name: string; // dotted name, e.g. "process" or "profiles.standard"
}

export interface DuplicatePath {
  readonly path: string;
  readonly firstValue: ParsedValue;
  readonly finalValue: ParsedValue;
  readonly firstLine: number;
  readonly finalLine: number;
}

export interface ParseResult {
  readonly entries: readonly ParsedEntry[];
  readonly errors: readonly ParseError[];
  readonly ignoredOuterBlocks: readonly IgnoredOuterBlock[];
  readonly duplicates: readonly DuplicatePath[];
  // True when a `params { }` block was located somewhere in the file.
  // False means the file may not be a pipeline.config at all.
  readonly hadParamsBlock: boolean;
}
