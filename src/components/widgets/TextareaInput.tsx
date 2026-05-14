import { memo } from 'react';
import { getEffectiveDefault } from '../../params/paramMetadata';
import { defaultAsPlaceholder } from '../../lib/formatDefault';
import { inputClassFor, type WidgetProps } from './types';

function TextareaInputImpl({ meta, value, onChange, disabled, required, error, inputId }: WidgetProps) {
  const str = typeof value === 'string' ? value : '';
  const placeholder = meta.placeholder ?? defaultAsPlaceholder(getEffectiveDefault(meta));
  return (
    <textarea
      id={inputId}
      rows={3}
      className={`${inputClassFor(error)} font-mono text-[13px]`}
      value={str}
      disabled={disabled}
      aria-required={required ? 'true' : undefined}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
    />
  );
}

export const TextareaInput = memo(TextareaInputImpl);
