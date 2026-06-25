import { describe, expect, it } from 'vitest';
import { parseDelimited } from '../parseDelimited';
import { detectFormat, validateMetadata } from '../validateMetadata';
import { serializeMetadata } from '../serializeMetadata';
import {
  columnValues,
  optionsForSource,
  replicateNames,
  variableColumns,
} from '../options';
import type { MetadataTable, MetadataWarning } from '../types';

function warningKinds(ws: readonly MetadataWarning[]): string[] {
  return ws.map((w) => w.kind);
}

describe('parseDelimited', () => {
  it('parses a simple CSV grid', () => {
    const { rows, errors } = parseDelimited('a,b\n1,2\n', ',');
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('parses TSV', () => {
    const { rows } = parseDelimited('a\tb\n1\t2', '\t');
    expect(rows.map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with embedded delimiter', () => {
    const { rows } = parseDelimited('Replicate,Note\nS1,"a,b"\n', ',');
    expect(rows[1]!.fields).toEqual(['S1', 'a,b']);
  });

  it('handles escaped double quotes', () => {
    const { rows } = parseDelimited('x\n"a""b"\n', ',');
    expect(rows[1]!.fields).toEqual(['a"b']);
  });

  it('handles embedded newlines inside quotes', () => {
    const { rows } = parseDelimited('x\n"line1\nline2"\n', ',');
    expect(rows[1]!.fields).toEqual(['line1\nline2']);
    // The second physical row still starts on line 2.
    expect(rows[1]!.line).toBe(2);
  });

  it('handles CRLF line endings without phantom rows', () => {
    const { rows } = parseDelimited('a,b\r\n1,2\r\n', ',');
    expect(rows.map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('captures a final line without a trailing newline', () => {
    const { rows } = parseDelimited('a,b\n1,2', ',');
    expect(rows[1]!.fields).toEqual(['1', '2']);
  });

  it('drops blank separator lines', () => {
    const { rows } = parseDelimited('a,b\n\n1,2\n', ',');
    expect(rows.map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reports an unterminated quoted field', () => {
    const { errors } = parseDelimited('Replicate,Note\nS1,"oops\n', ',');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/unterminated/i);
    expect(errors[0]!.line).toBe(2);
  });

  it('strips a leading BOM', () => {
    const { rows } = parseDelimited('﻿a,b\n', ',');
    expect(rows[0]!.fields).toEqual(['a', 'b']);
  });
});

describe('detectFormat', () => {
  it('uses the .tsv extension', () => {
    expect(detectFormat('m.tsv', 'a,b\n')).toBe('tsv');
  });
  it('uses the .csv extension', () => {
    expect(detectFormat('m.csv', 'a\tb\n')).toBe('csv');
  });
  it('sniffs by delimiter count for unknown extensions', () => {
    expect(detectFormat('m.txt', 'a\tb\tc\n')).toBe('tsv');
    expect(detectFormat('m.txt', 'a,b,c\n')).toBe('csv');
  });
});

describe('validateMetadata — happy path', () => {
  it('builds a clean table with Replicate first', () => {
    const { table, errors, warnings } = validateMetadata(
      'm.csv',
      'Replicate,Batch,Condition\nS1,B1,Control\nS2,B2,Treated\n',
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(table).toBeDefined();
    expect(table!.columns).toEqual(['Replicate', 'Batch', 'Condition']);
    expect(table!.format).toBe('csv');
    expect(table!.rows).toEqual([
      { Replicate: 'S1', Batch: 'B1', Condition: 'Control' },
      { Replicate: 'S2', Batch: 'B2', Condition: 'Treated' },
    ]);
  });
});

describe('validateMetadata — cleaning warnings', () => {
  it('trims fields and warns', () => {
    const { table, warnings } = validateMetadata(
      'm.csv',
      'Replicate , Batch\n S1 ,B1\n',
    );
    expect(table!.columns).toEqual(['Replicate', 'Batch']);
    expect(table!.rows[0]).toEqual({ Replicate: 'S1', Batch: 'B1' });
    const trimmed = warnings.find((w) => w.kind === 'trimmed');
    expect(trimmed).toBeDefined();
    expect(trimmed!.kind === 'trimmed' && trimmed!.count).toBe(3);
  });

  it('moves a non-first Replicate column to the front and warns', () => {
    const { table, warnings } = validateMetadata(
      'm.csv',
      'Batch,Replicate,Condition\nB1,S1,Control\n',
    );
    expect(table!.columns).toEqual(['Replicate', 'Batch', 'Condition']);
    expect(table!.rows[0]).toEqual({
      Replicate: 'S1',
      Batch: 'B1',
      Condition: 'Control',
    });
    expect(warningKinds(warnings)).toContain('replicate-reordered');
  });

  it('normalizes Replicate casing and warns', () => {
    const { table, warnings } = validateMetadata('m.csv', 'replicate,Batch\nS1,B1\n');
    expect(table!.columns).toEqual(['Replicate', 'Batch']);
    const cased = warnings.find((w) => w.kind === 'replicate-cased');
    expect(cased && cased.kind === 'replicate-cased' && cased.original).toBe(
      'replicate',
    );
  });

  it('warns about duplicate replicate names but still loads', () => {
    const { table, warnings } = validateMetadata(
      'm.csv',
      'Replicate,Batch\nS1,B1\nS1,B2\n',
    );
    expect(table).toBeDefined();
    const dup = warnings.find((w) => w.kind === 'duplicate-replicates');
    expect(dup && dup.kind === 'duplicate-replicates' && dup.values).toEqual(['S1']);
  });
});

describe('validateMetadata — errors', () => {
  it('rejects an empty file', () => {
    const { table, errors } = validateMetadata('m.csv', '');
    expect(table).toBeUndefined();
    expect(errors[0]!.message).toMatch(/empty/i);
  });

  it('rejects a header-only file', () => {
    const { table, errors } = validateMetadata('m.csv', 'Replicate,Batch\n');
    expect(table).toBeUndefined();
    expect(errors[0]!.message).toMatch(/no sample rows/i);
  });

  it('rejects duplicate column names', () => {
    const { table, errors } = validateMetadata(
      'm.csv',
      'Replicate,Batch,Batch\nS1,B1,B2\n',
    );
    expect(table).toBeUndefined();
    expect(errors[0]!.message).toMatch(/duplicate column/i);
  });

  it('rejects a missing Replicate column', () => {
    const { table, errors } = validateMetadata('m.csv', 'Sample,Batch\nS1,B1\n');
    expect(table).toBeUndefined();
    expect(errors[0]!.message).toMatch(/replicate/i);
  });

  it('rejects ragged rows', () => {
    const { table, errors } = validateMetadata(
      'm.csv',
      'Replicate,Batch\nS1,B1,extra\n',
    );
    expect(table).toBeUndefined();
    expect(errors[0]!.message).toMatch(/field/i);
    expect(errors[0]!.snippet).toBeDefined();
  });

  it('rejects empty column names', () => {
    const { table, errors } = validateMetadata(
      'm.csv',
      'Replicate,,Batch\nS1,x,B1\n',
    );
    expect(table).toBeUndefined();
    expect(errors[0]!.message).toMatch(/empty name/i);
  });

  it('rejects ambiguous replicate columns', () => {
    const { table, errors } = validateMetadata(
      'm.csv',
      'replicate,REPLICATE\nS1,S2\n',
    );
    expect(table).toBeUndefined();
    expect(errors[0]!.message).toMatch(/multiple columns/i);
  });
});

describe('serializeMetadata', () => {
  const roundTrip = (text: string): MetadataTable => {
    const first = validateMetadata('m.csv', text);
    expect(first.table).toBeDefined();
    const out = serializeMetadata(first.table!);
    const second = validateMetadata('m.csv', out);
    expect(second.errors).toEqual([]);
    return second.table!;
  };

  it('round-trips a clean table', () => {
    const t = roundTrip('Replicate,Batch,Condition\nS1,B1,Control\nS2,B2,Treated\n');
    expect(t.columns).toEqual(['Replicate', 'Batch', 'Condition']);
    expect(t.rows).toHaveLength(2);
  });

  it('reflects the Replicate reorder + trimming fixes in the output', () => {
    const first = validateMetadata('m.csv', 'Batch,Replicate\n B1 , S1 \n');
    const out = serializeMetadata(first.table!);
    expect(out.startsWith('Replicate,Batch\n')).toBe(true);
    expect(out).toContain('S1,B1');
  });

  it('quotes fields containing the delimiter, quotes, or newlines', () => {
    const table: MetadataTable = {
      fileName: 'm.csv',
      format: 'csv',
      columns: ['Replicate', 'Note'],
      rows: [{ Replicate: 'S1', Note: 'a,b' }],
    };
    const out = serializeMetadata(table);
    expect(out).toContain('S1,"a,b"');
  });

  it('serializes TSV with tabs', () => {
    const table: MetadataTable = {
      fileName: 'm.tsv',
      format: 'tsv',
      columns: ['Replicate', 'Batch'],
      rows: [{ Replicate: 'S1', Batch: 'B1' }],
    };
    expect(serializeMetadata(table)).toBe('Replicate\tBatch\nS1\tB1\n');
  });
});

describe('options helpers', () => {
  const table: MetadataTable = {
    fileName: 'm.csv',
    format: 'csv',
    columns: ['Replicate', 'Batch', 'Condition'],
    rows: [
      { Replicate: 'S1', Batch: 'B1', Condition: 'Control' },
      { Replicate: 'S2', Batch: 'B1', Condition: 'Treated' },
      { Replicate: 'S3', Batch: 'B2', Condition: 'Control' },
    ],
  };

  it('variableColumns excludes Replicate', () => {
    expect(variableColumns(table)).toEqual(['Batch', 'Condition']);
  });

  it('replicateNames lists the de-duplicated Replicate values', () => {
    expect(replicateNames(table)).toEqual(['S1', 'S2', 'S3']);
  });

  it('columnValues returns distinct column values', () => {
    expect(columnValues(table, 'Batch')).toEqual(['B1', 'B2']);
    expect(columnValues(table, 'Condition')).toEqual(['Control', 'Treated']);
    expect(columnValues(table, 'Nonexistent')).toEqual([]);
  });

  it('optionsForSource resolves each source', () => {
    expect(optionsForSource(table, 'columns')).toEqual(['Batch', 'Condition']);
    expect(optionsForSource(table, 'replicates')).toEqual(['S1', 'S2', 'S3']);
    expect(optionsForSource(table, 'control-values', 'Condition')).toEqual([
      'Control',
      'Treated',
    ]);
    expect(optionsForSource(table, 'control-values', '')).toEqual([]);
  });
});
