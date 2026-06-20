import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../state/store';
import { emitConfig } from '../../emit/emitConfig';
import { runValidation } from '../../validation/runValidation';
import { runLoadPipeline } from '../../parse/loadPipeline';
import type { MapResult } from '../../parse/mapToState';
import type { ParseResult } from '../../parse/types';
import type { FormState } from '../../params/paramMetadata';
import { GroovyHighlighter } from './GroovyHighlighter';
import { CodeEditor } from './CodeEditor';
import { PreviewActions } from './PreviewActions';
import { UploadDialog } from '../upload/UploadDialog';
import { UploadErrorDialog, type UploadErrorVariant } from '../upload/UploadErrorDialog';

interface PreviewPaneProps {
  // Notifies the shell when the in-place editor opens/closes so it can
  // disable the form pane, the graph tab, and Reset while editing.
  readonly onEditingChange?: (editing: boolean) => void;
}

interface PendingApply {
  readonly parsed: ParseResult;
  readonly mapped: MapResult;
}

export function PreviewPane({ onEditingChange }: PreviewPaneProps) {
  const mode = useStore((s) => s.mode);
  const values = useStore((s) => s.values);
  const touched = useStore((s) => s.touched);
  const preservedOuterText = useStore((s) => s.preservedOuterText);
  const loadFromConfig = useStore((s) => s.loadFromConfig);

  const state: FormState = useMemo(
    () => ({ mode, values, touched, preservedOuterText }),
    [mode, values, touched, preservedOuterText],
  );
  const config = useMemo(() => emitConfig(state), [state]);
  const report = useMemo(() => runValidation(state), [state]);

  // Edit-mode state. The draft is a transient buffer seeded from the
  // live emit when editing starts; the live projection is suspended
  // while editing so a form change can't clobber the buffer.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingApply | null>(null);
  const [errorVariant, setErrorVariant] = useState<UploadErrorVariant | null>(null);

  const displayed = editing ? draft : config;

  const sizeLabel = useMemo(() => {
    const bytes = new TextEncoder().encode(displayed).length;
    const lines = displayed.length === 0 ? 0 : displayed.split('\n').length;
    return `${bytes} bytes · ${lines} lines`;
  }, [displayed]);

  const errorCount = Object.values(report.fieldErrors).filter(Boolean).length +
    report.crossFieldIssues.filter((i) => i.severity === 'error').length;
  const blockedReason = errorCount > 0
    ? `${errorCount} validation ${errorCount === 1 ? 'error' : 'errors'} — fix to enable Download / Copy`
    : undefined;

  const setEditingState = (next: boolean): void => {
    setEditing(next);
    onEditingChange?.(next);
  };

  const onEnterEdit = (): void => {
    setDraft(config);
    setEditingState(true);
  };

  const onCancel = (): void => {
    setPending(null);
    setErrorVariant(null);
    setEditingState(false);
  };

  const commit = (next: FormState): void => {
    loadFromConfig(next);
    setPending(null);
    setEditingState(false);
  };

  const onApply = (): void => {
    const outcome = runLoadPipeline(draft);
    if (outcome.kind === 'syntax-errors') {
      setErrorVariant({ kind: 'syntax-errors', issues: outcome.issues });
      return;
    }
    if (outcome.kind === 'no-params') {
      setErrorVariant({
        kind: 'no-params-block',
        hadParamsBlock: outcome.hadParamsBlock,
        errors: outcome.errors,
      });
      return;
    }
    const { parsed, mapped } = outcome;
    const hasNotices =
      mapped.report.issues.length > 0 ||
      parsed.duplicates.length > 0 ||
      parsed.preservedOuterBlocks.length > 0 ||
      parsed.ignoredTopLevelAssignments.length > 0;
    if (hasNotices) {
      setPending({ parsed, mapped });
      return;
    }
    commit(mapped.state);
  };

  return (
    <aside
      aria-label="Config preview"
      className="flex h-full max-h-[calc(100vh-6rem)] w-full flex-col overflow-hidden rounded-md border border-slate-200 bg-slate-900 text-slate-100 shadow-sm"
    >
      <PreviewActions
        content={config}
        isDownloadable={report.isDownloadable}
        blockedReason={blockedReason}
        editing={editing}
        onEnterEdit={onEnterEdit}
        onApply={onApply}
        onCancel={onCancel}
      />
      {editing ? (
        <CodeEditor ariaLabel="Edit config text" value={draft} onChange={setDraft} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          <GroovyHighlighter source={config} />
        </div>
      )}
      <div className="border-t border-slate-700/60 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-400">
        {sizeLabel}
      </div>

      {/* Portaled to <body> so the modal escapes this pane's sticky
          stacking context — otherwise the form-dim overlay (z-10 at the
          root level) would paint over a dialog trapped at z:auto here. */}
      {pending
        ? createPortal(
            <UploadDialog
              parsed={pending.parsed}
              report={pending.mapped.report}
              confirmReplace={false}
              source="edit"
              onCancel={() => setPending(null)}
              onConfirm={() => commit(pending.mapped.state)}
            />,
            document.body,
          )
        : null}

      {errorVariant
        ? createPortal(
            <UploadErrorDialog
              fileName="your edits"
              variant={errorVariant}
              onClose={() => setErrorVariant(null)}
            />,
            document.body,
          )
        : null}
    </aside>
  );
}
