import { memo } from 'react';
import { useStore } from '../../state/store';
import { optionsForSource } from '../../metadata/options';
import { inputClassFor, type WidgetProps } from './types';
import { TextInput } from './TextInput';

// Single-value metadata picker. With a metadata table loaded it renders a
// <select> of the table-derived options (column names, etc.); without one
// it falls back to a plain text input (the field's pre-metadata behavior).
// A current value that isn't among the options (e.g. loaded from a config
// that predates the metadata) is kept and shown as a flagged option so the
// user sees it — the cross-field rule reports it as an error.
function MetadataSingleSelectImpl(props: WidgetProps) {
  const { meta, value, onChange, disabled, required, error, inputId } = props;
  const table = useStore((s) => s.metadata);
  const controlKey = useStore((s) => s.values['batch_report.control_key']);

  if (!table || !meta.metadataSource) {
    return <TextInput {...props} />;
  }

  const options = optionsForSource(table, meta.metadataSource, controlKey);
  const display = typeof value === 'string' ? value : '';
  const isInvalid = display !== '' && !options.includes(display);

  const handleChange = (raw: string): void => {
    onChange(raw === '' ? undefined : raw);
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
      <option value="">(none)</option>
      {isInvalid ? (
        <option value={display}>{display} — not in metadata</option>
      ) : null}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export const MetadataSingleSelect = memo(MetadataSingleSelectImpl);
