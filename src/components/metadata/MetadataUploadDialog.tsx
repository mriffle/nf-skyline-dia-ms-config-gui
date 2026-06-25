// Confirm dialog shown after a metadata file validates cleanly. Summarizes
// the parsed table and lists any adjustments we applied (trimming, Replicate
// reorder, case normalization) or notes (duplicate replicate names). Cancel
// discards; Load commits the table to the store.

import { useEffect } from 'react';
import type { MetadataTable, MetadataWarning } from '../../metadata/types';

interface MetadataUploadDialogProps {
  readonly fileName: string;
  readonly table: MetadataTable;
  readonly warnings: readonly MetadataWarning[];
  readonly confirmReplace: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function MetadataUploadDialog({
  fileName,
  table,
  warnings,
  confirmReplace,
  onCancel,
  onConfirm,
}: MetadataUploadDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const noteLines = warnings.flatMap(formatWarning);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="metadata-dialog-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-4 py-8"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        <header className="border-b border-slate-200 px-5 py-4">
          <h2
            id="metadata-dialog-title"
            className="text-base font-semibold text-slate-900"
          >
            Load metadata from{' '}
            <span className="font-mono text-[14px] text-slate-700">{fileName}</span>?
          </h2>
        </header>

        <div className="space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-slate-800">
              <strong>{table.rows.length}</strong> sample
              {table.rows.length === 1 ? '' : 's'} ·{' '}
              <strong>{table.columns.length}</strong> column
              {table.columns.length === 1 ? '' : 's'}.
            </p>
            <p className="mt-1 text-[13px] text-slate-600">
              Columns:{' '}
              {table.columns.map((c, i) => (
                <span key={c}>
                  {i > 0 ? ', ' : ''}
                  <span className="font-mono text-slate-800">{c}</span>
                </span>
              ))}
            </p>
          </div>

          {confirmReplace ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
              <strong>Heads up:</strong> Loading will replace the metadata that's
              currently loaded.
            </div>
          ) : null}

          {noteLines.length > 0 ? (
            <details
              className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2"
              open
            >
              <summary className="cursor-pointer text-[13px] font-semibold text-amber-800">
                {noteLines.length} adjustment
                {noteLines.length === 1 ? '' : 's'} &amp; note
                {noteLines.length === 1 ? '' : 's'}
              </summary>
              <p className="mt-1 text-[12px] text-slate-600">
                The metadata loaded; these were applied or are worth a look.
              </p>
              <ul className="mt-2 space-y-0.5 text-[12px] text-amber-900">
                {noteLines.map((line, i) => (
                  <li key={i} className="font-mono leading-snug">
                    {line}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="text-[13px] text-slate-600">
              No adjustments were needed — the file was already clean.
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className={[
              'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700',
              'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
            ].join(' ')}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              'rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-white',
              'hover:bg-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-300',
            ].join(' ')}
          >
            Load metadata
          </button>
        </footer>
      </div>
    </div>
  );
}

function formatWarning(w: MetadataWarning): string[] {
  switch (w.kind) {
    case 'trimmed':
      return [
        `Trimmed surrounding whitespace from ${w.count} cell${
          w.count === 1 ? '' : 's'
        }:`,
        ...w.samples.map((s) => `  • ${s}`),
      ];
    case 'replicate-reordered':
      return [
        `Moved the "Replicate" column to the first position (was column ${
          w.fromIndex + 1
        }).`,
      ];
    case 'replicate-cased':
      return [`Renamed column "${w.original}" → "Replicate".`];
    case 'duplicate-replicates':
      return [
        `Duplicate replicate name${w.values.length === 1 ? '' : 's'}: ${w.values.join(
          ', ',
        )} (replicate names are usually unique).`,
      ];
  }
}
