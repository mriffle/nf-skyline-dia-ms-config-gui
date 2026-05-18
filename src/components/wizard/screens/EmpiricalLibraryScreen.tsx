import { useStore } from '../../../state/store';
import { useFormState } from '../../../hooks/useValidation';
import { Field } from '../../form/Field';
import { WizardAdvancedSection } from '../WizardAdvancedSection';
import { WizardRadioCards } from '../WizardRadioCards';

type Choice = 'no' | 'yes';

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

export function EmpiricalLibraryScreen() {
  const state = useFormState();
  const setValue = useStore((s) => s.setValue);
  const clearValue = useStore((s) => s.clearValue);
  const narrow = state.values['chromatogram_library_spectra_dir'];
  // "Yes" sticks while the user is mid-edit of an empty path — track by
  // touched, not by whether the value is non-empty.
  const current: Choice =
    state.touched['chromatogram_library_spectra_dir'] === true ? 'yes' : 'no';

  const onChange = (next: Choice): void => {
    if (next === 'no') {
      clearValue('chromatogram_library_spectra_dir');
      clearValue('chromatogram_library_spectra_glob');
      clearValue('chromatogram_library_spectra_regex');
      clearValue('files_per_chrom_lib');
    } else {
      // Seed an empty string so the field renders; the user fills it in.
      if (!isNonEmptyString(narrow)) {
        setValue('chromatogram_library_spectra_dir', '');
      }
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        An empirical library is built from extra spectra (narrow-window GPF
        acquisitions, pooled samples, or a subset of the quant files) before
        the main search. EncyclopeDIA builds a .elib; DIA-NN runs a subset
        search to refine its library. Most workflows skip this step.
      </p>
      <WizardRadioCards<Choice>
        ariaLabel="Empirical library"
        value={current}
        onChange={onChange}
        options={[
          {
            value: 'no',
            label: 'Skip empirical library',
            description: 'The main search runs against the FASTA / library directly.',
            note: 'Default',
          },
          {
            value: 'yes',
            label: 'Use empirical-library spectra',
            description:
              'Build an empirical library from additional spectra before the main search.',
          },
        ]}
      />
      {current === 'yes' ? (
        <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <Field path="chromatogram_library_spectra_dir" />
          <Field path="chromatogram_library_files" />
          <WizardAdvancedSection>
            <Field path="files_per_chrom_lib" bypassTier />
          </WizardAdvancedSection>
        </div>
      ) : null}
    </div>
  );
}
