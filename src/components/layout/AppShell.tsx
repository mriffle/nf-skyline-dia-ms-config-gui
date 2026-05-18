// Page chrome: top header (title + reset), three-column body
// (nav | form | preview-or-graph), footer with version. The right column
// switches between the Groovy config preview and the workflow graph via a
// small tab strip.

import { useState } from 'react';
import { STORAGE_KEY, useStore } from '../../state/store';
import { SectionNav } from './SectionNav';
import { FormPane } from './FormPane';
import { PreviewPane } from '../preview/PreviewPane';
import { WorkflowGraphPane } from '../workflow/WorkflowGraphPane';
import { UploadControl } from '../upload/UploadControl';
import { Wizard } from '../wizard/Wizard';

declare const __APP_VERSION__: string;

type RightTab = 'preview' | 'graph';

export function AppShell() {
  const reset = useStore((s) => s.reset);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<RightTab>('preview');
  const [wizardOpen, setWizardOpen] = useState(false);

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
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
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
              onClick={() => setWizardOpen(true)}
              disabled={wizardOpen}
              className={[
                'rounded-md border border-accent-500 bg-accent-500 px-3 py-1.5 text-sm font-medium text-white',
                'hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500',
                wizardOpen ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              Start wizard…
            </button>
            <UploadControl />
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

      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-8 sm:px-6">
        {wizardOpen ? (
          <Wizard onExit={() => setWizardOpen(false)} />
        ) : (
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <div className="w-full lg:w-56 lg:shrink-0">
              <SectionNav />
            </div>
            <div className="flex-1 min-w-0 lg:max-w-[31rem]">
              <FormPane />
            </div>
            <div
              className={[
                'w-full lg:sticky lg:top-6 lg:min-w-[28rem] lg:flex-1',
                showPreview ? 'block' : 'hidden lg:block',
              ].join(' ')}
            >
              <div className="flex flex-col gap-2">
                <div role="tablist" aria-label="Right pane" className="flex items-center gap-1">
                  <TabButton
                    isActive={activeTab === 'preview'}
                    onClick={() => setActiveTab('preview')}
                    controls="right-pane-preview"
                  >
                    Config preview
                  </TabButton>
                  <TabButton
                    isActive={activeTab === 'graph'}
                    onClick={() => setActiveTab('graph')}
                    controls="right-pane-graph"
                  >
                    Workflow graph
                  </TabButton>
                </div>
                <div
                  id="right-pane-preview"
                  role="tabpanel"
                  hidden={activeTab !== 'preview'}
                >
                  {activeTab === 'preview' ? <PreviewPane /> : null}
                </div>
                <div
                  id="right-pane-graph"
                  role="tabpanel"
                  hidden={activeTab !== 'graph'}
                >
                  {activeTab === 'graph' ? <WorkflowGraphPane /> : null}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-screen-2xl px-4 py-3 text-[12px] text-slate-500 sm:px-6">
          v{__APP_VERSION__}
        </div>
      </footer>
    </div>
  );
}

interface TabButtonProps {
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly controls: string;
  readonly children: React.ReactNode;
}

function TabButton({ isActive, onClick, controls, children }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={controls}
      onClick={onClick}
      className={[
        'rounded-md border px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-500',
        isActive
          ? 'border-accent-500 bg-accent-500 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
