import { memo } from 'react';
import { getEffectiveDefault } from '../../params/paramMetadata';
import { defaultAsPlaceholder } from '../../lib/formatDefault';
import { inputClassFor, type WidgetProps } from './types';

function TextInputImpl({ meta, value, onChange, disabled, required, error, inputId }: WidgetProps) {
  const str = typeof value === 'string' ? value : '';
  const isFileOrUrl = meta.widget === 'file-or-url';
  const placeholder = meta.placeholder ?? defaultAsPlaceholder(getEffectiveDefault(meta));

  return (
    <div>
      <input
        id={inputId}
        type="text"
        className={inputClassFor(error)}
        value={str}
        disabled={disabled}
        aria-required={required ? 'true' : undefined}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {isFileOrUrl ? (
        <p className="mt-1 text-[13px] text-slate-500">
          Local path or Panorama WebDAV URL.
        </p>
      ) : null}
    </div>
  );
}

export const TextInput = memo(TextInputImpl);
