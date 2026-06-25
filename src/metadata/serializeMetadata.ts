// Inverse of parseDelimited: render a cleaned MetadataTable back to CSV/TSV
// text in the same format it was uploaded in. RFC-4180 quoting — a field is
// wrapped in double quotes (with internal quotes doubled) when it contains
// the delimiter, a quote, or a newline. Uses \n line endings and emits a
// trailing newline. parse(serialize(table)) reproduces the same table.

import type { MetadataFormat, MetadataTable } from './types';

function delimiterFor(format: MetadataFormat): string {
  return format === 'tsv' ? '\t' : ',';
}

function quoteField(value: string, delimiter: string): string {
  const needsQuoting =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r');
  if (!needsQuoting) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function serializeMetadata(table: MetadataTable): string {
  const delimiter = delimiterFor(table.format);
  const lines: string[] = [];
  lines.push(table.columns.map((c) => quoteField(c, delimiter)).join(delimiter));
  for (const row of table.rows) {
    lines.push(
      table.columns.map((c) => quoteField(row[c] ?? '', delimiter)).join(delimiter),
    );
  }
  return `${lines.join('\n')}\n`;
}
