import { useStore } from '../../../state/store';
import { useFieldValue } from '../../../hooks/useFieldValue';
import { Field } from '../../form/Field';
import { WizardAdvancedSection } from '../WizardAdvancedSection';
import { WizardRadioCards } from '../WizardRadioCards';

type Choice = 'convert' | 'direct';

export function VendorRawScreen() {
  const setValue = useStore((s) => s.setValue);
  const { value } = useFieldValue('use_vendor_raw');
  const current: Choice = value === true ? 'direct' : 'convert';

  const onChange = (next: Choice): void => {
    setValue('use_vendor_raw', next === 'direct');
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Your Thermo .raw files can either be converted to mzML by msconvert,
        or fed directly to DIA-NN (which reads RAW natively).
      </p>
      <WizardRadioCards<Choice>
        ariaLabel="Vendor RAW handling"
        value={current}
        onChange={onChange}
        options={[
          {
            value: 'convert',
            label: 'Convert RAW to mzML first',
            description:
              'Run msconvert on every RAW file before search. Works with all search engines.',
            note: 'Default',
          },
          {
            value: 'direct',
            label: 'Feed RAW directly to DIA-NN',
            description:
              'Skip msconvert for the main quant flow. Only DIA-NN supports this — the search engine will be locked to DIA-NN on the next screen. Note: Carafe (if enabled later) still converts its inputs to mzML; the demultiplex option moves to the Carafe input screen in that case.',
          },
        ]}
      />
      {current === 'convert' ? (
        <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <Field path="msconvert.do_demultiplex" />
          <WizardAdvancedSection label="Advanced msconvert options">
            <Field path="msconvert.do_simasspectra" bypassTier />
            <Field path="msconvert.mz_shift_ppm" bypassTier />
          </WizardAdvancedSection>
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <WizardAdvancedSection label="Advanced vendor-RAW options">
            <Field path="vendor_raw_copy" bypassTier />
          </WizardAdvancedSection>
        </div>
      )}
    </div>
  );
}
