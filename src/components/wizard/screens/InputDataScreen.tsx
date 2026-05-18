import type { FormState } from '../../../params/paramMetadata';
import { useFormState } from '../../../hooks/useValidation';
import { Field } from '../../form/Field';
import { WizardAdvancedSection } from '../WizardAdvancedSection';

export function InputDataScreen() {
  const state = useFormState();
  return state.mode === 'pdc' ? <PdcInputs /> : <GeneralInputs />;
}

function GeneralInputs() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Provide the quantitative spectra. You can give a single directory, a
        list of directories, or a named batch map. Supported file types:
        <code className="mx-1 rounded bg-slate-100 px-1 font-mono text-[12px]">.raw</code>
        <code className="mx-1 rounded bg-slate-100 px-1 font-mono text-[12px]">.mzML</code>
        <code className="mx-1 rounded bg-slate-100 px-1 font-mono text-[12px]">.d.zip</code>
      </p>
      <Field path="quant_spectra_dir" />
      <Field path="quant_spectra_files" />
      <WizardAdvancedSection>
        <Field path="files_per_quant_batch" bypassTier />
      </WizardAdvancedSection>
    </div>
  );
}

function PdcInputs() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Provide a study identifier. PDC studies are quantified with DIA-NN.
      </p>
      <Field path="pdc.study_id" />
      <WizardAdvancedSection>
        <Field path="pdc.n_raw_files" bypassTier />
        <Field path="pdc.study_name" bypassTier />
        <Field path="pdc.metadata_tsv" bypassTier />
        <Field path="pdc.batch_file" bypassTier />
        <Field path="pdc.gene_level_data" bypassTier />
        <Field path="pdc.s3_download" bypassTier />
        <Field path="pdc.client_args" bypassTier />
      </WizardAdvancedSection>
    </div>
  );
}

// --- canAdvance ----------------------------------------------------------

function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function isQuantSpectraSet(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const v = value as {
    kind?: unknown;
    path?: unknown;
    paths?: unknown;
    entries?: unknown;
  };
  if (v.kind === 'single') return isNonEmptyString(v.path);
  if (v.kind === 'list') {
    return Array.isArray(v.paths) && v.paths.some(isNonEmptyString);
  }
  if (v.kind === 'batch-map') {
    return (
      Array.isArray(v.entries) &&
      v.entries.some((e): boolean => {
        if (e === null || typeof e !== 'object') return false;
        const obj = e as { name?: unknown; path?: unknown };
        return isNonEmptyString(obj.name) && isNonEmptyString(obj.path);
      })
    );
  }
  return false;
}

export function inputDataCanAdvance(state: FormState): boolean {
  if (state.mode === 'pdc') {
    return isNonEmptyString(state.values['pdc.study_id']);
  }
  return isQuantSpectraSet(state.values['quant_spectra_dir']);
}
