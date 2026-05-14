// Segmented control: General Usage / PDC Study. Switching modes invokes
// previewClearTargetsForModeChange and asks for confirmation when any
// touched values would be cleared.

import type { Mode } from '../params/paramMetadata';
import { previewClearTargetsForModeChange, useStore } from '../state/store';
import { paramMetadataByPath } from '../params/paramMetadata';

const MODE_LABELS: Readonly<Record<Mode, string>> = {
  general: 'General Usage',
  pdc: 'PDC Study',
};

export function ModeToggle() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  const switchTo = (target: Mode): void => {
    if (target === mode) return;
    const { values, touched } = useStore.getState();
    const targets = previewClearTargetsForModeChange(
      { mode, values, touched },
      target,
    );
    // Only consider paths that the user has touched.
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
    <div
      role="radiogroup"
      aria-label="Mode"
      className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5"
    >
      {(['general', 'pdc'] as const).map((m) => {
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => switchTo(m)}
            className={[
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-1',
              active
                ? 'bg-accent-500 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {MODE_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
