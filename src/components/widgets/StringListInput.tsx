import { memo, useState } from 'react';
import { inputClassFor, type WidgetProps } from './types';

function StringListInputImpl({ meta, value, onChange, disabled, error, inputId }: WidgetProps) {
  const items: readonly string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
  const [draft, setDraft] = useState('');

  const commit = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed === '') return;
    if (items.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...items, trimmed]);
    setDraft('');
  };

  const removeAt = (idx: number): void => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    }
  };

  return (
    <div>
      {items.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className={[
                'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1',
                'text-[13px] text-slate-800',
              ].join(' ')}
            >
              <span className="font-mono">{item}</span>
              {disabled ? null : (
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-500"
                  onClick={() => removeAt(i)}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 12 12"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M3 3 L9 9 M9 3 L3 9" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          className={inputClassFor(error)}
          value={draft}
          disabled={disabled}
          placeholder={meta.placeholder ?? 'Type and press Enter or comma'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => commit(draft)}
          spellCheck={false}
        />
        <button
          type="button"
          className={[
            'shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700',
            'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
          disabled={disabled || draft.trim() === ''}
          onClick={() => commit(draft)}
        >
          Add
        </button>
      </div>
    </div>
  );
}

export const StringListInput = memo(StringListInputImpl);
