// Comprehensive tests for the syntactic well-formedness checker.
//
// The checker is the upload pipeline's gate: when it returns issues, the
// file is rejected before any state-load attempt. So the tests are
// organized around two questions:
//   1) does every malformed shape produce AT LEAST one issue at the right
//      line, with a reasonable message?
//   2) does every known-good shape (incl. all emit goldens) produce zero
//      issues?

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkWellFormedness, type SyntaxIssue } from '../wellFormedness';

// Convenience: assert that AT LEAST one issue matches the given line +
// message substring. We don't pin exact messages because the lexer's
// "Unterminated string" and the parser's "Expected" wordings could shift
// slightly and we don't want brittle tests; we pin the substance.
function expectIssueAt(
  issues: readonly SyntaxIssue[],
  line: number,
  messageSubstring: string,
): void {
  const match = issues.find(
    (i) => i.line === line && i.message.includes(messageSubstring),
  );
  if (!match) {
    const dump = issues
      .map((i) => `  line ${i.line}, col ${i.col}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Expected an issue at line ${line} containing "${messageSubstring}". Got:\n${dump}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

describe('checkWellFormedness — strings', () => {
  it("flags an unterminated single-quoted string (no close before newline)", () => {
    const source = [
      'params {',
      "  foo = 'bar",
      '  good = 1',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expectIssueAt(report.issues, 2, 'Unterminated');
  });

  it('flags an unterminated double-quoted string', () => {
    const source = [
      'params {',
      '  foo = "still going',
      '  good = 1',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expectIssueAt(report.issues, 2, 'Unterminated');
  });

  it('flags an unterminated triple-quoted string', () => {
    const source = [
      'params {',
      "  foo = '''line one",
      '  line two',
      '  // never closed',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /Unterminated triple/i.test(i.message)),
    ).toBe(true);
  });

  it('rejects GString interpolation in double-quoted strings', () => {
    const source = [
      'params {',
      '  foo = "Hello ${name}"',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /GString interpolation/.test(i.message)),
    ).toBe(true);
  });

  it('accepts a perfectly fine multi-line triple-quoted string', () => {
    const source = [
      'params {',
      "  foo = '''line one",
      '  line two',
      "  '''",
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
    expect(report.issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

describe('checkWellFormedness — comments', () => {
  it('flags an unterminated /* */ block comment', () => {
    const source = [
      'params {',
      '  /* never closed',
      '  foo = 1',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expectIssueAt(report.issues, 2, 'Unterminated');
  });

  it('accepts well-formed line and block comments', () => {
    const source = [
      '// header comment',
      '/* block',
      '   spanning lines */',
      'params { foo = 1 /* inline */ }',
      '// trailing',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
    expect(report.issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Brace / bracket balance — the user's headline example case
// ---------------------------------------------------------------------------

describe('checkWellFormedness — balance', () => {
  it('flags a multi-line list whose opener line is commented out', () => {
    // The exact scenario the user called out: the first line of a
    // multi-line list got commented out, leaving an orphan continuation.
    const source = [
      'params {',
      "  // foo = ['bar'",
      "    'bar2']",
      '  good = 1',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    // The orphan `]` is on line 3. Either the structural pass flags it as
    // a mismatched closer OR the parser sees the stray STRING before it.
    // We require at least one issue from somewhere in lines 2–3.
    const inOrphanRegion = report.issues.some(
      (i) => i.line === 2 || i.line === 3,
    );
    expect(inOrphanRegion).toBe(true);
  });

  it("flags a stray '}' at top level", () => {
    const source = ['params { foo = 1 }', '}'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expectIssueAt(report.issues, 2, "Unmatched '}'");
  });

  it("flags a stray ']' at top level", () => {
    const source = ['params { foo = 1 }', ']'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expectIssueAt(report.issues, 2, "Unmatched ']'");
  });

  it("flags a missing closing brace on the params block", () => {
    const source = ['params {', '  foo = 1'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => i.message.includes("Unmatched '{'")),
    ).toBe(true);
  });

  it("flags a missing closing bracket on a list", () => {
    const source = ['params {', '  foo = [1, 2, 3', '}'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some(
        (i) => i.message.includes("Unmatched '['") || /close list/i.test(i.message),
      ),
    ).toBe(true);
  });

  it("flags a mismatched '}' that should have been ']'", () => {
    const source = ['params {', '  foo = [1, 2, 3}', '}'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /Mismatched/.test(i.message)),
    ).toBe(true);
  });

  it("does not flag deeply nested matched braces and brackets", () => {
    const source = [
      'params {',
      '  pdc {',
      "    samples = [['k1': 'v1'], ['k2': 'v2']]",
      '  }',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
    expect(report.issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tokens / grammar
// ---------------------------------------------------------------------------

describe('checkWellFormedness — token / grammar errors', () => {
  it("flags an unexpected character", () => {
    const source = ['params {', '  @ = 1', '}'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expectIssueAt(report.issues, 2, 'Unexpected');
  });

  it("flags a missing value after '='", () => {
    const source = ['params {', '  foo =', '}'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /Expected a value/i.test(i.message)),
    ).toBe(true);
  });

  it("flags a list item that's not a recognised value (bare ident inside [])", () => {
    const source = ['params {', '  foo = [bareident, 1, 2]', '}'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /Expected a value/i.test(i.message)),
    ).toBe(true);
  });

  it("flags a bare identifier on the RHS of an assignment", () => {
    const source = ['params {', '  foo = bar', '}'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /Expected a value/i.test(i.message)),
    ).toBe(true);
  });

  it("flags an assignment with no = or { after the LHS", () => {
    const source = ['params {', '  broken', '  good = 1', '}'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /Expected '=' or '\{'/.test(i.message)),
    ).toBe(true);
  });

  it("flags a stray STRING inside the params block where a name was expected", () => {
    const source = [
      'params {',
      "  'orphan string'",
      "  foo = 1",
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /Expected a name/i.test(i.message)),
    ).toBe(true);
  });

  it("does NOT flag grammar issues outside the params block (outer content is opaque)", () => {
    // A stray top-level STRING with no params { } block: not a config,
    // but not our problem here. The downstream `parseConfig` will surface
    // "no params block found" — well-formedness shouldn't try to police
    // grammar in the absence of a scoped block.
    const source = ["'orphan string'"].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Aggregation: many errors in one file
// ---------------------------------------------------------------------------

describe('checkWellFormedness — multiple issues', () => {
  it('reports each independent error in a file with several', () => {
    const source = [
      'params {',
      "  a = 'never closes",
      "  b = 'also bad",
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.filter((i) => /Unterminated/.test(i.message)).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('reports issues in stable line-then-col order', () => {
    const source = [
      'params {',
      '  foo = [',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    const sorted = [...report.issues].sort(
      (a, b) => a.line - b.line || a.col - b.col,
    );
    expect(report.issues).toEqual(sorted);
  });

  it('dedupes identical (line, col, message) tuples produced by overlapping passes', () => {
    // A missing closing brace is reported by both the balance pass and
    // (when the parser reaches EOF inside the block) the parser. They
    // happen at different positions, so they won't dedupe. This test
    // just asserts that whatever issues exist are unique.
    const source = ['params {', '  foo = 1'].join('\n');
    const report = checkWellFormedness(source);
    const keys = report.issues.map((i) => `${i.line}:${i.col}:${i.message}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ---------------------------------------------------------------------------
// Snippets — output format
// ---------------------------------------------------------------------------

describe('checkWellFormedness — snippet output', () => {
  it("includes the offending source line and a caret on the column", () => {
    const source = ['params {', "  foo = 'bar", '}'].join('\n');
    const report = checkWellFormedness(source);
    const unterm = report.issues.find((i) => /Unterminated/.test(i.message));
    expect(unterm).toBeDefined();
    // The snippet renders the source line + a caret on the next line.
    const lines = unterm!.snippet.split('\n');
    expect(lines.length).toBe(2);
    // First line is "   2 |   foo = 'bar" (4-char gutter, ' | ', source).
    expect(lines[0]).toContain("foo = 'bar");
    expect(lines[0]).toContain('2 |');
    // Caret line has a single '^' aligned to the column.
    expect(lines[1]).toMatch(/\^$/);
    // The caret should sit at the column of the opening quote (col 9 of
    // the source line, which has 8 chars of leading prefix). Snippet
    // prefix is "<gutter> | " = 4 + 3 = 7 chars, then 8 chars of indent
    // matching the source up to (but not including) the offending col.
    // So the caret is at 0-based index 7 + 8 = 15.
    expect(lines[1]?.indexOf('^')).toBe(7 + 8);
  });

  it('omits the snippet when the position is past end of file', () => {
    // Reported by the parser when EOF arrives where a closer was needed.
    // The well-formedness checker should still surface a useful message;
    // the snippet is allowed to be empty when the position is past the
    // last source line.
    const source = 'params {';
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    // The structural balance pass points at the opening `{` (line 1),
    // which IS in the source, so it WILL have a snippet. We only require
    // that every issue's snippet field is a string (possibly empty).
    for (const i of report.issues) {
      expect(typeof i.snippet).toBe('string');
    }
  });

  it('handles CRLF line endings', () => {
    const source = "params {\r\n  foo = 'bar\r\n}";
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    const unterm = report.issues.find((i) => /Unterminated/.test(i.message));
    expect(unterm).toBeDefined();
    expect(unterm!.snippet).toContain("foo = 'bar");
  });
});

// ---------------------------------------------------------------------------
// Well-formed inputs
// ---------------------------------------------------------------------------

describe('checkWellFormedness — well-formed inputs', () => {
  it('reports nothing for an empty file', () => {
    const report = checkWellFormedness('');
    expect(report.isWellFormed).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('reports nothing for a comments-only file', () => {
    const source = ['// just a header', '/* block', '   comment */'].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('reports nothing for a minimal valid params block', () => {
    const source = "params { foo = 1 }";
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('reports nothing for a realistic mix of features', () => {
    const source = [
      '// Header comment',
      'params {',
      "  fasta = '/db.fasta'",
      "  pdc.study_id = 'PDC000123'",
      '  encyclopedia {',
      "    quant.params = '-flag'",
      '  }',
      "  quant_spectra_dir = ['PlateA': '/data/A', 'PlateB': '/data/B']",
      '  flag = true',
      '  count = 5',
      '  empty_list = []',
      '  empty_map = [:]',
      '  multiline_list = [',
      "    'a',",
      "    'b',",
      '  ]',
      '}',
      "process { cpus = 4 }",
      "includeConfig '/some/other.config'",
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
    expect(report.issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Outer-block tolerance — strictness is scoped to inside `params { }`.
//
// Outer blocks like `process { ... }` and `profiles { ... }` may use the
// full Groovy / Nextflow grammar: Nextflow process selectors
// (`withName:NAME { … }`, `withLabel:LABEL { … }`), dotted reference
// values (`params.max_cpus`), GString interpolation in double-quoted
// strings, closures, operators, etc. These round-trip verbatim via
// parseConfig's outer-block preservation pipeline, and our limited
// Groovy-subset parser was never meant to model them. Flagging them as
// "malformed" is just wrong.
// ---------------------------------------------------------------------------

describe('checkWellFormedness — outer-block tolerance', () => {
  it("accepts Nextflow `withName:` selectors inside a process { } block", () => {
    const source = [
      'params {',
      "  fasta = '/db.fasta'",
      '}',
      'process {',
      '  withName:SKYLINE_IMPORT_MS_FILE {',
      "    memory = '24.GB'",
      '  }',
      '  withName:DIANN_MBR {',
      "    memory = '400.GB'",
      '  }',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("accepts Nextflow `withLabel:` selectors", () => {
    const source = [
      'params {',
      "  fasta = '/db.fasta'",
      '}',
      'process {',
      '  withLabel:proteowizard {',
      "    container = 'someimage:tag'",
      '  }',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
  });

  it("accepts dotted reference values inside outer-block map literals", () => {
    // `resourceLimits = [ cpus: params.max_cpus, time: params.max_time ]`
    // is normal Nextflow but uses dotted references our parser doesn't
    // model. It must survive well-formedness when it lives outside the
    // params block.
    const source = [
      'params {',
      "  fasta = '/db.fasta'",
      '}',
      'process {',
      '  resourceLimits = [ cpus: params.max_cpus, memory: params.max_memory, time: params.max_time ]',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
  });

  it("accepts GString interpolation in double-quoted strings inside outer blocks", () => {
    const source = [
      'params {',
      "  fasta = '/db.fasta'",
      '}',
      'process {',
      '  publishDir "${params.outdir}/results"',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
  });

  it("accepts the user's full process { } block as a regression case", () => {
    // Reproduces the exact shape the user reported. The whole `process { }`
    // block should pass even though it contains process selectors with
    // colon syntax, deeply nested blocks, and dotted reference values.
    const source = [
      'params {',
      "  fasta = '/db.fasta'",
      "  search_engine = 'diann'",
      '}',
      'process {',
      '  withName:SKYLINE_IMPORT_MS_FILE {',
      "    memory = '24.GB'",
      '  }',
      '  withName:SKYLINE_ANNOTATE_DOCUMENT {',
      "    memory = '64.GB'",
      '  }',
      '  withName:FILTER_IMPUTE_NORMALIZE {',
      "    memory = '128.GB'",
      '  }',
      '  withName:GENERATE_BATCH_REPORT {',
      "    memory = '128.GB'",
      '  }',
      '  withName:SKYLINE_MERGE_RESULTS {',
      "    memory = '64.GB'",
      '  }',
      '  withName:DIANN_MBR {',
      "    memory = '400.GB'",
      '  }',
      '  withName:EXPORT_TABLES {',
      "    memory = '128.GB'",
      '  }',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    if (!report.isWellFormed) {
      const dump = report.issues
        .map((i) => `  line ${i.line}, col ${i.col}: ${i.message}`)
        .join('\n');
      throw new Error(`Expected well-formed; got:\n${dump}`);
    }
    expect(report.isWellFormed).toBe(true);
  });

  it("accepts profiles { } with nested process { } using full Nextflow grammar", () => {
    const source = [
      "params { fasta = '/db.fasta' }",
      'profiles {',
      '  standard {',
      '    process {',
      '      withLabel:proteowizard {',
      "        container = 'someimage'",
      '      }',
      '      withName:CARAFE {',
      "        memory = '32.GB'",
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(true);
  });

  it("STILL flags syntax errors inside the params block even when the file has rich outer blocks", () => {
    // The fix must not turn the gate into a no-op. A genuine error
    // inside params { } must surface regardless of what's in outer
    // blocks.
    const source = [
      'params {',
      "  fasta = '/db.fasta",
      '}',
      'process {',
      '  withName:X {',
      "    memory = '24.GB'",
      '  }',
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /Unterminated/.test(i.message)),
    ).toBe(true);
  });

  it("STILL flags file-wide problems even when they happen inside outer blocks", () => {
    // An unterminated string inside an outer block is still a textual
    // integrity violation that breaks subsequent lexing. We must flag
    // it — round-trip would corrupt the file otherwise.
    const source = [
      "params { fasta = '/db.fasta' }",
      'process {',
      '  // never closes',
      "  container = 'foo",
      '}',
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /Unterminated/.test(i.message)),
    ).toBe(true);
  });

  it("STILL flags brace imbalance even when caused by an outer block", () => {
    // The balance pass is file-wide. Missing `}` in process { } breaks
    // the file just as much as it would in params { }.
    const source = [
      "params { fasta = '/db.fasta' }",
      'process {',
      '  withName:X {',
      "    memory = '24.GB'",
      '  }',
      // missing closing `}` for process
    ].join('\n');
    const report = checkWellFormedness(source);
    expect(report.isWellFormed).toBe(false);
    expect(
      report.issues.some((i) => /Unmatched '\{'/.test(i.message)),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression guard: every emitter golden must pass the well-formedness check.
// If the emitter starts producing something the checker can't handle,
// THAT'S a bug in either the emitter or the checker.
// ---------------------------------------------------------------------------

describe('checkWellFormedness — emit goldens are well-formed', () => {
  const GOLDEN_DIR = join(__dirname, '../../emit/__tests__/golden');
  const goldens = readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.config'))
    .map((name) => ({
      name,
      content: readFileSync(join(GOLDEN_DIR, name), 'utf8'),
    }));

  it('sanity: at least one golden exists', () => {
    expect(goldens.length).toBeGreaterThan(0);
  });

  for (const { name, content } of goldens) {
    it(`${name} is syntactically well-formed`, () => {
      const report = checkWellFormedness(content);
      if (!report.isWellFormed) {
        const dump = report.issues
          .map((i) => `  line ${i.line}, col ${i.col}: ${i.message}`)
          .join('\n');
        throw new Error(`${name} unexpectedly flagged as malformed:\n${dump}`);
      }
      expect(report.issues).toEqual([]);
    });
  }
});
