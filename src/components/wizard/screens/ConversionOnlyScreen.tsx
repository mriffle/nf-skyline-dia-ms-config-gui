import { useStore } from '../../../state/store';
import { useFieldValue } from '../../../hooks/useFieldValue';
import { WizardRadioCards } from '../WizardRadioCards';

type Choice = 'full' | 'convert-only';

export function ConversionOnlyScreen() {
  const setValue = useStore((s) => s.setValue);
  const { value } = useFieldValue('msconvert_only');
  const current: Choice = value === true ? 'convert-only' : 'full';

  const onChange = (next: Choice): void => {
    setValue('msconvert_only', next === 'convert-only');
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        The full workflow runs the search, builds a Skyline document, and
        generates reports. You can also stop after converting spectra to mzML
        if that is all you need.
      </p>
      <WizardRadioCards<Choice>
        ariaLabel="Workflow scope"
        value={current}
        onChange={onChange}
        options={[
          {
            value: 'full',
            label: 'Run the full DIA workflow',
            description:
              'Search, build a Skyline document, optionally run QC and batch reports, and optionally upload to Panorama.',
            note: 'Default',
          },
          {
            value: 'convert-only',
            label: 'Just convert to mzML',
            description:
              'Run msconvert and exit. No search, no Skyline, no QC. Useful for staging mzMLs ahead of a full run.',
          },
        ]}
      />
    </div>
  );
}
