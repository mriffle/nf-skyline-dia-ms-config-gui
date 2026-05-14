import { memo } from 'react';
import { getSchemaEntry } from '../../params/paramMetadata';
import { useStore } from '../../state/store';
import { inputClassFor, type WidgetProps } from './types';

interface Option {
  readonly value: string;
  readonly label: string;
}

// UI-only enum options for params whose enum values do not come from the
// JSON schema (carafe.source lives entirely in the UI layer).
const UI_ENUM_OPTIONS: Readonly<Record<string, readonly Option[]>> = {
  'carafe.source': [
    { value: 'file', label: 'Single spectra file' },
    { value: 'dir', label: 'Spectra directory' },
    { value: 'pdc-files', label: 'Explicit PDC file list' },
    { value: 'pdc-sample', label: 'Random PDC sample' },
  ],
  'qc_report.imputation_method': [
    { value: 'KNN', label: 'KNN' },
  ],
};

function optionsFor(path: string): readonly Option[] {
  const ui = UI_ENUM_OPTIONS[path];
  if (ui) return ui;
  const entry = getSchemaEntry(path);
  if (entry?.shape.kind === 'enum') {
    // Filter case-variant duplicates: keep first lowercase-unique value.
    const seen = new Set<string>();
    const out: Option[] = [];
    for (const v of entry.shape.values) {
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value: v, label: v });
    }
    return out;
  }
  return [];
}

function EnumSelectImpl({ meta, value, onChange, disabled, required, error, inputId }: WidgetProps) {
  const mode = useStore((s) => s.mode);
  const rawOptions = optionsFor(meta.path);
  // The Carafe input-source picker exposes PDC-based options (`pdc-files`,
  // `pdc-sample`) only in PDC mode. General mode keeps the file / dir
  // options only.
  const options =
    meta.path === 'carafe.source' && mode !== 'pdc'
      ? rawOptions.filter((o) => !o.value.startsWith('pdc-'))
      : rawOptions;

  // Compute display value: typed string > empty placeholder.
  const display = typeof value === 'string' ? value : '';
  const showEmpty = display === '';

  const handleChange = (raw: string): void => {
    if (raw === '') {
      onChange(undefined);
      return;
    }
    onChange(raw);
  };

  return (
    <select
      id={inputId}
      className={inputClassFor(error)}
      value={display}
      disabled={disabled}
      aria-required={required ? 'true' : undefined}
      onChange={(e) => handleChange(e.target.value)}
    >
      {showEmpty ? (
        <option value="" disabled>
          --- Select ---
        </option>
      ) : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export const EnumSelect = memo(EnumSelectImpl);
