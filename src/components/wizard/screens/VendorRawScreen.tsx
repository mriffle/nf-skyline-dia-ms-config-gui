import { useStore } from '../../../state/store';
import { useFieldValue } from '../../../hooks/useFieldValue';
import { Field } from '../../form/Field';
import { WizardAdvancedSection } from '../WizardAdvancedSection';
import { WizardRadioCards } from '../WizardRadioCards';

type Choice = 'convert' | 'direct';

export function VendorRawScreen() {
  const setValue = useStore((s) => s.setValue);
  const { value } = useFieldValue('use_vendor_raw');
  const { value: demultiplex } = useFieldValue('msconvert.do_demultiplex');
  const current: Choice = value === true ? 'direct' : 'convert';
  const conflict = current === 'direct' && demultiplex === true;

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
              'Skip msconvert. Only DIA-NN supports this — the search engine will be locked to DIA-NN on the next screen. Not an option if your DIA windows overlap: demultiplexing them requires msconvert.',
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
        <div className="space-y-4">
          <div
            className={
              conflict
                ? 'space-y-3 rounded-md border border-red-200 bg-red-50 p-3'
                : 'space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3'
            }
          >
            <p
              className={
                conflict ? 'text-[13px] text-red-700' : 'text-[13px] text-slate-600'
              }
            >
              {conflict ? (
                <>
                  <span className="font-medium">
                    Demultiplexing requires msconvert.
                  </span>{' '}
                  DIA-NN and Skyline read the .raw files directly and cannot
                  demultiplex overlapping windows. Turn this off, or go back and
                  choose &ldquo;Convert RAW to mzML first&rdquo;.
                </>
              ) : (
                'Reading RAW directly means msconvert never runs, so overlapping DIA windows cannot be demultiplexed.'
              )}
            </p>
            <Field path="msconvert.do_demultiplex" />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <WizardAdvancedSection label="Advanced vendor-RAW options">
              <Field path="vendor_raw_copy" bypassTier />
            </WizardAdvancedSection>
          </div>
        </div>
      )}
    </div>
  );
}
