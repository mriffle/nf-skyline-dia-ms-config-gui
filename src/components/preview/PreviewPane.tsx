import { useMemo } from 'react';
import { useStore } from '../../state/store';
import { emitConfig } from '../../emit/emitConfig';
import { runValidation } from '../../validation/runValidation';
import type { FormState } from '../../params/paramMetadata';
import { GroovyHighlighter } from './GroovyHighlighter';
import { PreviewActions } from './PreviewActions';

export function PreviewPane() {
  const mode = useStore((s) => s.mode);
  const values = useStore((s) => s.values);
  const touched = useStore((s) => s.touched);

  const state: FormState = useMemo(() => ({ mode, values, touched }), [mode, values, touched]);
  const config = useMemo(() => emitConfig(state), [state]);
  const report = useMemo(() => runValidation(state), [state]);

  const sizeLabel = useMemo(() => {
    const bytes = new TextEncoder().encode(config).length;
    const lines = config.length === 0 ? 0 : config.split('\n').length;
    return `${bytes} bytes · ${lines} lines`;
  }, [config]);

  const errorCount = Object.values(report.fieldErrors).filter(Boolean).length +
    report.crossFieldIssues.filter((i) => i.severity === 'error').length;
  const blockedReason = errorCount > 0
    ? `${errorCount} validation ${errorCount === 1 ? 'error' : 'errors'} — fix to enable Download / Copy`
    : undefined;

  return (
    <aside
      aria-label="Config preview"
      className="flex h-full max-h-[calc(100vh-6rem)] w-full flex-col overflow-hidden rounded-md border border-slate-200 bg-slate-900 text-slate-100 shadow-sm"
    >
      <PreviewActions
        content={config}
        isDownloadable={report.isDownloadable}
        blockedReason={blockedReason}
      />
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <GroovyHighlighter source={config} />
      </div>
      <div className="border-t border-slate-700/60 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-400">
        {sizeLabel}
      </div>
    </aside>
  );
}
