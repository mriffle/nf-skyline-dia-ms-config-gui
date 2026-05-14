import { memo, useId, useState } from 'react';
import { useStore } from '../../state/store';
import { inputClassFor, type WidgetProps } from './types';

type Mode = 'glob' | 'regex';

function GlobRegexPairImpl({ meta, disabled, error, inputId }: WidgetProps) {
  const affects = meta.affects ?? [];
  const globPath = affects[0];
  const regexPath = affects[1];

  // Read directly from store.
  const globValue = useStore((s) => (globPath ? s.values[globPath] : undefined));
  const regexValue = useStore((s) => (regexPath ? s.values[regexPath] : undefined));
  const setValue = useStore((s) => s.setValue);
  const clearValue = useStore((s) => s.clearValue);

  const initialMode: Mode =
    typeof regexValue === 'string' && regexValue.length > 0 ? 'regex' : 'glob';
  const [mode, setMode] = useState<Mode>(initialMode);

  const radioName = useId();

  const handleModeChange = (next: Mode): void => {
    if (next === mode) return;
    setMode(next);
    // Clear the inactive path so the cross-field rule does not fire.
    if (next === 'glob' && regexPath) {
      clearValue(regexPath);
    } else if (next === 'regex' && globPath) {
      clearValue(globPath);
    }
  };

  const onGlobChange = (raw: string): void => {
    if (!globPath) return;
    setValue(globPath, raw);
  };
  const onRegexChange = (raw: string): void => {
    if (!regexPath) return;
    setValue(regexPath, raw);
  };

  const globStr = typeof globValue === 'string' ? globValue : '';
  const regexStr = typeof regexValue === 'string' ? regexValue : '';

  const radioBase =
    'inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700';
  const radioInput =
    'h-4 w-4 border-slate-300 text-accent-500 focus:ring-accent-500';

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Match using"
        className="mb-2 flex gap-4"
      >
        <label className={radioBase}>
          <input
            type="radio"
            name={radioName}
            value="glob"
            className={radioInput}
            checked={mode === 'glob'}
            disabled={disabled}
            onChange={() => handleModeChange('glob')}
          />
          <span>Use glob</span>
        </label>
        <label className={radioBase}>
          <input
            type="radio"
            name={radioName}
            value="regex"
            className={radioInput}
            checked={mode === 'regex'}
            disabled={disabled}
            onChange={() => handleModeChange('regex')}
          />
          <span>Use regex</span>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`${inputId}-glob`}
            className="block text-[12px] font-medium uppercase tracking-wide text-slate-500"
          >
            Glob
          </label>
          <input
            id={`${inputId}-glob`}
            type="text"
            className={`${inputClassFor(error)} mt-1 font-mono text-[13px]`}
            value={globStr}
            placeholder="*.raw"
            disabled={disabled || mode !== 'glob'}
            onChange={(e) => onGlobChange(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div>
          <label
            htmlFor={`${inputId}-regex`}
            className="block text-[12px] font-medium uppercase tracking-wide text-slate-500"
          >
            Regex
          </label>
          <input
            id={`${inputId}-regex`}
            type="text"
            className={`${inputClassFor(error)} mt-1 font-mono text-[13px]`}
            value={regexStr}
            placeholder="^.+\\.raw$"
            disabled={disabled || mode !== 'regex'}
            onChange={(e) => onRegexChange(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

export const GlobRegexPair = memo(GlobRegexPairImpl);
