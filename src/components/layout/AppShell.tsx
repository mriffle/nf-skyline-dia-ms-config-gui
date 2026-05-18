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
                'inline-flex items-center gap-1.5 rounded-md border border-accent-500 bg-accent-500 px-3 py-1.5 text-sm font-medium text-white',
                'hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500',
                wizardOpen ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              <WizardIcon />
              Start wizard…
            </button>
            <UploadControl />
            <button
              type="button"
              onClick={onReset}
              className={[
                'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700',
                'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
              ].join(' ')}
            >
              <ResetIcon />
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
                    icon={<ConfigPreviewIcon />}
                  >
                    Config preview
                  </TabButton>
                  <TabButton
                    isActive={activeTab === 'graph'}
                    onClick={() => setActiveTab('graph')}
                    controls="right-pane-graph"
                    icon={<WorkflowGraphIcon />}
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
  readonly icon?: React.ReactNode;
  readonly children: React.ReactNode;
}

function WizardIcon() {
  // Sparkles — evokes a "magic" guided experience.
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2.5 9.2 6 12.5 7 9.2 8 8 11.5 6.8 8 3.5 7 6.8 6 8 2.5Z" />
      <path d="M14.5 11 15.2 13.1 17.3 13.8 15.2 14.5 14.5 16.6 13.8 14.5 11.7 13.8 13.8 13.1 14.5 11Z" />
    </svg>
  );
}

function ResetIcon() {
  // Circular arrow — undo / refresh.
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6" />
      <path d="M3 3v3.5h3.5" />
    </svg>
  );
}

function TabButton({ isActive, onClick, controls, icon, children }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={controls}
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-500',
        isActive
          ? 'border-accent-500 bg-accent-500 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}

function ConfigPreviewIcon() {
  // Document with code brackets — represents the generated config text.
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 2.75h6.25L15 6.5v10.75a.75.75 0 0 1-.75.75H5.75a.75.75 0 0 1-.75-.75V3.5a.75.75 0 0 1 .75-.75Z" />
      <path d="M11 2.75V6.5H15" />
      <path d="m8.25 10.5-1.5 1.75 1.5 1.75" />
      <path d="m11.75 10.5 1.5 1.75-1.5 1.75" />
    </svg>
  );
}

function WorkflowGraphIcon() {
  // Three connected nodes — evokes the DAG visualization.
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="5" cy="4.5" r="2" />
      <circle cx="15" cy="10" r="2" />
      <circle cx="5" cy="15.5" r="2" />
      <path d="M6.7 5.6 13.3 8.9" />
      <path d="M6.7 14.4 13.3 11.1" />
    </svg>
  );
}
