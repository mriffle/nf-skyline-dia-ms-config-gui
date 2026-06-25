// Validates + cleans an uploaded metadata document into a MetadataTable.
// Pipeline: detect format → parse → structural checks (reject on error) →
// build table + collect advisory warnings (trimming, Replicate reorder,
// case normalization, duplicate replicate names).

import { parseDelimited } from './parseDelimited';
import type {
  MetadataError,
  MetadataFormat,
  MetadataTable,
  MetadataValidationResult,
  MetadataWarning,
} from './types';

const REPLICATE = 'Replicate';
const MAX_TRIM_SAMPLES = 8;

// Pick the delimiter format from the file extension, falling back to a
// sniff of the first line (more tabs than commas → TSV).
export function detectFormat(fileName: string, text: string): MetadataFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tsv') || lower.endsWith('.tab')) return 'tsv';
  if (lower.endsWith('.csv')) return 'csv';
  const firstLine = text.replace(/^﻿/, '').split(/\r\n|\r|\n/, 1)[0] ?? '';
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? 'tsv' : 'csv';
}

function delimiterFor(format: MetadataFormat): string {
  return format === 'tsv' ? '\t' : ',';
}

export function validateMetadata(
  fileName: string,
  text: string,
): MetadataValidationResult {
  const format = detectFormat(fileName, text);
  const physicalLines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const decorate = (errors: MetadataError[]): MetadataError[] =>
    errors.map((e) =>
      e.line !== undefined && e.snippet === undefined
        ? { ...e, snippet: snippetFor(physicalLines, e.line) }
        : e,
    );

  const parsed = parseDelimited(text, delimiterFor(format));
  if (parsed.errors.length > 0) {
    return { errors: decorate(parsed.errors), warnings: [] };
  }

  const grid = parsed.rows;
  if (grid.length === 0) {
    return {
      errors: [{ message: 'The file is empty — no rows were found.' }],
      warnings: [],
    };
  }

  const headerRow = grid[0]!;
  const expectedCols = headerRow.fields.length;
  const headerTrimmed = headerRow.fields.map((f) => f.trim());

  const errors: MetadataError[] = [];

  // Empty header names.
  const emptyCols = headerTrimmed
    .map((name, idx) => ({ name, idx }))
    .filter((c) => c.name === '');
  if (emptyCols.length > 0) {
    const positions = emptyCols.map((c) => c.idx + 1).join(', ');
    errors.push({
      message: `Column(s) at position ${positions} have an empty name. Every column needs a header.`,
      line: headerRow.line,
    });
  }

  // Duplicate header names (case-sensitive, ignoring empties handled above).
  const dupHeaders = findDuplicates(headerTrimmed.filter((h) => h !== ''));
  if (dupHeaders.length > 0) {
    errors.push({
      message: `Duplicate column name(s): ${dupHeaders
        .map((h) => `"${h}"`)
        .join(', ')}. Each column name must appear only once.`,
      line: headerRow.line,
    });
  }

  // Ragged data rows.
  for (let r = 1; r < grid.length; r += 1) {
    const dataRow = grid[r]!;
    if (dataRow.fields.length !== expectedCols) {
      errors.push({
        message: `Row has ${dataRow.fields.length} field(s) but the header has ${expectedCols}. Every row must have the same number of columns.`,
        line: dataRow.line,
      });
    }
  }

  // Replicate column detection.
  const exactMatches = indicesOf(headerTrimmed, (h) => h === REPLICATE);
  const ciMatches = indicesOf(headerTrimmed, (h) => h.toLowerCase() === 'replicate');
  let repIdx = -1;
  let casedOriginal: string | null = null;
  if (exactMatches.length >= 1) {
    repIdx = exactMatches[0]!;
  } else if (ciMatches.length === 1) {
    repIdx = ciMatches[0]!;
    casedOriginal = headerTrimmed[repIdx]!;
  } else if (ciMatches.length === 0) {
    errors.push({
      message:
        'No "Replicate" column found. The first column must be named "Replicate".',
      line: headerRow.line,
    });
  } else {
    errors.push({
      message:
        'Multiple columns look like a Replicate column. Rename them so exactly one is named "Replicate".',
      line: headerRow.line,
    });
  }

  if (errors.length > 0) {
    return { errors: decorate(errors), warnings: [] };
  }

  if (grid.length === 1) {
    return {
      errors: [
        {
          message:
            'The file has a header row but no sample rows. Add at least one row of data.',
          line: headerRow.line,
          snippet: snippetFor(physicalLines, headerRow.line),
        },
      ],
      warnings: [],
    };
  }

  // ---- Build the cleaned table + collect warnings ----
  const warnings: MetadataWarning[] = [];

  // Final column order: Replicate first, then the rest in original order.
  const order: { name: string; srcIndex: number }[] = [
    { name: REPLICATE, srcIndex: repIdx },
  ];
  for (let i = 0; i < headerTrimmed.length; i += 1) {
    if (i === repIdx) continue;
    order.push({ name: headerTrimmed[i]!, srcIndex: i });
  }
  const columns = order.map((o) => o.name);

  // Trimming detection across the whole grid (header + data).
  const trimSamples: string[] = [];
  let trimCount = 0;
  const noteTrim = (label: string, before: string, after: string): void => {
    if (before === after) return;
    trimCount += 1;
    if (trimSamples.length < MAX_TRIM_SAMPLES) {
      trimSamples.push(`${label}: "${before}" → "${after}"`);
    }
  };
  for (let c = 0; c < headerRow.fields.length; c += 1) {
    noteTrim('column header', headerRow.fields[c]!, headerRow.fields[c]!.trim());
  }

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < grid.length; r += 1) {
    const dataRow = grid[r]!;
    const record: Record<string, string> = {};
    for (const { name, srcIndex } of order) {
      const raw = dataRow.fields[srcIndex] ?? '';
      const trimmed = raw.trim();
      noteTrim(`line ${dataRow.line}, "${name}"`, raw, trimmed);
      record[name] = trimmed;
    }
    rows.push(record);
  }

  if (trimCount > 0) {
    warnings.push({ kind: 'trimmed', count: trimCount, samples: trimSamples });
  }
  if (casedOriginal !== null) {
    warnings.push({ kind: 'replicate-cased', original: casedOriginal });
  }
  if (repIdx !== 0) {
    warnings.push({ kind: 'replicate-reordered', fromIndex: repIdx });
  }
  const dupReplicates = findDuplicates(rows.map((row) => row[REPLICATE] ?? ''));
  if (dupReplicates.length > 0) {
    warnings.push({ kind: 'duplicate-replicates', values: dupReplicates });
  }

  const table: MetadataTable = { fileName, format, columns, rows };
  return { table, errors: [], warnings };
}

// --- helpers ---------------------------------------------------------------

function indicesOf(arr: readonly string[], pred: (s: string) => boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i += 1) {
    if (pred(arr[i]!)) out.push(i);
  }
  return out;
}

// Returns the distinct values that occur more than once, preserving the
// order of first appearance.
function findDuplicates(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if ((counts.get(v) ?? 0) > 1 && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function snippetFor(lines: readonly string[], line: number): string | undefined {
  const text = lines[line - 1];
  if (text === undefined) return undefined;
  return `${String(line).padStart(4)} | ${text}`;
}
