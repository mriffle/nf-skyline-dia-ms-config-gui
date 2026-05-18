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

// Named braced block at file scope (process { }, profiles { }, etc.)
// that's NOT the chosen params block or the wrapper that contains it.
// Captured with verbatim source text so the emitter can preserve it
// after the generated params block on round-trip.
export interface PreservedOuterBlock extends SourcePosition {
  readonly name: string; // dotted name, e.g. "process" or "profiles.standard"
  readonly text: string; // verbatim source slice from `name` through `}`
}

// Bare assignment at file scope (workDir = '/x', nextflow.enable.dsl = 2).
// Reported for diagnostics but not preserved — there's no good way to
// reason about them without evaluating their right-hand side.
export interface IgnoredTopLevelAssignment extends SourcePosition {
  readonly name: string; // dotted name from the LHS
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
  readonly preservedOuterBlocks: readonly PreservedOuterBlock[];
  readonly ignoredTopLevelAssignments: readonly IgnoredTopLevelAssignment[];
  readonly duplicates: readonly DuplicatePath[];
  // True when a `params { }` block was located somewhere in the file.
  // False means the file may not be a pipeline.config at all.
  readonly hadParamsBlock: boolean;
}
