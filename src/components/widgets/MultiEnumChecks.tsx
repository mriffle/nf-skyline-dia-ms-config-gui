import { memo } from 'react';
import type { WidgetProps } from './types';

// UI-only choice list for multi-enum widgets whose options are not derived
// from a schema enum (qc_report.report_format is the only one in Phase 5).
const UI_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  'qc_report.report_format': ['html', 'pdf'],
};

function MultiEnumChecksImpl({ meta, value, onChange, disabled, inputId }: WidgetProps) {
  const options = UI_OPTIONS[meta.path] ?? [];
  const selected: readonly string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];

  const toggle = (opt: string): void => {
    if (disabled) return;
    const next = selected.includes(opt)
      ? selected.filter((v) => v !== opt)
      : [...selected, opt];
    onChange(next);
  };

  return (
    <div
      id={inputId}
      role="group"
      aria-label={meta.label}
      className="flex flex-wrap gap-x-5 gap-y-2 pt-1"
    >
      {options.map((opt) => {
        const id = `${inputId}-${opt}`;
        const checked = selected.includes(opt);
        return (
          <label
            key={opt}
            htmlFor={id}
            className={[
              'inline-flex items-center gap-2 text-sm',
              disabled ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 cursor-pointer',
            ].join(' ')}
          >
            <input
              id={id}
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-accent-500 focus:ring-accent-500"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(opt)}
            />
            <span className="uppercase tracking-wide">{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

export const MultiEnumChecks = memo(MultiEnumChecksImpl);
