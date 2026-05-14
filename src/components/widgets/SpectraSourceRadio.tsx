// Tagged-union editor for quant_spectra_dir. Three sub-modes:
//   - 'single'    -> { kind: 'single', path: string }
//   - 'list'      -> { kind: 'list', paths: string[] }
//   - 'batch-map' -> { kind: 'batch-map', entries: { name, path }[] }

import { memo, useId } from 'react';
import { BatchMapBuilder, type BatchEntry } from './BatchMapBuilder';
import { inputClassFor, type WidgetProps } from './types';
import { StringListInput } from './StringListInput';

type Kind = 'single' | 'list' | 'batch-map';

interface SingleValue {
  readonly kind: 'single';
  readonly path: string;
}
interface ListValue {
  readonly kind: 'list';
  readonly paths: readonly string[];
}
interface BatchMapValue {
  readonly kind: 'batch-map';
  readonly entries: readonly BatchEntry[];
}
type SpectraValue = SingleValue | ListValue | BatchMapValue;

function detectKind(value: unknown): Kind {
  if (value !== null && typeof value === 'object') {
    const k = (value as { kind?: unknown }).kind;
    if (k === 'list') return 'list';
    if (k === 'batch-map') return 'batch-map';
  }
  return 'single';
}

function readSingle(value: unknown): string {
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'single'
  ) {
    const p = (value as { path?: unknown }).path;
    return typeof p === 'string' ? p : '';
  }
  return '';
}

function readList(value: unknown): readonly string[] {
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'list'
  ) {
    const paths = (value as { paths?: unknown }).paths;
    if (Array.isArray(paths)) {
      return paths.filter((v): v is string => typeof v === 'string');
    }
  }
  return [];
}

function readEntries(value: unknown): readonly BatchEntry[] {
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'batch-map'
  ) {
    const entries = (value as { entries?: unknown }).entries;
    if (Array.isArray(entries)) {
      const out: BatchEntry[] = [];
      for (const e of entries) {
        if (e === null || typeof e !== 'object') continue;
        const obj = e as { name?: unknown; path?: unknown };
        out.push({
          name: typeof obj.name === 'string' ? obj.name : '',
          path: typeof obj.path === 'string' ? obj.path : '',
        });
      }
      return out;
    }
  }
  return [];
}

function SpectraSourceRadioImpl({
  meta,
  value,
  onChange,
  disabled,
  error,
  inputId,
}: WidgetProps) {
  const kind = detectKind(value);
  const radioName = useId();

  const setKind = (next: Kind): void => {
    if (next === kind) return;
    let nextValue: SpectraValue;
    switch (next) {
      case 'single':
        nextValue = { kind: 'single', path: readSingle(value) };
        break;
      case 'list':
        nextValue = { kind: 'list', paths: readList(value) };
        break;
      case 'batch-map':
        nextValue = { kind: 'batch-map', entries: readEntries(value) };
        break;
    }
    onChange(nextValue);
  };

  const setSinglePath = (p: string): void => {
    onChange({ kind: 'single', path: p } satisfies SingleValue);
  };

  const setList = (paths: readonly string[]): void => {
    onChange({ kind: 'list', paths } satisfies ListValue);
  };

  const setEntries = (entries: readonly BatchEntry[]): void => {
    onChange({ kind: 'batch-map', entries } satisfies BatchMapValue);
  };

  const radioBase =
    'inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700';
  const radioInput =
    'h-4 w-4 border-slate-300 text-accent-500 focus:ring-accent-500';

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Spectra source"
        className="flex flex-wrap gap-x-5 gap-y-2"
      >
        {(['single', 'list', 'batch-map'] as const).map((k) => (
          <label key={k} className={radioBase}>
            <input
              type="radio"
              name={radioName}
              value={k}
              className={radioInput}
              checked={kind === k}
              disabled={disabled}
              onChange={() => setKind(k)}
            />
            <span>
              {k === 'single'
                ? 'Single directory'
                : k === 'list'
                  ? 'Multiple directories'
                  : 'Named batches'}
            </span>
          </label>
        ))}
      </div>

      {kind === 'single' ? (
        <input
          id={inputId}
          type="text"
          className={`${inputClassFor(error)} font-mono text-[13px]`}
          value={readSingle(value)}
          placeholder={meta.placeholder ?? '/path/to/spectra'}
          disabled={disabled}
          onChange={(e) => setSinglePath(e.target.value)}
          spellCheck={false}
        />
      ) : null}

      {kind === 'list' ? (
        <StringListInput
          meta={meta}
          value={readList(value)}
          onChange={(v) =>
            setList(
              Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [],
            )
          }
          disabled={disabled}
          error={error}
          inputId={`${inputId}-list`}
        />
      ) : null}

      {kind === 'batch-map' ? (
        <BatchMapBuilder
          entries={readEntries(value)}
          onChange={setEntries}
          disabled={disabled}
          error={error}
          idPrefix={`${inputId}-batch`}
        />
      ) : null}
    </div>
  );
}

export const SpectraSourceRadio = memo(SpectraSourceRadioImpl);
