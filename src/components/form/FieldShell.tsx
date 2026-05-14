import type { ReactNode } from 'react';
import { HelpPopover } from './HelpPopover';

interface FieldShellProps {
  readonly path: string;
  readonly inputId: string;
  readonly label: string;
  readonly help: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly defaultHint?: string;
  readonly children: ReactNode;
}

export function FieldShell({
  path,
  inputId,
  label,
  help,
  error,
  disabled,
  required,
  defaultHint,
  children,
}: FieldShellProps) {
  return (
    <div id={`field-${path}`} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label
          htmlFor={inputId}
          className={[
            'text-sm font-medium',
            disabled ? 'text-slate-400' : 'text-slate-800',
          ].join(' ')}
        >
          {label}
          {required ? (
            <>
              <span aria-hidden="true" className="ml-1 text-red-600">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </label>
        <HelpPopover content={help} label={label} />
      </div>
      {children}
      {defaultHint ? (
        <p className="text-[12px] text-slate-500">
          Default:{' '}
          <span className="font-mono text-slate-600">{defaultHint}</span>
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[13px] text-red-700"
        >
          <ErrorIcon />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function ErrorIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="mt-0.5 h-4 w-4 flex-none text-red-600"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 4a.75.75 0 00-1.5 0v4a.75.75 0 001.5 0V5zm-.75 7.25a1 1 0 100-2 1 1 0 000 2z"
      />
    </svg>
  );
}
