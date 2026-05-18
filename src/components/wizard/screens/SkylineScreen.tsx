import { useStore } from '../../../state/store';
import { useFieldValue } from '../../../hooks/useFieldValue';
import { Field } from '../../form/Field';
import { WizardAdvancedSection } from '../WizardAdvancedSection';
import { WizardRadioCards } from '../WizardRadioCards';

type Choice = 'build' | 'skip';

export function SkylineScreen() {
  const setValue = useStore((s) => s.setValue);
  const { value } = useFieldValue('skyline.skip');
  const current: Choice = value === true ? 'skip' : 'build';

  const onChange = (next: Choice): void => {
    setValue('skyline.skip', next === 'skip');
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        The workflow can build a Skyline document from the search results.
        Skipping it disables QC reports, batch reports, replicate annotation,
        and Panorama-side Skyline import.
      </p>
      <WizardRadioCards<Choice>
        ariaLabel="Skyline document"
        value={current}
        onChange={onChange}
        options={[
          {
            value: 'build',
            label: 'Build a Skyline document',
            description:
              'The workflow assembles a .sky.zip using a default template (or one you provide).',
            note: 'Default',
          },
          {
            value: 'skip',
            label: 'Skip Skyline',
            description:
              'No .sky.zip is built. QC and batch reports are also skipped.',
          },
        ]}
      />
      {current === 'build' ? (
        <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <Field path="skyline.document_name" />
          <WizardAdvancedSection>
            <Field path="skyline.template_file" bypassTier />
            <Field path="skyline.fasta" bypassTier />
            <Field path="skyline.skyr_file" bypassTier />
            <Field path="skyline.minimize" bypassTier />
            <Field path="skyline.group_proteins" bypassTier />
            <Field path="skyline.group_by_gene" bypassTier />
            <Field path="skyline.protein_parsimony" bypassTier />
            <Field path="skyline.use_hardlinks" bypassTier />
          </WizardAdvancedSection>
        </div>
      ) : null}
    </div>
  );
}
