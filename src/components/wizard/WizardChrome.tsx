// Wizard chrome: progress strip on the left/top, current step's title and
// content in the middle, Back / Next / Finish / Cancel buttons at the
// bottom.

import type { ReactNode } from 'react';
import type { WizardScreen } from './flow';

interface WizardChromeProps {
  readonly screens: readonly WizardScreen[];
  readonly currentIndex: number;
  readonly canAdvance: boolean;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly onFinish: () => void;
  readonly onCancel: () => void;
  readonly onJumpTo: (index: number) => void;
  readonly children: ReactNode;
}

export function WizardChrome({
  screens,
  currentIndex,
  canAdvance,
  onBack,
  onNext,
  onFinish,
  onCancel,
  onJumpTo,
  children,
}: WizardChromeProps) {
  const current = screens[currentIndex];
  const total = screens.length;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;
  if (!current) return null;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside
        aria-label="Wizard progress"
        className="w-full shrink-0 lg:sticky lg:top-6 lg:w-56"
      >
        <ol className="space-y-1">
          {screens.map((s, i) => {
            const completed = i < currentIndex;
            const active = i === currentIndex;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!completed && !active}
                  onClick={() => onJumpTo(i)}
                  className={[
                    'block w-full rounded-md px-3 py-1.5 text-left text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-accent-500',
                    active
                      ? 'bg-accent-50 font-semibold text-accent-700'
                      : completed
                        ? 'text-slate-700 hover:bg-slate-100'
                        : 'cursor-not-allowed text-slate-400',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mr-2 inline-block h-5 w-5 rounded-full text-center text-[12px] font-medium leading-5',
                      active
                        ? 'bg-accent-500 text-white'
                        : completed
                          ? 'bg-accent-100 text-accent-700'
                          : 'bg-slate-100 text-slate-500',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  {s.shortLabel}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-slate-500">
            Step {currentIndex + 1} of {total}
          </div>
          <h2 className="text-[20px] font-semibold text-slate-900">
            {current.title}
          </h2>
          <div className="mt-5">{children}</div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            className={[
              'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700',
              'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
            ].join(' ')}
          >
            Exit wizard
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={isFirst}
              className={[
                'rounded-md border px-3 py-1.5 text-sm font-medium',
                'focus:outline-none focus:ring-2 focus:ring-accent-500',
                isFirst
                  ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              Back
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={onFinish}
                className={[
                  'rounded-md border border-accent-500 bg-accent-500 px-4 py-1.5 text-sm font-medium text-white',
                  'hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500',
                ].join(' ')}
              >
                Finish — open in form
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                disabled={!canAdvance}
                className={[
                  'rounded-md border px-4 py-1.5 text-sm font-medium',
                  'focus:outline-none focus:ring-2 focus:ring-accent-500',
                  canAdvance
                    ? 'border-accent-500 bg-accent-500 text-white hover:bg-accent-600'
                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400',
                ].join(' ')}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
