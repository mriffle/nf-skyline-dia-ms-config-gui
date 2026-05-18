import type { FormState } from '../../../params/paramMetadata';
import { useFormState } from '../../../hooks/useValidation';
import { Field } from '../../form/Field';
import { WizardAdvancedSection } from '../WizardAdvancedSection';

// Demultiplex is a single global msconvert setting that applies to every
// stream the workflow msconverts. The wizard surfaces it on whichever
// screen first triggers msconvert.
//
// Carafe consumes mzML and .d.zip as-is and only msconverts Thermo .raw.
// So the only case where demultiplex needs to move to this screen is
// when the user declared Thermo .raw AND chose to feed RAW directly to
// DIA-NN — the main quant flow then skips msconvert, but Carafe will
// still convert its RAW input. For mzML or .d.zip formats Carafe never
// invokes msconvert, so the demultiplex question doesn't apply here.
function showDemultiplexHere(state: FormState): boolean {
  if (state.values['quant_input_format'] !== 'raw') return false;
  return state.values['use_vendor_raw'] === true;
}

export function CarafeInputScreen() {
  const state = useFormState();
  const surfaceDemultiplex = showDemultiplexHere(state);

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Choose which spectra Carafe should use to build the library. The four
        source modes are mutually exclusive.
        {state.mode !== 'pdc'
          ? ' (PDC-based sources are available only in PDC mode.)'
          : null}
      </p>
      <Field path="carafe.source" />
      <Field path="carafe.spectra_file" />
      <Field path="carafe.spectra_dir" />
      {/* These three are tier:'advanced' in paramMetadata because the
          form treats them as niche, but in the wizard they ARE the
          primary input field for their selected Carafe source mode —
          render them with bypassTier so they appear at the top level. */}
      <Field path="carafe.spectra_files" bypassTier />
      <Field path="carafe.pdc_files" bypassTier />
      <Field path="carafe.pdc_n_files" bypassTier />
      {surfaceDemultiplex ? (
        <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-[13px] text-amber-900">
            <span className="font-medium">Carafe still converts Thermo .raw to mzML.</span>{' '}
            Your main quant flow won&apos;t run msconvert (you chose to
            feed RAW directly to DIA-NN), but Carafe will. Set the
            demultiplex option for that conversion:
          </p>
          <Field path="msconvert.do_demultiplex" />
          <WizardAdvancedSection label="Advanced msconvert options">
            <Field path="msconvert.do_simasspectra" bypassTier />
            <Field path="msconvert.mz_shift_ppm" bypassTier />
          </WizardAdvancedSection>
        </div>
      ) : null}
      <WizardAdvancedSection label="Advanced Carafe options">
        <Field path="carafe.peptide_results_file" bypassTier />
        <Field path="carafe.carafe_fasta" bypassTier />
        <Field path="carafe.diann_fasta" bypassTier />
        <Field path="carafe.include_phosphorylation" bypassTier />
        <Field path="carafe.include_oxidized_methionine" bypassTier />
        <Field path="carafe.max_mod_option" bypassTier />
        <Field path="carafe.cli_options" bypassTier />
      </WizardAdvancedSection>
    </div>
  );
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringOrNonEmptyArray(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(isNonEmptyString);
  return isNonEmptyString(v);
}

export function carafeInputCanAdvance(state: FormState): boolean {
  const src = state.values['carafe.source'];
  switch (src) {
    case 'file':
      return isNonEmptyString(state.values['carafe.spectra_file']);
    case 'dir':
      return isNonEmptyString(state.values['carafe.spectra_dir']);
    case 'pdc-files':
      return isStringOrNonEmptyArray(state.values['carafe.pdc_files']);
    case 'pdc-sample': {
      const v = state.values['carafe.pdc_n_files'];
      return typeof v === 'number' && Number.isInteger(v) && v >= 1;
    }
    default:
      return false;
  }
}
