// Shown when a file can't be parsed as a pipeline.config — either no
// `params { }` block was found or there were enough hard parse errors
// that we don't want to load anything.

import { useEffect } from 'react';
import type { ParseError } from '../../parse/types';

interface UploadErrorDialogProps {
  readonly fileName: string;
  readonly errors: readonly ParseError[];
  readonly hadParamsBlock: boolean;
  readonly onClose: () => void;
}

export function UploadErrorDialog({
  fileName,
  errors,
  hadParamsBlock,
  onClose,
}: UploadErrorDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-error-dialog-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-4 py-8"
    >
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-lg bg-white shadow-xl">
        <header className="border-b border-slate-200 px-5 py-4">
          <h2
            id="upload-error-dialog-title"
            className="text-base font-semibold text-red-700"
          >
            Couldn't load{' '}
            <span className="font-mono text-[14px]">{fileName}</span>
          </h2>
        </header>
        <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm">
          <p className="text-slate-700">
            {hadParamsBlock
              ? 'The file was parseable but produced no usable entries.'
              : 'No params { } block was found. This file might not be a pipeline.config.'}
          </p>
          {errors.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2">
              <p className="text-[13px] font-semibold text-red-700">
                Parse errors
              </p>
              <ul className="mt-1 space-y-0.5 font-mono text-[12px] text-red-800">
                {errors.slice(0, 50).map((err, i) => (
                  <li key={i} className="leading-snug">
                    line {err.line}, col {err.col}: {err.message}
                  </li>
                ))}
                {errors.length > 50 ? (
                  <li className="italic text-red-700">
                    …and {errors.length - 50} more
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
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
