// Renders a single param field (or returns null if it should be hidden).
// Looks up the ParamMeta by path, checks visibility + tier, and dispatches
// to the appropriate widget component.

import { useId } from 'react';
import { paramMetadataByPath, getEffectiveDefault, isAlwaysEmit } from '../../params/paramMetadata';
import { useStore } from '../../state/store';
import { useFieldValue } from '../../hooks/useFieldValue';
import { useValidation } from '../../hooks/useValidation';
import { useFormState } from '../../hooks/useValidation';
import { formatDefault } from '../../lib/formatDefault';
import { FieldShell } from './FieldShell';
import { TextInput } from '../widgets/TextInput';
import { TextareaInput } from '../widgets/TextareaInput';
import { NumberInput } from '../widgets/NumberInput';
import { BooleanToggle } from '../widgets/BooleanToggle';
import { EnumSelect } from '../widgets/EnumSelect';
import { MultiEnumChecks } from '../widgets/MultiEnumChecks';
import { StringListInput } from '../widgets/StringListInput';
import { GlobRegexPair } from '../widgets/GlobRegexPair';
import { SpectraSourceRadio } from '../widgets/SpectraSourceRadio';
import { BatchMapBuilder } from '../widgets/BatchMapBuilder';
import type { WidgetProps } from '../widgets/types';

interface FieldProps {
  readonly path: string;
}

export function Field({ path }: FieldProps) {
  const meta = paramMetadataByPath[path];
  const state = useFormState();
  const showAdvanced = useStore((s) => s.showAdvanced);
  const setValue = useStore((s) => s.setValue);
  const validation = useValidation();
  const { value } = useFieldValue(path);
  const generatedId = useId();

  if (!meta) return null;

  // Visibility check (uses live state).
  if (meta.visibleWhen && !meta.visibleWhen(state)) return null;
  // Tier check.
  if (meta.tier === 'advanced' && !showAdvanced) return null;

  const required = meta.requiredWhen ? meta.requiredWhen(state) : false;
  const error = validation.fieldErrors[path];
  const inputId = `input-${generatedId}`;
  // alwaysEmit fields always carry a value in the dropdown / input itself,
  // so a separate "Default: X" hint would just duplicate what's already on
  // screen.
  const defaultHint = isAlwaysEmit(meta, state)
    ? null
    : formatDefault(getEffectiveDefault(meta));

  const widgetProps: WidgetProps = {
    meta,
    value,
    onChange: (v) => setValue(path, v),
    required,
    error,
    inputId,
  };

  return (
    <FieldShell
      path={path}
      inputId={inputId}
      label={meta.label}
      help={meta.help}
      error={error}
      required={required}
      defaultHint={defaultHint ?? undefined}
    >
      {renderWidget(widgetProps)}
    </FieldShell>
  );
}

function renderWidget(props: WidgetProps) {
  switch (props.meta.widget) {
    case 'text':
    case 'file-or-url':
      return <TextInput {...props} />;
    case 'textarea':
      return <TextareaInput {...props} />;
    case 'number':
      return <NumberInput {...props} />;
    case 'boolean':
      return <BooleanToggle {...props} />;
    case 'enum':
      return <EnumSelect {...props} />;
    case 'multi-enum':
      return <MultiEnumChecks {...props} />;
    case 'string-list': {
      const items: readonly string[] = Array.isArray(props.value)
        ? props.value.filter((v): v is string => typeof v === 'string')
        : [];
      return <StringListInput {...props} value={items} />;
    }
    case 'glob-regex-pair':
      return <GlobRegexPair {...props} />;
    case 'spectra-source':
      return <SpectraSourceRadio {...props} />;
    case 'batch-map': {
      const entries = Array.isArray(props.value)
        ? props.value.filter(
            (e): e is { name: string; path: string } =>
              !!e &&
              typeof e === 'object' &&
              typeof (e as { name?: unknown }).name === 'string' &&
              typeof (e as { path?: unknown }).path === 'string',
          )
        : [];
      return (
        <BatchMapBuilder
          entries={entries}
          onChange={props.onChange}
          disabled={props.disabled}
          error={props.error}
          idPrefix={props.inputId}
        />
      );
    }
    default: {
      const _exhaustive: never = props.meta.widget;
      return _exhaustive;
    }
  }
}
