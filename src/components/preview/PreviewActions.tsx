import { useState } from 'react';
import { downloadTextFile } from '../../lib/download';
import { copyToClipboard } from '../../lib/clipboard';

interface PreviewActionsProps {
  readonly content: string;
  readonly isDownloadable: boolean;
  readonly blockedReason?: string;
  // Edit-mode wiring. When `editing` is true the toolbar swaps Copy /
  // Download / Edit for Cancel / Apply, and the live preview is replaced
  // by an editable buffer (handled in PreviewPane).
  readonly editing: boolean;
  readonly onEnterEdit: () => void;
  readonly onApply: () => void;
  readonly onCancel: () => void;
}

export function PreviewActions({
  content,
  isDownloadable,
  blockedReason,
  editing,
  onEnterEdit,
  onApply,
  onCancel,
}: PreviewActionsProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const onDownload = (): void => {
    if (!isDownloadable) return;
    downloadTextFile(content, 'pipeline.config');
  };

  const onCopy = async (): Promise<void> => {
    if (!isDownloadable) return;
    const ok = await copyToClipboard(content);
    setCopyState(ok ? 'copied' : 'failed');
    window.setTimeout(() => setCopyState('idle'), 1800);
  };

  const disabledTitle = isDownloadable ? undefined : (blockedReason ?? 'Resolve validation errors to enable');

  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-700/60 bg-slate-900 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {editing ? 'editing config text…' : 'pipeline.config preview'}
      </div>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={onCancel}
              className={[
                'rounded-md border px-2.5 py-1 text-[12px] font-medium',
                'border-slate-700 bg-slate-800 text-slate-100',
                'hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-accent-400',
              ].join(' ')}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              className={[
                'rounded-md px-2.5 py-1 text-[12px] font-medium',
                'bg-accent-500 text-white',
                'hover:bg-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-300',
              ].join(' ')}
            >
              Apply
            </button>
          </>
        ) : (
          <>
            <span
              className={[
                'text-[11px] transition-opacity',
                copyState === 'copied' ? 'text-emerald-300 opacity-100' : '',
                copyState === 'failed' ? 'text-red-300 opacity-100' : '',
                copyState === 'idle' ? 'opacity-0' : '',
              ].join(' ')}
              aria-live="polite"
            >
              {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : ''}
            </span>
            <button
              type="button"
              onClick={onEnterEdit}
              className={[
                'rounded-md border px-2.5 py-1 text-[12px] font-medium',
                'border-slate-700 bg-slate-800 text-slate-100',
                'hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-accent-400',
              ].join(' ')}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onCopy}
              disabled={!isDownloadable}
              title={disabledTitle}
              className={[
                'rounded-md border px-2.5 py-1 text-[12px] font-medium',
                'border-slate-700 bg-slate-800 text-slate-100',
                'hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-accent-400',
                'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-800',
              ].join(' ')}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={!isDownloadable}
              title={disabledTitle}
              className={[
                'rounded-md px-2.5 py-1 text-[12px] font-medium',
                'bg-accent-500 text-white',
                'hover:bg-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-300',
                'disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400',
              ].join(' ')}
            >
              Download
            </button>
          </>
        )}
      </div>
    </div>
  );
}
