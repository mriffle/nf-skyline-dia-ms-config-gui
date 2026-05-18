import type { FormState } from '../../../params/paramMetadata';
import { useStore } from '../../../state/store';
import { useFieldValue } from '../../../hooks/useFieldValue';
import { Field } from '../../form/Field';
import { WizardAdvancedSection } from '../WizardAdvancedSection';
import { WizardRadioCards } from '../WizardRadioCards';

type Choice = 'no' | 'yes';

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

export function PanoramaScreen() {
  const setValue = useStore((s) => s.setValue);
  const { value } = useFieldValue('panorama.upload');
  const current: Choice = value === true ? 'yes' : 'no';

  const onChange = (next: Choice): void => {
    setValue('panorama.upload', next === 'yes');
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        At the end of the run, the workflow can upload the converted spectra,
        search outputs, FASTA, library, and Skyline document to PanoramaWeb.
      </p>
      <WizardRadioCards<Choice>
        ariaLabel="Panorama upload"
        value={current}
        onChange={onChange}
        options={[
          {
            value: 'no',
            label: 'Do not upload',
            description: 'Skip Panorama. Results stay in the local results directory.',
            note: 'Default',
          },
          {
            value: 'yes',
            label: 'Upload to PanoramaWeb',
            description: 'Push spectra, search outputs, FASTA, library, and the Skyline doc to a Panorama folder.',
          },
        ]}
      />
      {current === 'yes' ? (
        <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <Field path="panorama.upload_url" />
          <Field path="panorama.import_skyline" />
          <WizardAdvancedSection>
            <Field path="email" bypassTier />
          </WizardAdvancedSection>
        </div>
      ) : null}
    </div>
  );
}

export function panoramaCanAdvance(state: FormState): boolean {
  if (state.values['panorama.upload'] !== true) return true;
  return isNonEmptyString(state.values['panorama.upload_url']);
}
