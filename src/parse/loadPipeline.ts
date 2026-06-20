// Shared text → state load pipeline. Used by BOTH the "Load config…" file
// uploader (UploadControl) and the in-place editable preview (PreviewPane).
//
//   text → checkWellFormedness (gate) → parseConfig → mapToState
//
// The well-formedness gate is run first and is a hard stop (see CLAUDE.md
// §9 / hard rule #10): a recovered partial parse must never load silently.
// `skipWellFormedness` exists only for the deliberate user-driven "Import
// anyway" bypass, where the user asserts our checker has a false positive.

import { mapToState, type MapResult } from './mapToState';
import { parseConfig } from './parseConfig';
import type { ParseError, ParseResult } from './types';
import { checkWellFormedness, type SyntaxIssue } from './wellFormedness';

export type LoadOutcome =
  | { readonly kind: 'syntax-errors'; readonly issues: readonly SyntaxIssue[] }
  | {
      readonly kind: 'no-params';
      readonly hadParamsBlock: boolean;
      readonly errors: readonly ParseError[];
    }
  | { readonly kind: 'ok'; readonly parsed: ParseResult; readonly mapped: MapResult };

export interface LoadPipelineOptions {
  // Skip the pre-flight well-formedness gate. Only set this for the
  // explicit "Import anyway" override — never on the default path.
  readonly skipWellFormedness?: boolean;
}

export function runLoadPipeline(
  text: string,
  options: LoadPipelineOptions = {},
): LoadOutcome {
  if (!options.skipWellFormedness) {
    const wf = checkWellFormedness(text);
    if (!wf.isWellFormed) {
      return { kind: 'syntax-errors', issues: wf.issues };
    }
  }

  const parsed = parseConfig(text);
  if (!parsed.hadParamsBlock || parsed.entries.length === 0) {
    const errors: readonly ParseError[] =
      parsed.errors.length > 0
        ? parsed.errors
        : [
            {
              line: 0,
              col: 0,
              message: parsed.hadParamsBlock
                ? 'The params { } block contained no parameters.'
                : 'No params { } block was found.',
            },
          ];
    return { kind: 'no-params', hadParamsBlock: parsed.hadParamsBlock, errors };
  }

  const mapped = mapToState(parsed.entries, parsed.preservedOuterBlocks);
  return { kind: 'ok', parsed, mapped };
}
