import type { FormState, Mode } from '../../../params/paramMetadata';
import { paramMetadataByPath } from '../../../params/paramMetadata';
import {
  previewClearTargetsForModeChange,
  useStore,
} from '../../../state/store';
import { WizardRadioCards } from '../WizardRadioCards';

const MODE_LABELS: Readonly<Record<Mode, string>> = {
  general: 'My own files',
  pdc: 'NCI Proteomic Data Commons',
};

export function ModeScreen() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  const switchTo = (target: Mode): void => {
    if (target === mode) return;
    const { values, touched } = useStore.getState();
    const targets = previewClearTargetsForModeChange(
      { mode, values, touched },
      target,
    );
    const touchedTargets = targets.filter((p) => touched[p] === true);
    if (touchedTargets.length > 0) {
      const labels = touchedTargets
        .map((p) => paramMetadataByPath[p]?.label ?? p)
        .slice(0, 5)
        .join(', ');
      const more =
        touchedTargets.length > 5 ? ` (and ${touchedTargets.length - 5} more)` : '';
      const ok = window.confirm(
        `Switching to ${MODE_LABELS[target]} will clear ${touchedTargets.length} input field(s) ` +
          `you've set in ${MODE_LABELS[mode]} mode: ${labels}${more}. Continue?`,
      );
      if (!ok) return;
    }
    setMode(target);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        The workflow can run on a folder of files you provide, or pull spectra
        directly from a study on the NCI Proteomic Data Commons.
      </p>
      <WizardRadioCards<Mode>
        ariaLabel="Spectra source mode"
        value={mode}
        onChange={(v) => switchTo(v)}
        options={[
          {
            value: 'general',
            label: 'My own files',
            description:
              'Local files or Panorama URLs that you point the workflow at. Works with any supported search engine.',
          },
          {
            value: 'pdc',
            label: 'NCI Proteomic Data Commons',
            description:
              'Pull spectra and metadata directly from a PDC study. Requires DIA-NN as the search engine; replicate annotations come from PDC.',
          },
        ]}
      />
    </div>
  );
}

export function modeCanAdvance(state: FormState): boolean {
  return state.mode === 'general' || state.mode === 'pdc';
}
