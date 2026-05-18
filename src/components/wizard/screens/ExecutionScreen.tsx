import { Field } from '../../form/Field';
import { WizardAdvancedSection } from '../WizardAdvancedSection';

export function ExecutionScreen() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        The workflow profiles (standard, slurm, AWS Batch) set sensible
        defaults for CPU, memory, walltime, and cache directories. You can
        override any of them here, or just click Next.
      </p>
      <WizardAdvancedSection label="Override execution defaults">
        <Field path="result_dir" bypassTier />
        <Field path="report_dir" bypassTier />
        <Field path="max_cpus" bypassTier />
        <Field path="max_memory" bypassTier />
        <Field path="max_time" bypassTier />
        <Field path="random_file_seed" bypassTier />
        <Field path="mzml_cache_directory" bypassTier />
        <Field path="panorama_cache_directory" bypassTier />
      </WizardAdvancedSection>
    </div>
  );
}
