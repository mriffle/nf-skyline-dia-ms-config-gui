// Phase-1 smoke check: every emitter golden file must parse cleanly. The
// full byte-stable round-trip (parse → state → emit → identical output)
// will land in phase 2 once the mapper exists; here we just assert the
// parser handles every shape the emitter produces today.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../parseConfig';
import type { ParsedEntry } from '../types';

const GOLDEN_DIR = join(__dirname, '../../emit/__tests__/golden');

function entryMap(entries: readonly ParsedEntry[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const e of entries) out[e.path] = e.value;
  return out;
}

function loadGoldens(): { name: string; content: string }[] {
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.config'))
    .map((name) => ({
      name,
      content: readFileSync(join(GOLDEN_DIR, name), 'utf8'),
    }));
}

describe('parseConfig — emitter goldens parse cleanly', () => {
  const goldens = loadGoldens();

  // Sanity: we expect a non-trivial set of golden files.
  it('has goldens to test', () => {
    expect(goldens.length).toBeGreaterThan(0);
  });

  // Goldens that intentionally carry outer blocks (process { }, etc.) —
  // for those we expect non-empty preservedOuterBlocks rather than an
  // empty list. Anything else should round-trip cleanly with no outer
  // content at all.
  const GOLDENS_WITH_OUTER_BLOCKS = new Set(['preserved-outer-blocks.config']);

  for (const { name, content } of goldens) {
    it(`${name} → parses with no errors and finds a params block`, () => {
      const r = parseConfig(content);
      expect(r.errors).toEqual([]);
      expect(r.hadParamsBlock).toBe(true);
      if (GOLDENS_WITH_OUTER_BLOCKS.has(name)) {
        expect(r.preservedOuterBlocks.length).toBeGreaterThan(0);
      } else {
        expect(r.preservedOuterBlocks).toEqual([]);
      }
      expect(r.ignoredTopLevelAssignments).toEqual([]);
      expect(r.duplicates).toEqual([]);
      // Every golden has at least the alwaysEmit search_engine entry.
      expect(r.entries.length).toBeGreaterThan(0);
    });
  }
});

describe('parseConfig — golden spot checks', () => {
  it('general-batch-map: quant_spectra_dir is a map of plate → path', () => {
    const content = readFileSync(
      join(GOLDEN_DIR, 'general-batch-map.config'),
      'utf8',
    );
    const r = parseConfig(content);
    expect(r.errors).toEqual([]);
    const m = entryMap(r.entries);
    expect(m['quant_spectra_dir']).toEqual({
      PlateA: '/data/A',
      PlateB: '/data/B',
      PlateC: '/data/C',
    });
    expect(m['search_engine']).toBe('diann');
  });

  it('escape-edges: round-trips backslash/quote escapes', () => {
    const content = readFileSync(
      join(GOLDEN_DIR, 'escape-edges.config'),
      'utf8',
    );
    const r = parseConfig(content);
    expect(r.errors).toEqual([]);
    const m = entryMap(r.entries);
    // The emitter wrote '--cut \'K*,R*,!*P\' --bs\\path' — decoding gives
    // the original literal back.
    expect(m['diann.fasta_digest_params']).toBe(
      `--cut 'K*,R*,!*P' --bs\\path`,
    );
  });

  it('pdc-carafe-sample: pdc.study_id and carafe.* are flattened', () => {
    const content = readFileSync(
      join(GOLDEN_DIR, 'pdc-carafe-sample.config'),
      'utf8',
    );
    const r = parseConfig(content);
    expect(r.errors).toEqual([]);
    const m = entryMap(r.entries);
    expect(m['pdc.study_id']).toBe('PDC000504');
    expect(m['carafe.pdc_n_files']).toBe(5);
    expect(m['carafe.include_phosphorylation']).toBe(true);
    expect(typeof m['carafe.cli_options']).toBe('string');
  });

  it('general-no-search: search_engine is null', () => {
    const content = readFileSync(
      join(GOLDEN_DIR, 'general-no-search.config'),
      'utf8',
    );
    const r = parseConfig(content);
    expect(r.errors).toEqual([]);
    const m = entryMap(r.entries);
    expect(m['search_engine']).toBe(null);
  });

  it('general-encyclopedia-narrow-wide: encyclopedia.* paths flatten correctly', () => {
    const content = readFileSync(
      join(GOLDEN_DIR, 'general-encyclopedia-narrow-wide.config'),
      'utf8',
    );
    const r = parseConfig(content);
    expect(r.errors).toEqual([]);
    const m = entryMap(r.entries);
    expect(m['encyclopedia.quant.params']).toBe('-enableAdvancedOptions -v2scoring');
    expect(m['encyclopedia.chromatogram.params']).toBe(
      '-enableAdvancedOptions -v2scoring',
    );
    expect(m['fasta']).toBe('/db.fasta');
    expect(m['quant_spectra_dir']).toBe('/data/wide');
    expect(m['chromatogram_library_spectra_dir']).toBe('/data/narrow');
  });
});
