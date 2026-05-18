import { describe, expect, it } from 'vitest';
import { parseConfig } from '../parseConfig';
import type { ParsedEntry } from '../types';

function entryMap(entries: readonly ParsedEntry[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const e of entries) out[e.path] = e.value;
  return out;
}

describe('parseConfig — basic structure', () => {
  it('reports no params block when input is empty', () => {
    const r = parseConfig('');
    expect(r.errors).toEqual([]);
    expect(r.hadParamsBlock).toBe(false);
    expect(r.entries).toEqual([]);
  });

  it('reports no params block when input has only comments', () => {
    const r = parseConfig('// just a comment\n/* and a block */');
    expect(r.errors).toEqual([]);
    expect(r.hadParamsBlock).toBe(false);
  });

  it('finds an empty params block', () => {
    const r = parseConfig('params { }');
    expect(r.errors).toEqual([]);
    expect(r.hadParamsBlock).toBe(true);
    expect(r.entries).toEqual([]);
  });

  it('records top-level assignments outside params as ignored', () => {
    const r = parseConfig(`
      foo = 'bar'
      params { x = 1 }
    `);
    expect(r.errors).toEqual([]);
    expect(r.ignoredTopLevelAssignments.map((a) => a.name)).toEqual(['foo']);
    expect(r.preservedOuterBlocks).toEqual([]);
    expect(entryMap(r.entries)).toEqual({ x: 1 });
  });
});

describe('parseConfig — assignments and blocks', () => {
  it('parses scalar assignments of every supported type', () => {
    const r = parseConfig(`
      params {
        s = 'hello'
        n = 42
        d = 1.5
        b = true
        z = null
      }
    `);
    expect(r.errors).toEqual([]);
    expect(entryMap(r.entries)).toEqual({
      s: 'hello',
      n: 42,
      d: 1.5,
      b: true,
      z: null,
    });
  });

  it('flattens dotted name into the same path as a block form', () => {
    const dotted = parseConfig(`params { pdc.study_id = 'PDC1' }`);
    const blocky = parseConfig(`params { pdc { study_id = 'PDC1' } }`);
    expect(entryMap(dotted.entries)).toEqual({ 'pdc.study_id': 'PDC1' });
    expect(entryMap(blocky.entries)).toEqual({ 'pdc.study_id': 'PDC1' });
  });

  it('mixes dotted and block forms in the same namespace', () => {
    const r = parseConfig(`
      params {
        pdc.study_id = 'PDC1'
        pdc {
          batch_file = '/x.tsv'
        }
      }
    `);
    expect(r.errors).toEqual([]);
    expect(entryMap(r.entries)).toEqual({
      'pdc.study_id': 'PDC1',
      'pdc.batch_file': '/x.tsv',
    });
  });

  it('handles nested blocks more than two deep', () => {
    const r = parseConfig(`
      params {
        encyclopedia {
          quant {
            params = '-flag'
          }
        }
      }
    `);
    expect(r.errors).toEqual([]);
    expect(entryMap(r.entries)).toEqual({
      'encyclopedia.quant.params': '-flag',
    });
  });

  it('supports the params.foo { } shorthand', () => {
    const r = parseConfig(`params.pdc { study_id = 'X' }`);
    expect(r.errors).toEqual([]);
    expect(entryMap(r.entries)).toEqual({ 'pdc.study_id': 'X' });
  });
});

describe('parseConfig — collection values', () => {
  it('parses an empty list', () => {
    const r = parseConfig(`params { x = [] }`);
    expect(r.errors).toEqual([]);
    expect(r.entries[0]?.value).toEqual([]);
  });

  it('parses an empty map [:]', () => {
    const r = parseConfig(`params { x = [:] }`);
    expect(r.errors).toEqual([]);
    expect(r.entries[0]?.value).toEqual({});
  });

  it('parses a single-line list of strings', () => {
    const r = parseConfig(`params { x = ['a', 'b', 'c'] }`);
    expect(r.errors).toEqual([]);
    expect(r.entries[0]?.value).toEqual(['a', 'b', 'c']);
  });

  it('parses a multi-line list of strings (trailing-comma tolerant)', () => {
    const r = parseConfig(`
      params {
        x = [
          'one',
          'two',
          'three',
        ]
      }
    `);
    expect(r.errors).toEqual([]);
    expect(r.entries[0]?.value).toEqual(['one', 'two', 'three']);
  });

  it('parses a single-line map with quoted keys', () => {
    const r = parseConfig(`params { x = ['a': 1, 'b': 2] }`);
    expect(r.errors).toEqual([]);
    expect(r.entries[0]?.value).toEqual({ a: 1, b: 2 });
  });

  it('parses the batch-map shape we emit (multi-line, quoted keys)', () => {
    const r = parseConfig(`
      params {
        quant_spectra_dir = [
          'PlateA': '/data/A',
          'PlateB': '/data/B',
          'PlateC': '/data/C'
        ]
      }
    `);
    expect(r.errors).toEqual([]);
    expect(r.entries[0]?.value).toEqual({
      PlateA: '/data/A',
      PlateB: '/data/B',
      PlateC: '/data/C',
    });
  });

  it('parses unquoted identifier keys in a map', () => {
    const r = parseConfig(`params { x = [a: 1, b: 2] }`);
    expect(r.errors).toEqual([]);
    expect(r.entries[0]?.value).toEqual({ a: 1, b: 2 });
  });
});

