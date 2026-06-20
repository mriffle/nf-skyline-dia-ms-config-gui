// Modal preview shown after a successful parse + map. Lays out the
// summary (loaded count, detected mode, carafe inference), a "you'll
// lose your changes" warning when the current form is touched, and a
// categorized list of issues. Cancel discards the parse; Load commits.

import { useEffect } from 'react';
import type { UploadReport, UploadIssue } from '../../parse/mapToState';
import type { SchemaShape } from '../../params/schemaTypes';
import type { ParseResult } from '../../parse/types';

interface UploadDialogProps {
  // Omitted for the in-place edit flow (source === 'edit'), where there
  // is no file — the config came from the editable preview buffer.
  readonly fileName?: string;
  readonly parsed: ParseResult;
  readonly report: UploadReport;
  readonly confirmReplace: boolean;
  // 'upload' (default): loading a file. 'edit': applying hand-edits made
  // in the preview pane. Only changes the dialog's title + confirm label.
  readonly source?: 'upload' | 'edit';
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function UploadDialog({
  fileName,
  parsed,
  report,
  confirmReplace,
  source = 'upload',
  onCancel,
  onConfirm,
}: UploadDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const discarded = report.issues.filter(isDiscardIssue);
  const preservedParams = report.issues.filter(isPreservedParamIssue);
  const advisory = report.issues.filter(
    (i) => !isDiscardIssue(i) && !isPreservedParamIssue(i),
  );
  const totalNotices =
    discarded.length +
    advisory.length +
    preservedParams.length +
    parsed.duplicates.length +
    parsed.preservedOuterBlocks.length +
    parsed.ignoredTopLevelAssignments.length;

  const modeLabel = report.detectedMode === 'pdc' ? 'PDC' : 'General';
  const carafeLabel = report.inferredCarafeEnabled
    ? `enabled (${report.inferredCarafeSource ?? 'no source set'})`
    : 'disabled';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-dialog-title"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-4 py-8"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
        <header className="border-b border-slate-200 px-5 py-4">
          <h2
            id="upload-dialog-title"
            className="text-base font-semibold text-slate-900"
          >
            {source === 'edit' ? (
              'Apply edited configuration?'
            ) : (
              <>
                Load configuration from{' '}
                <span className="font-mono text-[14px] text-slate-700">{fileName}</span>?
              </>
            )}
          </h2>
        </header>

        <div className="space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-slate-800">
              <strong>{report.loadedCount}</strong> parameter
              {report.loadedCount === 1 ? '' : 's'} ready to load.
            </p>
            <p className="mt-1 text-[13px] text-slate-600">
              Mode: <strong className="text-slate-800">{modeLabel}</strong>
              {report.modeAmbiguous ? (
                <span className="text-amber-700">
                  {' '}
                  (file mixes both — picked PDC)
                </span>
              ) : null}
              {' · '}
              Carafe: <strong className="text-slate-800">{carafeLabel}</strong>
            </p>
          </div>

          {confirmReplace ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
              <strong>Heads up:</strong> Loading will replace your current form
              values.
            </div>
          ) : null}

          {totalNotices === 0 ? (
            <p className="text-[13px] text-slate-600">
              No issues to review.
            </p>
          ) : (
            <div className="space-y-3">
              {discarded.length > 0 ? (
                <IssueGroup
                  tone="error"
                  title={`${discarded.length} discarded`}
                  description="These entries from the file will not be loaded."
                  items={discarded.map(formatIssue)}
                />
              ) : null}
              {advisory.length > 0 ? (
                <IssueGroup
                  tone="warning"
                  title={`${advisory.length} loaded with notes`}
                  description="These entries loaded but warrant a look."
                  items={advisory.map(formatIssue)}
                />
              ) : null}
              {parsed.duplicates.length > 0 ? (
                <IssueGroup
                  tone="warning"
                  title={`${parsed.duplicates.length} duplicate ${
                    parsed.duplicates.length === 1 ? 'path' : 'paths'
                  }`}
                  description="The last value in the file was kept."
                  items={parsed.duplicates.map(
                    (d) =>
                      `${d.path}: line ${d.firstLine} → line ${d.finalLine}`,
                  )}
                />
              ) : null}
              {preservedParams.length > 0 ? (
                <IssueGroup
                  tone="info"
                  title={`${preservedParams.length} hidden parameter${
                    preservedParams.length === 1 ? '' : 's'
                  } preserved`}
                  description="These params aren't surfaced in the form (typically infrastructure or pinned image versions), but will be loaded and re-emitted into the generated config."
                  items={preservedParams.map(formatIssue)}
                />
              ) : null}
              {parsed.preservedOuterBlocks.length > 0 ? (
                <IssueGroup
                  tone="info"
                  title={`${parsed.preservedOuterBlocks.length} item${
                    parsed.preservedOuterBlocks.length === 1 ? '' : 's'
                  } preserved verbatim`}
                  description="Blocks (process { }, profiles { }, ...) and includeConfig directives that live outside params { } are appended to the generated config unchanged."
                  items={parsed.preservedOuterBlocks.map(
                    (b) => `${b.name} (line ${b.line})`,
                  )}
                />
              ) : null}
              {parsed.ignoredTopLevelAssignments.length > 0 ? (
                <IssueGroup
                  tone="warning"
                  title={`${parsed.ignoredTopLevelAssignments.length} top-level assignment${
                    parsed.ignoredTopLevelAssignments.length === 1 ? '' : 's'
                  } ignored`}
                  description="Bare assignments outside any block are not loaded."
                  items={parsed.ignoredTopLevelAssignments.map(
                    (a) => `${a.name} (line ${a.line})`,
                  )}
                />
              ) : null}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className={[
              'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700',
              'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
            ].join(' ')}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              'rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-white',
              'hover:bg-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-300',
            ].join(' ')}
          >
            {source === 'edit' ? 'Apply' : 'Load'}
          </button>
        </footer>
      </div>
    </div>
  );
}

