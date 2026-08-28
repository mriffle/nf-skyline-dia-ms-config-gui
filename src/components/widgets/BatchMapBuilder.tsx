// Builder for the {name, paths} entry list. Used both as the standalone
// 'batch-map' widget (currently unused at the top level) and as the
// 'Named batches' sub-mode of SpectraSourceRadio.
//
// A batch may draw from more than one directory; the emitter writes a bare
// string for a single-path batch and a list for a multi-path one.

import { memo } from 'react';
import { inputClassFor } from './types';

export interface BatchEntry {
  readonly name: string;
  readonly paths: readonly string[];
}

interface BatchMapBuilderProps {
  readonly entries: readonly BatchEntry[];
  readonly onChange: (entries: readonly BatchEntry[]) => void;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly idPrefix: string;
}

function emptyRow(): BatchEntry {
  return { name: '', paths: [''] };
}

// A row always shows at least one path input, even if `paths` is empty.
function pathsOf(entry: BatchEntry): readonly string[] {
  return entry.paths.length > 0 ? entry.paths : [''];
}

const iconButtonClass = [
  'inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500',
  'hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-500',
  'disabled:opacity-40 disabled:cursor-not-allowed',
].join(' ');

function CrossIcon() {
  return (
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
  );
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
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeRow = (idx: number): void => {
    onChange(rows.filter((_, i) => i !== idx));
  };
  const addRow = (): void => {
    onChange([...rows, emptyRow()]);
  };

  const updatePath = (rowIdx: number, pathIdx: number, next: string): void => {
    const paths = pathsOf(rows[rowIdx]!).map((p, i) => (i === pathIdx ? next : p));
    updateRow(rowIdx, { paths });
  };
  const addPath = (rowIdx: number): void => {
    updateRow(rowIdx, { paths: [...pathsOf(rows[rowIdx]!), ''] });
  };
  const removePath = (rowIdx: number, pathIdx: number): void => {
    updateRow(rowIdx, { paths: pathsOf(rows[rowIdx]!).filter((_, i) => i !== pathIdx) });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_2fr_auto] gap-2 text-[12px] font-medium uppercase tracking-wide text-slate-500">
        <div>Batch name</div>
        <div>Path(s)</div>
        <div className="w-8" aria-hidden="true" />
      </div>
      {rows.map((row, i) => {
        const paths = pathsOf(row);
        return (
          <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-start gap-2">
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
            <div className="space-y-2">
              {paths.map((path, j) => (
                <div key={j} className="flex gap-2">
                  <input
                    id={`${idPrefix}-path-${i}-${j}`}
                    aria-label={
                      // Keep the single-path label unsuffixed so the common case
                      // reads naturally to screen readers.
                      paths.length === 1
                        ? `Batch ${i + 1} path`
                        : `Batch ${i + 1} path ${j + 1}`
                    }
                    type="text"
                    className={`${inputClassFor(error)} font-mono text-[13px]`}
                    value={path}
                    placeholder="/path/to/batch"
                    disabled={disabled}
                    onChange={(e) => updatePath(i, j, e.target.value)}
                    spellCheck={false}
                  />
                  {paths.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove batch ${i + 1} path ${j + 1}`}
                      className={iconButtonClass}
                      disabled={disabled}
                      onClick={() => removePath(i, j)}
                    >
                      <CrossIcon />
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                aria-label={`Add path to batch ${i + 1}`}
                className={[
                  'inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2.5 py-1',
                  'text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  'focus:outline-none focus:ring-2 focus:ring-accent-500',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                ].join(' ')}
                disabled={disabled}
                onClick={() => addPath(i)}
              >
                + Add path
              </button>
            </div>
            <button
              type="button"
              aria-label={`Remove batch ${i + 1}`}
              className={iconButtonClass}
              disabled={disabled || rows.length === 0}
              onClick={() => removeRow(i)}
            >
              <CrossIcon />
            </button>
          </div>
        );
      })}
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
