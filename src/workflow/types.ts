// Types for the live workflow-graph visualization. Pure data structures —
// no React, no DOM. Built from FormState by computeWorkflowGraph; consumed
// by layout.ts and the SVG renderer.

export type NodeKind = 'input-file' | 'process' | 'output-file';

export type NodeStatus = 'active' | 'required-missing';

export interface GraphNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly sublabel?: string;
  readonly status: NodeStatus;
  readonly stage: number;
  readonly formPath?: string;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface WorkflowGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}