describe('parseConfig — wrappers', () => {
  it('finds params nested inside profiles { name { params { } } }', () => {
    const r = parseConfig(`
      profiles {
        standard {
          params {
            fasta = '/db.fasta'
          }
        }
      }
    `);
    expect(r.errors).toEqual([]);
    expect(r.hadParamsBlock).toBe(true);
    expect(entryMap(r.entries)).toEqual({ fasta: '/db.fasta' });
    // The wrapping profiles block is not preserved — it contains the
    // chosen params block, so re-emitting it verbatim would duplicate
    // everything we already loaded.
    expect(r.preservedOuterBlocks).toEqual([]);
  });

  it('prefers a top-level params block over a nested one', () => {
    const r = parseConfig(`
      profiles { other { params { foo = 'nested' } } }
      params { foo = 'top' }
    `);
    expect(r.errors).toEqual([]);
    expect(entryMap(r.entries)).toEqual({ foo: 'top' });
    expect(r.preservedOuterBlocks.map((b) => b.name)).toEqual(['profiles']);
  });

  it('preserves top-level non-params blocks alongside the chosen params', () => {
    const r = parseConfig(`
      process { cpus = 4 }
      params { x = 1 }
    `);
    expect(r.errors).toEqual([]);
    expect(r.preservedOuterBlocks.map((b) => b.name)).toEqual(['process']);
    expect(r.preservedOuterBlocks[0]?.text).toBe('process { cpus = 4 }');
    expect(entryMap(r.entries)).toEqual({ x: 1 });
  });
});

describe('parseConfig — duplicates and recovery', () => {
  it('keeps the last occurrence and reports duplicates', () => {
    const r = parseConfig(`
      params {
        fasta = '/first.fasta'
        fasta = '/second.fasta'
      }
    `);
    expect(r.errors).toEqual([]);
    expect(entryMap(r.entries)).toEqual({ fasta: '/second.fasta' });
    expect(r.duplicates.length).toBe(1);
    const dup = r.duplicates[0]!;
    expect(dup.path).toBe('fasta');
    expect(dup.firstValue).toBe('/first.fasta');
    expect(dup.finalValue).toBe('/second.fasta');
  });

  it('records a parse error and keeps going on missing equals', () => {
    const r = parseConfig(`
      params {
        broken
        good = 1
      }
    `);
    expect(r.errors.length).toBeGreaterThan(0);
    // 'good = 1' should still parse cleanly.
    expect(entryMap(r.entries)).toEqual({ good: 1 });
  });

  it('records errors but recovers when a list is unterminated mid-file', () => {
    const r = parseConfig(`
      params {
        x = [1, 2,
        good = 1
      }
    `);
    expect(r.errors.length).toBeGreaterThan(0);
    // Recovery should at least find the next valid assignment without crashing.
    expect(r.hadParamsBlock).toBe(true);
  });

  it('reports lex errors (e.g. GString) alongside a non-empty result', () => {
    const r = parseConfig(`
      params {
        good = 'plain'
        bad = "hi \${x}"
      }
    `);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]?.message).toMatch(/GString/);
    // The good entry still loads.
    expect(entryMap(r.entries).good).toBe('plain');
  });
});

describe('parseConfig — line/col are reported on entries', () => {
  it('records line and col for each assignment', () => {
    const r = parseConfig(`params {\n  fasta = '/a'\n  pdc.study_id = 'B'\n}`);
    expect(r.errors).toEqual([]);
    const fasta = r.entries.find((e) => e.path === 'fasta');
    const pdc = r.entries.find((e) => e.path === 'pdc.study_id');
    expect(fasta?.line).toBe(2);
    expect(pdc?.line).toBe(3);
  });
});
