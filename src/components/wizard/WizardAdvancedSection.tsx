// Per-screen "Advanced options" expander. Local state — does not flip the
// global store.showAdvanced toggle. The children inside should render
// fields with <Field bypassTier /> so advanced-tier metadata appears.

import { useState, type ReactNode } from 'react';

interface WizardAdvancedSectionProps {
  readonly children: ReactNode;
  readonly label?: string;
}

export function WizardAdvancedSection({
  children,
  label = 'Advanced options',
}: WizardAdvancedSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2',
          'text-sm font-medium text-slate-700 hover:bg-slate-100',
          'focus:outline-none focus:ring-2 focus:ring-accent-500',
        ].join(' ')}
      >
        <span className="flex items-center gap-2">
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className={[
              'h-3 w-3 transform transition-transform',
              open ? 'rotate-90' : '',
            ].join(' ')}
            fill="currentColor"
          >
            <path d="M4 2l4 4-4 4V2z" />
          </svg>
          {label}
        </span>
        <span className="text-[12px] font-normal text-slate-500">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open ? (
        <div className="space-y-5 border-t border-slate-200 bg-white px-3 py-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
