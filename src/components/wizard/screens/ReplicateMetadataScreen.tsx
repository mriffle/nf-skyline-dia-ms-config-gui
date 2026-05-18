import { useStore } from '../../../state/store';
import { useFormState } from '../../../hooks/useValidation';
import { Field } from '../../form/Field';
import { WizardRadioCards } from '../WizardRadioCards';

type Choice = 'no' | 'yes';

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

export function ReplicateMetadataScreen() {
  const state = useFormState();
  const setValue = useStore((s) => s.setValue);
  const clearValue = useStore((s) => s.clearValue);
  const value = state.values['replicate_metadata'];
  // Tracks the radio by touched (rather than non-empty) so the choice
  // sticks while the user is mid-edit of an empty path.
  const current: Choice =
    state.touched['replicate_metadata'] === true ? 'yes' : 'no';

  const onChange = (next: Choice): void => {
    if (next === 'no') {
      clearValue('replicate_metadata');
    } else if (!isNonEmptyString(value)) {
      setValue('replicate_metadata', '');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        A replicate-metadata TSV or CSV adds per-replicate annotations to the
        Skyline document. Optional.
      </p>
      <WizardRadioCards<Choice>
        ariaLabel="Replicate metadata"
        value={current}
        onChange={onChange}
        options={[
          {
            value: 'no',
            label: 'No replicate metadata',
            description: 'Skip annotation. Replicates appear in Skyline with default names.',
            note: 'Default',
          },
          {
            value: 'yes',
            label: 'Provide a metadata file',
            description:
              'TSV or CSV; local path, authenticated Panorama URL, or Panorama Public URL.',
          },
        ]}
      />
      {current === 'yes' ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <Field path="replicate_metadata" />
        </div>
      ) : null}
    </div>
  );
}
