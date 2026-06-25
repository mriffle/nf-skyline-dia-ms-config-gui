// The "Metadata" right-pane tab: a spreadsheet view of the loaded sample
// metadata table, with Download (re-emits the cleaned table in its original
// format) and Clear actions. Shows an empty-state prompt when nothing is
// loaded.

import { useLayoutEffect, useRef } from 'react';
import { useStore } from '../../state/store';
import { serializeMetadata } from '../../metadata/serializeMetadata';
import { downloadTextFile } from '../../lib/download';

export function MetadataPane() {
  const table = useStore((s) => s.metadata);
  const clearMetadata = useStore((s) => s.clearMetadata);
  const asideRef = useRef<HTMLElement>(null);

  // Size the pane to fill from its current top down to just above the
  // viewport bottom, so the spreadsheet's horizontal scrollbar (which sits
  // at the pane's bottom edge) is always visible. A fixed max-h calibrated
  // for the sticky position pushes the bottom below the fold while the page
  // is scrolled to the top, where the pane starts below the header.
  useLayoutEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    let raf = 0;
    const apply = (): void => {
      const top = el.getBoundingClientRect().top;
      el.style.maxHeight = `${Math.max(240, Math.floor(window.innerHeight - top - 16))}px`;
    };
    const schedule = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const onDownload = (): void => {
    if (!table) return;
    downloadTextFile(serializeMetadata(table), table.fileName);
  };

  const onClear = (): void => {
    const ok = window.confirm('Clear the loaded sample metadata?');
    if (ok) clearMetadata();
  };

  return (
    <aside
      ref={asideRef}
      aria-label="Sample metadata"
      className="flex max-h-[calc(100vh-6rem)] w-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Sample metadata</h2>
          {table ? (
            <span className="text-[11px] text-slate-500">
              {table.rows.length} sample{table.rows.length === 1 ? '' : 's'} ·{' '}
              {table.columns.length} field{table.columns.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        {table ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDownload}
              className={[
                'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[13px] font-medium text-slate-700',
                'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
              ].join(' ')}
            >
              Download
            </button>
            <button
              type="button"
              onClick={onClear}
              className={[
                'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[13px] font-medium text-slate-700',
                'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500',
              ].join(' ')}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {table ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-max border-collapse text-left text-[13px]">
            <thead>
              <tr>
                {table.columns.map((col, idx) =>
                  idx === 0 ? (
                    <th
                      key={col}
                      scope="col"
                      className="sticky left-0 top-0 z-20 whitespace-nowrap border-b border-r border-slate-200 bg-slate-100 px-3 py-2 font-semibold text-slate-700"
                    >
                      {col}
                    </th>
                  ) : (
                    <th
                      key={col}
                      scope="col"
                      className="sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2 font-semibold text-slate-700"
                    >
                      {col}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className={i % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                  {table.columns.map((col, idx) =>
                    idx === 0 ? (
                      <th
                        key={col}
                        scope="row"
                        className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-slate-200 bg-inherit px-3 py-1.5 text-left font-medium text-slate-800"
                      >
                        {row[col]}
                      </th>
                    ) : (
                      <td
                        key={col}
                        className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-slate-700"
                      >
                        {row[col]}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No metadata loaded</p>
          <p className="max-w-sm text-[13px] text-slate-500">
            Use <span className="font-medium">Load metadata…</span> in the header to
            upload a CSV or TSV with one column per metadata field and one row per
            sample. The first column must be named{' '}
            <span className="font-mono">Replicate</span>. Loaded metadata drives the
            QC / batch report pickers and is validated against your selections.
          </p>
        </div>
      )}
    </aside>
  );
}
