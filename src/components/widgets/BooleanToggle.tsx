import { memo } from 'react';
import type { WidgetProps } from './types';

function BooleanToggleImpl({ value, onChange, disabled, inputId }: WidgetProps) {
  const on = value === true;
  const handleToggle = (): void => {
    if (disabled) return;
    onChange(!on);
  };
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <button
      id={inputId}
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={onKey}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-1',
        on ? 'bg-accent-500' : 'bg-slate-300',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-5 w-5 transform rounded-full bg-white shadow ring-1 ring-slate-200 transition-transform',
          on ? 'translate-x-5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

export const BooleanToggle = memo(BooleanToggleImpl);
