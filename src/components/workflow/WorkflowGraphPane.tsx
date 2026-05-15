import { useMemo } from 'react';
import { useStore } from '../../state/store';
import { computeWorkflowGraph } from '../../workflow/computeWorkflowGraph';
import { layoutGraph } from '../../workflow/layout';
import type { FormState } from '../../params/paramMetadata';
import { WorkflowGraphSvg } from './WorkflowGraphSvg';

export function WorkflowGraphPane() {
  const mode = useStore((s) => s.mode);
  const values = useStore((s) => s.values);
  const touched = useStore((s) => s.touched);
  const state: FormState = useMemo(() => ({ mode, values, touched }), [mode, values, touched]);
  const graph = useMemo(() => computeWorkflowGraph(state), [state]);
  const layout = useMemo(() => layoutGraph(graph), [graph]);

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
        <WorkflowGraphSvg layout={layout} edges={graph.edges} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        <LegendSwatch kind="process-active" label="active process" />
        <LegendSwatch kind="file-active" label="file (provided)" />
        <LegendSwatch kind="required" label="required, missing" />
        <LegendSwatch kind="optional" label="optional" />
        <LegendSwatch kind="inactive" label="inactive branch" />
      </div>
    </aside>
  );
}

function LegendSwatch({
  kind,
  label,
}: {
  readonly kind: 'process-active' | 'file-active' | 'required' | 'optional' | 'inactive';
  readonly label: string;
}) {
  const cls = {
    'process-active': 'bg-accent-500 border-accent-700',
    'file-active': 'bg-accent-50 border-accent-700',
    required: 'bg-white border-red-500 border-dashed',
    optional: 'bg-slate-50 border-slate-300 border-dotted',
    inactive: 'bg-slate-100 border-slate-300',
  }[kind];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-4 rounded-sm border ${cls}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
