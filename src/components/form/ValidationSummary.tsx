// Banner at the top of the form pane summarising validation issues.
// Renders nothing when there are no errors and no cross-field issues.

import { useValidation } from '../../hooks/useValidation';
import { paramMetadataByPath } from '../../params/paramMetadata';

interface Issue {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly targetPath: string | null;
}

function scrollToField(path: string): void {
  const el = document.getElementById(`field-${path}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function labelFor(path: string): string {
  return paramMetadataByPath[path]?.label ?? path;
}

export function ValidationSummary() {
  const report = useValidation();
  const fieldErrorPaths = Object.keys(report.fieldErrors).filter(
    (p) => report.fieldErrors[p] !== undefined,
  );
  if (fieldErrorPaths.length === 0 && report.crossFieldIssues.length === 0) {
    return null;
  }

  const items: Issue[] = [];
  for (const path of fieldErrorPaths) {
    const msg = report.fieldErrors[path];
    if (!msg) continue;
    items.push({
      severity: 'error',
      message: `${labelFor(path)}: ${msg}`,
      targetPath: path,
    });
  }
  for (const cf of report.crossFieldIssues) {
    items.push({
      severity: cf.severity,
      message: cf.message,
      targetPath: cf.fields[0] ?? null,
    });
  }
  items.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'error' ? -1 : 1;
  });

  const errorCount = items.filter((i) => i.severity === 'error').length;
  const warningCount = items.length - errorCount;

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-6 border-y border-slate-200 bg-white px-4 py-3 shadow-sm sm:mx-0 sm:rounded-md sm:border">
      <p className="text-sm font-semibold text-slate-800">
        {errorCount > 0 ? (
          <span className="text-red-700">
            {errorCount} {errorCount === 1 ? 'error' : 'errors'}
          </span>
        ) : null}
        {errorCount > 0 && warningCount > 0 ? (
          <span className="text-slate-400"> &middot; </span>
        ) : null}
        {warningCount > 0 ? (
          <span className="text-amber-700">
            {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
          </span>
        ) : null}
      </p>
      <ul className="mt-2 space-y-1">
        {items.map((iss, i) => {
          const colorClass =
            iss.severity === 'error'
              ? 'text-red-700 hover:bg-red-50'
              : 'text-amber-800 hover:bg-amber-50';
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  if (iss.targetPath) scrollToField(iss.targetPath);
                }}
                className={[
                  'w-full rounded px-1.5 py-0.5 text-left text-[13px]',
                  'focus:outline-none focus:ring-2 focus:ring-accent-500',
                  colorClass,
                ].join(' ')}
              >
                <span aria-hidden="true" className="mr-1.5 font-bold">
                  {iss.severity === 'error' ? '!' : '⚠'}
                </span>
                <span className="sr-only">
                  {iss.severity === 'error' ? 'Error: ' : 'Warning: '}
                </span>
                {iss.message}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
