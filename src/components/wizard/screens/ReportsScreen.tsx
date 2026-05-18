import { useStore } from '../../../state/store';
import { useFieldValue } from '../../../hooks/useFieldValue';
import { Field } from '../../form/Field';
import { WizardAdvancedSection } from '../WizardAdvancedSection';

export function ReportsScreen() {
  const setValue = useStore((s) => s.setValue);
  const { value: qcSkip } = useFieldValue('qc_report.skip');
  const { value: batchSkip } = useFieldValue('batch_report.skip');

  const qcOn = qcSkip !== true;
  const batchOn = batchSkip !== true;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        The workflow can generate two kinds of reports after the search and
        Skyline assembly: a QC report (precursor / protein quality) and a
        batch-effects / covariate report.
      </p>

      <ReportToggle
        label="QC report"
        description="Precursor- and protein-level quality plots. Render as HTML or PDF."
        checked={qcOn}
        onChange={(on) => setValue('qc_report.skip', !on)}
      />
      {qcOn ? (
        <WizardAdvancedSection label="QC report options">
          <Field path="qc_report.report_format" bypassTier />
          <Field path="qc_report.normalization_method" bypassTier />
          <Field path="qc_report.imputation_method" bypassTier />
          <Field path="qc_report.exclude_replicates" bypassTier />
          <Field path="qc_report.exclude_projects" bypassTier />
          <Field path="qc_report.standard_proteins" bypassTier />
          <Field path="qc_report.color_vars" bypassTier />
          <Field path="qc_report.export_tables" bypassTier />
          <Field path="qc_report.precursor_report_template" bypassTier />
          <Field path="qc_report.replicate_report_template" bypassTier />
        </WizardAdvancedSection>
      ) : null}

      <ReportToggle
        label="Batch / covariate report"
        description="Batch-effect correction and covariate plots. Off by default."
        checked={batchOn}
        onChange={(on) => setValue('batch_report.skip', !on)}
      />
      {batchOn ? (
        <WizardAdvancedSection label="Batch report options">
          <Field path="batch_report.batch1" bypassTier />
          <Field path="batch_report.batch2" bypassTier />
          <Field path="batch_report.covariate_vars" bypassTier />
          <Field path="batch_report.control_key" bypassTier />
          <Field path="batch_report.control_values" bypassTier />
          <Field path="batch_report.plot_ext" bypassTier />
        </WizardAdvancedSection>
      ) : null}
    </div>
  );
}

interface ReportToggleProps {
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
}

function ReportToggle({ label, description, checked, onChange }: ReportToggleProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-300 bg-white p-3 hover:border-slate-400">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-slate-300 text-accent-500 focus:ring-accent-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <p className="mt-0.5 text-[13px] leading-snug text-slate-600">
          {description}
        </p>
      </div>
    </label>
  );
}
