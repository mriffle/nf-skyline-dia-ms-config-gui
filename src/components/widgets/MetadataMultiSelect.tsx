import { memo } from 'react';
import { useStore } from '../../state/store';
import { optionsForSource } from '../../metadata/options';
import { StringListInput } from './StringListInput';
import type { WidgetProps } from './types';

// Multi-value metadata picker. With a metadata table loaded it renders a
// checkbox group of the table-derived options; without one it falls back to
// the free-text chip list (StringListInput). Selected values that aren't
// among the options are shown as removable red chips and flagged by the
// cross-field rules.
function MetadataMultiSelectImpl(props: WidgetProps) {
  const { meta, value, onChange, disabled, inputId } = props;
  const table = useStore((s) => s.metadata);
  const controlKey = useStore((s) => s.values['batch_report.control_key']);
  const selected: readonly string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];

  if (!table || !meta.metadataSource) {
    return <StringListInput {...props} value={selected} />;
  }

  const options = optionsForSource(table, meta.metadataSource, controlKey);
  const invalidSelected = selected.filter((s) => !options.includes(s));

  const toggle = (opt: string): void => {
    if (disabled) return;
    const next = selected.includes(opt)
      ? selected.filter((v) => v !== opt)
      : [...selected, opt];
    onChange(next);
  };
  const removeInvalid = (opt: string): void => {
    onChange(selected.filter((v) => v !== opt));
  };

  return (
    <div id={inputId} role="group" aria-label={meta.label}>
      {options.length === 0 ? (
        <p className="text-[13px] text-slate-500">
          {meta.metadataSource === 'control-values'
            ? 'Choose a Control key first to list its values.'
            : 'No options available from the loaded metadata.'}
        </p>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 px-3 py-2">
          <div className="flex flex-col gap-1.5">
            {options.map((opt) => {
              const id = `${inputId}-${opt}`;
              const checked = selected.includes(opt);
              return (
                <label
                  key={opt}
                  htmlFor={id}
                  className={[
                    'inline-flex items-center gap-2 text-sm',
                    disabled
                      ? 'cursor-not-allowed text-slate-400'
                      : 'cursor-pointer text-slate-700',
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
                  <span className="font-mono">{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {invalidSelected.length > 0 ? (
        <div className="mt-2">
          <p className="text-[12px] font-medium text-red-700">
            Not present in the loaded metadata:
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {invalidSelected.map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[13px] text-red-800 ring-1 ring-red-200"
              >
                <span className="font-mono">{item}</span>
                {disabled ? null : (
                  <button
                    type="button"
                    aria-label={`Remove ${item}`}
                    className="rounded-full p-0.5 text-red-500 hover:bg-red-100 hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-400"
                    onClick={() => removeInvalid(item)}
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
        </div>
      ) : null}
    </div>
  );
}

export const MetadataMultiSelect = memo(MetadataMultiSelectImpl);
