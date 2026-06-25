// Shown when a metadata file can't be loaded — structural problems (no
// Replicate column, duplicate columns, ragged rows) or parse errors
// (unterminated quote). Lists each problem with its source-line snippet
// where available. Unlike the config-upload error dialog there is no
// "import anyway" bypass: the file must be valid to load.

import { useEffect } from 'react';
import type { MetadataError } from '../../metadata/types';

interface MetadataErrorDialogProps {
  readonly fileName: string;
  readonly errors: readonly MetadataError[];
  readonly onClose: () => void;
}

const MAX_RENDERED = 50;

export function MetadataErrorDialog({
  fileName,
  errors,
  onClose,
}: MetadataErrorDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visible = errors.slice(0, MAX_RENDERED);
  const overflow = errors.length - visible.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="metadata-error-dialog-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-4 py-8"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        <header className="border-b border-slate-200 px-5 py-4">
          <h2
            id="metadata-error-dialog-title"
            className="text-base font-semibold text-red-700"
          >
            Couldn't load{' '}
            <span className="font-mono text-[14px]">{fileName}</span>
          </h2>
        </header>
        <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm">
          <p className="text-slate-700">
            The metadata file has problems that must be fixed before it can load.
            The first column must be named <span className="font-mono">Replicate</span>,
            every column name must be unique, and every row must have the same
            number of columns.
          </p>
          <div className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2">
            <p className="text-[13px] font-semibold text-red-700">
              {errors.length === 1 ? '1 problem' : `${errors.length} problems`}
            </p>
            <ul className="mt-2 space-y-3">
              {visible.map((err, i) => (
                <li key={i} className="space-y-1">
                  <div className="font-mono text-[12px] text-red-800">
                    {err.line !== undefined ? `line ${err.line}: ` : ''}
                    {err.message}
                  </div>
                  {err.snippet ? (
                    <pre className="overflow-x-auto rounded bg-white/70 px-2 py-1 font-mono text-[12px] leading-snug text-slate-800">
                      {err.snippet}
                    </pre>
                  ) : null}
                </li>
              ))}
              {overflow > 0 ? (
                <li className="font-mono text-[12px] italic text-red-700">
                  …and {overflow} more
                </li>
              ) : null}
            </ul>
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className={[
              'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700',
              'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
            ].join(' ')}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