interface IssueGroupProps {
  readonly tone: 'error' | 'warning' | 'info';
  readonly title: string;
  readonly description: string;
  readonly items: readonly string[];
}

function IssueGroup({ tone, title, description, items }: IssueGroupProps) {
  const headerColor =
    tone === 'error' ? 'text-red-700' : tone === 'warning' ? 'text-amber-800' : 'text-sky-800';
  const bodyColor =
    tone === 'error' ? 'text-red-800' : tone === 'warning' ? 'text-amber-900' : 'text-sky-900';
  const border =
    tone === 'error' ? 'border-red-200' : tone === 'warning' ? 'border-amber-200' : 'border-sky-200';
  const bg =
    tone === 'error' ? 'bg-red-50/60' : tone === 'warning' ? 'bg-amber-50/60' : 'bg-sky-50/60';
  return (
    <details
      className={`rounded-md border ${border} ${bg} px-3 py-2`}
      open={items.length <= 5}
    >
      <summary className={`cursor-pointer text-[13px] font-semibold ${headerColor}`}>
        {title}
      </summary>
      <p className="mt-1 text-[12px] text-slate-600">{description}</p>
      <ul className={`mt-2 space-y-0.5 text-[12px] ${bodyColor}`}>
        {items.map((line, i) => (
          <li key={i} className="font-mono leading-snug">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}

function isDiscardIssue(issue: UploadIssue): boolean {
  switch (issue.kind) {
    case 'unknown-param':
    case 'ignored-param':
    case 'type-mismatch':
    case 'enum-mismatch':
      return true;
    case 'hidden-param-preserved':
    case 'range-violation':
    case 'string-coerced-to-list':
    case 'list-truncated-to-string':
    case 'mode-ambiguity':
    case 'carafe-source-mismatch':
      return false;
  }
}

function isPreservedParamIssue(issue: UploadIssue): boolean {
  return issue.kind === 'hidden-param-preserved';
}

function formatIssue(issue: UploadIssue): string {
  switch (issue.kind) {
    case 'unknown-param':
      return `${issue.path} — unknown parameter (not in schema; possibly removed, renamed, or typo'd)`;
    case 'hidden-param-preserved':
      return `${issue.path} — loaded verbatim (no UI control; value will re-emit)`;
    case 'ignored-param':
      return `${issue.path} — ignored (infrastructure or deprecated)`;
    case 'type-mismatch':
      return `${issue.path} — expected ${describeShape(issue.expected)}, got ${issue.gotType}`;
    case 'enum-mismatch':
      return `${issue.path} — not a valid value (allowed: ${issue.allowed.join(', ')})`;
    case 'range-violation': {
      const range =
        issue.min !== undefined && issue.max !== undefined
          ? `[${issue.min}, ${issue.max}]`
          : issue.min !== undefined
            ? `≥ ${issue.min}`
            : issue.max !== undefined
              ? `≤ ${issue.max}`
              : '';
      return `${issue.path} — value ${issue.value} outside range ${range} (loaded anyway)`;
    }
    case 'string-coerced-to-list':
      return `${issue.path} — wrapped a single string in a 1-element list`;
    case 'list-truncated-to-string':
      return `${issue.path} — kept first element ('${issue.kept}') of ${issue.original.length}-item list`;
    case 'mode-ambiguity':
      return `Both PDC inputs (${issue.pdcPaths.join(', ')}) and general inputs (${issue.generalPaths.join(', ')}) are present — picked PDC mode`;
    case 'carafe-source-mismatch':
      return `carafe.source = '${issue.sourceFromFile}' but data suggests '${issue.sourceInferred}'`;
  }
}

function describeShape(shape: SchemaShape): string {
  if (shape.kind === 'enum') return `one of ${shape.values.join(', ')}`;
  return shape.kind;
}
