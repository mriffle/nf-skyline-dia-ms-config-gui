// Page chrome: top header (title + reset), three-column body
// (nav | form | preview-placeholder), footer with version.

import { useState } from 'react';
import { STORAGE_KEY, useStore } from '../../state/store';
import { SectionNav } from './SectionNav';
import { FormPane } from './FormPane';
import { PreviewPane } from '../preview/PreviewPane';

declare const __APP_VERSION__: string;

export function AppShell() {
  const reset = useStore((s) => s.reset);
  const [showPreview, setShowPreview] = useState(false);

  const onReset = (): void => {
    const ok = window.confirm(
      'Reset all inputs and clear browser storage? This cannot be undone.',
    );
    if (!ok) return;
    reset();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore — non-fatal.
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-900">
              nf-skyline-dia-ms config builder
            </h1>
            <p className="text-[12px] text-slate-500">
              Generate a Nextflow override config interactively.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className={[
                'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700',
                'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
                'lg:hidden',
              ].join(' ')}
              aria-pressed={showPreview}
            >
              {showPreview ? 'Hide preview' : 'Show preview'}
            </button>
            <button
              type="button"
              onClick={onReset}
              className={[
                'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700',
                'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
              ].join(' ')}
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="w-full lg:w-56 lg:shrink-0">
            <SectionNav />
          </div>
          <div className="flex-1 min-w-0">
            <FormPane />
          </div>
          <div
            className={[
              'w-full lg:sticky lg:top-6 lg:w-[28rem] lg:shrink-0',
              showPreview ? 'block' : 'hidden lg:block',
            ].join(' ')}
          >
            <PreviewPane />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 text-[12px] text-slate-500 sm:px-6">
          v{__APP_VERSION__}
        </div>
      </footer>
    </div>
  );
}
