// Derives the option lists that an uploaded MetadataTable contributes to the
// form. Single source of truth shared by the picker widgets (to populate
// dropdowns/checkboxes) and the cross-field validation rules (to verify a
// selected value still exists in the metadata).

import type { MetadataTable } from './types';

export const REPLICATE_COLUMN = 'Replicate';

// Which aspect of the metadata a field's options come from.
export type MetadataSource = 'columns' | 'replicates' | 'control-values';

// Column names usable as metadata "variables" — every column except the
// Replicate identifier column (coloring/grouping by the per-sample id is
// meaningless).
export function variableColumns(table: MetadataTable): readonly string[] {
  return table.columns.filter((c) => c !== REPLICATE_COLUMN);
}

// Replicate names: the Replicate-column values, in row order, de-duplicated.
export function replicateNames(table: MetadataTable): readonly string[] {
  return distinct(
    table.rows.map((r) => r[REPLICATE_COLUMN] ?? '').filter((v) => v !== ''),
  );
}

// Distinct non-empty values present in a given column.
export function columnValues(
  table: MetadataTable,
  column: string,
): readonly string[] {
  if (!table.columns.includes(column)) return [];
  return distinct(table.rows.map((r) => r[column] ?? '').filter((v) => v !== ''));
}

// Resolve the option list for a metadata-driven field. For 'control-values'
// the relevant column is whichever column `batch_report.control_key` names,
// passed in via `controlKey`.
export function optionsForSource(
  table: MetadataTable,
  source: MetadataSource,
  controlKey?: unknown,
): readonly string[] {
  switch (source) {
    case 'columns':
      return variableColumns(table);
    case 'replicates':
      return replicateNames(table);
    case 'control-values':
      return typeof controlKey === 'string' && controlKey !== ''
        ? columnValues(table, controlKey)
        : [];
  }
}

function distinct(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
