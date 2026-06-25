// Hand-rolled RFC-4180-ish delimited parser (consistent with the project's
// hand-rolled Groovy parser in src/parse/). Tokenizes a CSV/TSV document
// into a grid of string fields. Quoting rules:
//   - A field is quoted only when the FIRST character is a double quote.
//   - Inside a quoted field, "" is a literal quote; the delimiter and
//     newlines are literal; the field ends at the next lone quote.
//   - A quote that appears mid-field in an unquoted field is treated
//     literally (lenient — real metadata files are often messy).
//   - \r\n, \r, and \n all terminate a record. Newlines inside quotes are
//     normalized to \n and kept.
// The only lexical error it raises is an unterminated quoted field.
// Structural validation (raggedness, headers, Replicate column) lives in
// validateMetadata.ts.

import type { MetadataError } from './types';

export interface GridRow {
  readonly fields: string[];
  // 1-based physical line where the record begins.
  readonly line: number;
}

export interface DelimitedParseResult {
  readonly rows: GridRow[];
  readonly errors: MetadataError[];
}

export function parseDelimited(text: string, delimiter: string): DelimitedParseResult {
  // Strip a leading UTF-8 BOM.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: GridRow[] = [];
  const errors: MetadataError[] = [];

  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let quoteStartLine = 1;
  let line = 1;
  let rowStartLine = 1;
  const n = src.length;
  let i = 0;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    // Drop a purely blank physical line (a single empty field), so trailing
    // newlines and blank separator lines don't become phantom rows. A row of
    // several empty fields (e.g. ",," ) is kept — raggedness will judge it.
    if (!(row.length === 1 && row[0] === '')) {
      rows.push({ fields: row, line: rowStartLine });
    }
    row = [];
  };

  while (i < n) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (ch === '\r') {
        if (src[i + 1] === '\n') i += 1;
        field += '\n';
        line += 1;
        i += 1;
        continue;
      }
      if (ch === '\n') {
        field += '\n';
        line += 1;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
      quoteStartLine = line;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (src[i + 1] === '\n') i += 1;
      pushRow();
      line += 1;
      rowStartLine = line;
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      line += 1;
      rowStartLine = line;
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (inQuotes) {
    errors.push({
      message: 'Unterminated quoted field (missing a closing double quote).',
      line: quoteStartLine,
      col: 1,
    });
  }
  // Finalize a trailing record that wasn't newline-terminated.
  if (field !== '' || row.length > 0) {
    pushRow();
  }

  return { rows, errors };
}
