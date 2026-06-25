// Types for the sample-metadata upload feature. A MetadataTable is the
// cleaned, validated form of an uploaded CSV/TSV: one column per metadata
// field (first column always "Replicate"), one row per sample. It is a
// pure GUI artifact — it drives form pickers + validation and is never
// emitted into the generated config.

export type MetadataFormat = 'csv' | 'tsv';

export interface MetadataTable {
  readonly fileName: string;
  // Delimiter format the table was uploaded in. Preserved so a download
  // round-trips in the same format.
  readonly format: MetadataFormat;
  // Ordered column names. Always non-empty, unique, and with "Replicate"
  // first.
  readonly columns: readonly string[];
  // One record per sample, keyed by column name. Every record has a value
  // (possibly the empty string) for every column.
  readonly rows: readonly Readonly<Record<string, string>>[];
}

// A blocking problem that rejects the upload. `line` / `col` / `snippet`
// are present for problems tied to a source location (parse errors, ragged
// rows, header issues); absent for whole-file problems (empty file).
export interface MetadataError {
  readonly message: string;
  readonly line?: number;
  readonly col?: number;
  readonly snippet?: string;
}

// A non-blocking note surfaced in the confirm dialog. The table still
// loads; the warning explains a fix we applied or something worth a look.
export type MetadataWarning =
  | {
      // Surrounding whitespace was trimmed from one or more cells/headers.
      readonly kind: 'trimmed';
      readonly count: number;
      readonly samples: readonly string[];
    }
  | {
      // A "Replicate" column existed but wasn't first; we moved it.
      readonly kind: 'replicate-reordered';
      readonly fromIndex: number;
    }
  | {
      // The replicate column's header differed in case (e.g. "replicate");
      // we normalized it to "Replicate".
      readonly kind: 'replicate-cased';
      readonly original: string;
    }
  | {
      // The Replicate column contains repeated names.
      readonly kind: 'duplicate-replicates';
      readonly values: readonly string[];
    };

export interface MetadataValidationResult {
  // Present iff there were no blocking errors.
  readonly table?: MetadataTable;
  readonly errors: readonly MetadataError[];
  readonly warnings: readonly MetadataWarning[];
}
