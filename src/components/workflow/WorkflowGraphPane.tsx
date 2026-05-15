import { useCallback, useMemo } from 'react';
import { useStore } from '../../state/store';
import { computeWorkflowGraph } from '../../workflow/computeWorkflowGraph';
import { layoutGraph } from '../../workflow/layout';
import type { FormState } from '../../params/paramMetadata';
import { WorkflowGraphSvg } from './WorkflowGraphSvg';

function focusFormField(formPath: string): void {
  const el = document.getElementById(`field-${formPath}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Briefly highlight, then focus the first focusable input within.
  el.classList.add('wf-field-flash');
  window.setTimeout(() => el.classList.remove('wf-field-flash'), 1200);
  const focusable = el.querySelector<HTMLElement>(
    'input:not([type="hidden"]), select, textarea, button',
  );
  if (focusable) focusable.focus({ preventScroll: true });
}

export function WorkflowGraphPane() {
  const mode = useStore((s) => s.mode);
  const values = useStore((s) => s.values);
  const touched = useStore((s) => s.touched);
  const state: FormState = useMemo(() => ({ mode, values, touched }), [mode, values, touched]);
  const graph = useMemo(() => computeWorkflowGraph(state), [state]);
  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const handleNodeClick = useCallback((formPath: string) => {
    focusFormField(formPath);
  }, []);

  return (
    <aside
      aria-label="Workflow graph"
      className="flex max-h-[calc(100vh-6rem)] w-full flex-col overflow-auto rounded-md border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Workflow graph</h2>
          <span className="text-[11px] text-slate-500">
            {graph.nodes.length} nodes · {graph.edges.length} edges
          </span>
        </div>
      </div>
      <div className="px-3 py-3">
        <WorkflowGraphSvg layout={layout} edges={graph.edges} onNodeClick={handleNodeClick} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        <LegendSwatch kind="process" label="process" />
        <LegendSwatch kind="file" label="file" />
        <span className="inline-flex items-center gap-1.5">
          <span className="font-bold text-red-600" aria-hidden="true">?</span>
          <span>missing required input</span>
        </span>
      </div>
    </aside>
  );
}

function LegendSwatch({
  kind,
  label,
}: {
  readonly kind: 'process' | 'file';
  readonly label: string;
}) {
  const cls = {
    process: 'bg-accent-500 border-accent-700',
    file: 'bg-accent-50 border-accent-700',
  }[kind];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-4 rounded-sm border ${cls}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
