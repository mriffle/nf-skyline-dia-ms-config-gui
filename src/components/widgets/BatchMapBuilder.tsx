// Builder for the {name, path} entry list. Used both as the standalone
// 'batch-map' widget (currently unused at the top level) and as the
// 'Named batches' sub-mode of SpectraSourceRadio.

import { memo } from 'react';
import { inputClassFor } from './types';

export interface BatchEntry {
  readonly name: string;
  readonly path: string;
}

interface BatchMapBuilderProps {
  readonly entries: readonly BatchEntry[];
  readonly onChange: (entries: readonly BatchEntry[]) => void;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly idPrefix: string;
}

function emptyRow(): BatchEntry {
  return { name: '', path: '' };
}

function BatchMapBuilderImpl({
  entries,
  onChange,
  disabled,
  error,
  idPrefix,
}: BatchMapBuilderProps) {
  const rows: readonly BatchEntry[] = entries.length > 0 ? entries : [emptyRow()];

  const updateRow = (idx: number, patch: Partial<BatchEntry>): void => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };
  const removeRow = (idx: number): void => {
    const next = rows.filter((_, i) => i !== idx);
    onChange(next);
  };
  const addRow = (): void => {
    onChange([...rows, emptyRow()]);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_2fr_auto] gap-2 text-[12px] font-medium uppercase tracking-wide text-slate-500">
        <div>Batch name</div>
        <div>Path</div>
        <div className="w-8" aria-hidden="true" />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
          <input
            id={`${idPrefix}-name-${i}`}
            aria-label={`Batch ${i + 1} name`}
            type="text"
            className={inputClassFor(error)}
            value={row.name}
            placeholder="batch1"
            disabled={disabled}
            onChange={(e) => updateRow(i, { name: e.target.value })}
            spellCheck={false}
          />
          <input
            id={`${idPrefix}-path-${i}`}
            aria-label={`Batch ${i + 1} path`}
            type="text"
            className={`${inputClassFor(error)} font-mono text-[13px]`}
            value={row.path}
            placeholder="/path/to/batch"
            disabled={disabled}
            onChange={(e) => updateRow(i, { path: e.target.value })}
            spellCheck={false}
          />
          <button
            type="button"
            aria-label={`Remove batch ${i + 1}`}
            className={[
              'inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500',
              'hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-500',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
            disabled={disabled || rows.length === 0}
            onClick={() => removeRow(i)}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        className={[
          'mt-1 inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-3 py-1.5',
          'text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          'focus:outline-none focus:ring-2 focus:ring-accent-500',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
        disabled={disabled}
        onClick={addRow}
      >
        + Add batch
      </button>
    </div>
  );
}

export const BatchMapBuilder = memo(BatchMapBuilderImpl);
