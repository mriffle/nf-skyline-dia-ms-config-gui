import { useStore } from '../../state/store';

export function AdvancedToggle() {
  const showAdvanced = useStore((s) => s.showAdvanced);
  const toggleAdvanced = useStore((s) => s.toggleAdvanced);

  return (
    <label
      className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700"
      htmlFor="toggle-advanced"
    >
      <button
        id="toggle-advanced"
        type="button"
        role="switch"
        aria-checked={showAdvanced}
        onClick={toggleAdvanced}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-1',
          showAdvanced ? 'bg-accent-500' : 'bg-slate-300',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-white shadow ring-1 ring-slate-200 transition-transform',
            showAdvanced ? 'translate-x-4' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
      <span>Show advanced options</span>
    </label>
  );
}
