// Round-trip tests for the upload pipeline.
//
// Two properties are verified separately:
//
// 1. **Idempotency** (for every golden): parse → emit → parse → emit
//    produces the same output as the first emit. This is the property
//    users experience: load a file, click download — load that, click
//    download again — get the same bytes the second time. Always must
//    hold.
//
// 2. **Byte-stable round-trip** (for a subset of goldens): parse → emit
//    reproduces the original golden byte-for-byte. This only works for
//    goldens whose source test state contained every alwaysEmit-eligible
//    field — i.e., realistic full-app outputs. Some emitter goldens were
//    constructed with stripped test states (e.g. escape-edges sets only
//    `diann.fasta_digest_params` and relies on `search_engine` being
//    absent from state.values so the `diann.search_params` alwaysEmit
//    predicate doesn't fire). After loading, `search_engine` is in
//    state.values, so the predicate fires on re-emit and adds
//    `diann.search_params` (default value). That's correct behavior but
//    breaks byte-equality. The subset below captures the goldens that
//    don't hit that quirk.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitConfig, type EmitOptions } from '../../emit/emitConfig';
import { parseConfig } from '../parseConfig';
import { mapToState } from '../mapToState';

const GOLDEN_DIR = join(__dirname, '../../emit/__tests__/golden');

// Match the version + timestamp the goldens were emitted with so the
// only diffs come from real parser/mapper bugs, not header drift.
const FIXED_OPTIONS: EmitOptions = {
  version: '1.0.0-test',
  timestamp: new Date('2026-01-15T12:00:00.000Z'),
};

// Goldens that survive a byte-stable round trip.
//
// The always-emitted `standard` execution profile breaks byte-stability for
// ordinary goldens: it is generated under an "Execution profile" banner, but
// on re-upload the parser captures it into preservedOuterText, so the second
// emit re-renders it under the generic "Preserved from uploaded config"
// banner instead. The content is identical; only the banner relabels. So
// those goldens are idempotency-only (still converge after one cycle —
// verified above).
//
// preserved-outer-blocks.config is the exception: it already carries its own
// profiles { } block, which suppresses the generated profile, so there is no
// banner to relabel and it stays byte-stable.
const BYTE_STABLE_GOLDENS = new Set(['preserved-outer-blocks.config']);

function loadGoldens(): { name: string; content: string }[] {
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.config'))
    .sort()
    .map((name) => ({
      name,
      content: readFileSync(join(GOLDEN_DIR, name), 'utf8'),
    }));
}

function loadAndEmit(content: string): string {
  const parsed = parseConfig(content);
  expect(parsed.errors).toEqual([]);
  expect(parsed.hadParamsBlock).toBe(true);
  const mapped = mapToState(parsed.entries, parsed.preservedOuterBlocks);
  const hardIssues = mapped.report.issues.filter(
    (i) =>
      i.kind === 'type-mismatch' ||
      i.kind === 'enum-mismatch' ||
      i.kind === 'unknown-param',
  );
  expect(hardIssues).toEqual([]);
  return emitConfig(mapped.state, FIXED_OPTIONS);
}

describe('round-trip — idempotency: a second load + emit matches the first', () => {
  const goldens = loadGoldens();

  it('has goldens to round-trip', () => {
    expect(goldens.length).toBeGreaterThan(0);
  });

  for (const { name, content } of goldens) {
    it(`${name} → idempotent`, () => {
      const firstEmit = loadAndEmit(content);
      const secondEmit = loadAndEmit(firstEmit);
      expect(secondEmit).toBe(firstEmit);
    });
  }
});

describe('round-trip — byte-stable on goldens with realistic full state', () => {
  for (const name of BYTE_STABLE_GOLDENS) {
    it(`${name} → parse + emit reproduces the original byte-for-byte`, () => {
      const content = readFileSync(join(GOLDEN_DIR, name), 'utf8');
      const reEmitted = loadAndEmit(content);
      expect(reEmitted).toBe(content);
    });
  }
});
