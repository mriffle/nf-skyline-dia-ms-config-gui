import { useEffect } from 'react';
import type { FormState } from '../../../params/paramMetadata';
import { useStore } from '../../../state/store';
import { useFormState } from '../../../hooks/useValidation';
import {
  dominantFormat,
  factsForQuantSpectra,
  type SpectraExt,
} from '../../../lib/spectraFormat';
import { WizardRadioCards } from '../WizardRadioCards';

function readFormat(state: FormState): SpectraExt | null {
  const v = state.values['quant_input_format'];
  if (v === 'raw' || v === 'dzip' || v === 'mzml') return v;
  return null;
}

// In General mode, attempt to infer the format from the user's input
// paths/globs. In PDC mode the user provides only a study ID so we have
// nothing to introspect — return null and let the user pick.
function detectFormat(state: FormState): SpectraExt | null {
  if (state.mode !== 'general') return null;
  const facts = factsForQuantSpectra(
    state.values['quant_spectra_dir'],
    state.values['quant_spectra_glob'],
  );
  return dominantFormat(facts);
}

export function InputFormatScreen() {
  const state = useFormState();
  const setValue = useStore((s) => s.setValue);
  const current = readFormat(state);

  // First-visit auto-pick: if the user hasn't chosen a format and we can
  // unambiguously detect one from their input paths, seed it. The user
  // can still change it; we only seed once.
  useEffect(() => {
    if (current !== null) return;
    const detected = detectFormat(state);
    if (detected !== null) setValue('quant_input_format', detected);
  }, [current, state, setValue]);

  const onChange = (next: SpectraExt): void => {
    setValue('quant_input_format', next);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        What format are your spectra in? This affects whether the workflow
        runs msconvert, the Bruker unzip step, or neither.
      </p>
      <WizardRadioCards<SpectraExt>
        ariaLabel="Input spectra format"
        value={current}
        onChange={onChange}
        options={[
          {
            value: 'raw',
            label: 'Thermo .raw',
            description:
              'Vendor RAW from Thermo instruments. Will be converted to mzML by msconvert, unless you choose to feed RAW directly to DIA-NN on the next screen.',
          },
          {
            value: 'dzip',
            label: 'Bruker .d.zip',
            description:
              'Zipped Bruker .d directories. Extracted by the workflow; not msconverted. DIA-NN reads .d directly. (EncyclopeDIA and Cascadia do not accept .d.zip.)',
          },
          {
            value: 'mzml',
            label: 'mzML',
            description:
              'Already-converted mzML. No conversion needed; the workflow uses these files as-is.',
          },
        ]}
      />
    </div>
  );
}

export function inputFormatCanAdvance(state: FormState): boolean {
  return readFormat(state) !== null;
}
