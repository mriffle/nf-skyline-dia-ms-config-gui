// Bespoke radio-card group used for the wizard's top-level branching
// questions (mode, search engine, library strategy, etc.). Each card has
// a primary label, an explanation, and optional badges/notes.

import { useId } from 'react';

export interface RadioCardOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly note?: string;
  readonly disabled?: boolean;
}

interface WizardRadioCardsProps<T extends string> {
  readonly ariaLabel: string;
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly options: readonly RadioCardOption<T>[];
}

export function WizardRadioCards<T extends string>({
  ariaLabel,
  value,
  onChange,
  options,
}: WizardRadioCardsProps<T>) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-col gap-2">
      {options.map((opt) => {
        const checked = opt.value === value;
        const disabled = opt.disabled === true;
        return (
          <label
            key={opt.value}
            className={[
              'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
              checked
                ? 'border-accent-500 bg-accent-50/60 ring-1 ring-accent-500'
                : 'border-slate-300 bg-white hover:border-slate-400',
              disabled ? 'cursor-not-allowed opacity-60 hover:border-slate-300' : '',
            ].join(' ')}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              className="mt-0.5 h-4 w-4 border-slate-300 text-accent-500 focus:ring-accent-500"
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(opt.value)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">
                  {opt.label}
                </span>
                {opt.note ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600">
                    {opt.note}
                  </span>
                ) : null}
              </div>
              {opt.description ? (
                <p className="mt-1 text-[13px] leading-snug text-slate-600">
                  {opt.description}
                </p>
              ) : null}
            </div>
          </label>
        );
      })}
    </div>
  );
}
