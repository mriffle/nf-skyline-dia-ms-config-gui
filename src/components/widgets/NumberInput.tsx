import { memo } from 'react';
import { getSchemaEntry, getEffectiveDefault } from '../../params/paramMetadata';
import { defaultAsPlaceholder } from '../../lib/formatDefault';
import { inputClassFor, type WidgetProps } from './types';

function NumberInputImpl({ meta, value, onChange, disabled, required, error, inputId }: WidgetProps) {
  const entry = getSchemaEntry(meta.path);
  const isInteger = entry?.shape.kind === 'integer';
  const min = entry?.minimum;
  const max = entry?.maximum;
  const placeholder = meta.placeholder ?? defaultAsPlaceholder(getEffectiveDefault(meta));

  const display =
    typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

  const onInput = (raw: string): void => {
    if (raw === '') {
      onChange(undefined);
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n)) {
      // Surface as a non-number; let validation flag it.
      onChange(raw);
      return;
    }
    onChange(n);
  };

  return (
    <input
      id={inputId}
      type="number"
      step={isInteger ? 1 : 'any'}
      min={min}
      max={max}
      className={inputClassFor(error)}
      value={display}
      disabled={disabled}
      aria-required={required ? 'true' : undefined}
      placeholder={placeholder}
      onChange={(e) => onInput(e.target.value)}
    />
  );
}

export const NumberInput = memo(NumberInputImpl);
