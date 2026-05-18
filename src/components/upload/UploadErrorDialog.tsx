// Shown when a file can't be loaded — either it's syntactically malformed
// (well-formedness check failed; nothing was parsed) or it's syntactically
// fine but there was no `params { }` block (so the file probably isn't a
// pipeline.config). The two variants render the same chrome but different
// bodies: syntax errors get per-line snippets with caret markers; the
// missing-params case gets the lighter "is this the right file?" message.

import { useEffect } from 'react';
import type { ParseError } from '../../parse/types';
import type { SyntaxIssue } from '../../parse/wellFormedness';

export type UploadErrorVariant =
  | { readonly kind: 'syntax-errors'; readonly issues: readonly SyntaxIssue[] }
  | {
      readonly kind: 'no-params-block';
      readonly errors: readonly ParseError[];
      readonly hadParamsBlock: boolean;
    };

interface UploadErrorDialogProps {
  readonly fileName: string;
  readonly variant: UploadErrorVariant;
  readonly onClose: () => void;
  // Optional escape hatch — only meaningful for the `syntax-errors`
  // variant. When provided, the dialog renders a secondary "Import
  // anyway" button that bypasses the well-formedness gate and lets the
  // upload pipeline proceed against the same file. Use for cases where
  // the user knows the file is correct and our check is wrong.
  readonly onProceedAnyway?: () => void;
}

export function UploadErrorDialog({
  fileName,
  variant,
  onClose,
  onProceedAnyway,
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
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        <header className="border-b border-slate-200 px-5 py-4">
          <h2
            id="upload-error-dialog-title"
            className="text-base font-semibold text-red-700"
          >
            {variant.kind === 'syntax-errors'
              ? 'Syntax errors in '
              : "Couldn't load "}
            <span className="font-mono text-[14px]">{fileName}</span>
          </h2>
        </header>
        <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm">
          {variant.kind === 'syntax-errors' ? (
            <SyntaxErrorsBody issues={variant.issues} />
          ) : (
            <NoParamsBlockBody
              errors={variant.errors}
              hadParamsBlock={variant.hadParamsBlock}
            />
          )}
        </div>
        <footer
          className={[
            'flex flex-col gap-2 border-t border-slate-200 px-5 py-3',
            'sm:flex-row sm:items-center sm:justify-between',
          ].join(' ')}
        >
          {variant.kind === 'syntax-errors' && onProceedAnyway ? (
            <p className="text-[12px] text-slate-500 sm:max-w-md sm:text-left">
              Believe the file is correct and our check is wrong? You can
              import anyway — but partial or incorrect data may load.
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="flex items-center justify-end gap-2">
            {variant.kind === 'syntax-errors' && onProceedAnyway ? (
              <button
                type="button"
                onClick={onProceedAnyway}
                className={[
                  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700',
                  'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
                ].join(' ')}
              >
                Import
              </button>
            ) : null}
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
          </div>
        </footer>
      </div>
    </div>
  );
}

const MAX_RENDERED_ISSUES = 50;

function SyntaxErrorsBody({
  issues,
}: {
  readonly issues: readonly SyntaxIssue[];
}) {
  const visible = issues.slice(0, MAX_RENDERED_ISSUES);
  const overflow = issues.length - visible.length;
  return (
    <>
      <p className="text-slate-700">
        The file isn't syntactically valid. The upload was rejected so a partial
        load can't corrupt your form. Fix the errors below and try again.
      </p>
      <div className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2">
        <p className="text-[13px] font-semibold text-red-700">
          {issues.length === 1 ? '1 error' : `${issues.length} errors`}
        </p>
        <ul className="mt-2 space-y-3">
          {visible.map((issue, i) => (
            <li key={i} className="space-y-1">
              <div className="font-mono text-[12px] text-red-800">
                line {issue.line}, col {issue.col}: {issue.message}
              </div>
              {issue.snippet ? (
                <pre className="overflow-x-auto rounded bg-white/70 px-2 py-1 font-mono text-[12px] leading-snug text-slate-800">
                  {issue.snippet}
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
    </>
  );
}

function NoParamsBlockBody({
  errors,
  hadParamsBlock,
}: {
  readonly errors: readonly ParseError[];
  readonly hadParamsBlock: boolean;
}) {
  return (
    <>
      <p className="text-slate-700">
        {hadParamsBlock
          ? 'The file was parseable but produced no usable entries.'
          : 'No params { } block was found. This file might not be a pipeline.config.'}
      </p>
      {errors.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2">
          <p className="text-[13px] font-semibold text-red-700">Parse errors</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[12px] text-red-800">
            {errors.slice(0, MAX_RENDERED_ISSUES).map((err, i) => (
              <li key={i} className="leading-snug">
                line {err.line}, col {err.col}: {err.message}
              </li>
            ))}
            {errors.length > MAX_RENDERED_ISSUES ? (
              <li className="italic text-red-700">
                …and {errors.length - MAX_RENDERED_ISSUES} more
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </>
  );
}
