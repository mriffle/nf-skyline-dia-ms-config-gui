// Stage-banded layout. Nodes within a stage are spaced left-to-right; each
// stage occupies a vertical row. Returns absolute (x, y) for the center of
// each node plus the SVG viewBox.

import type { GraphNode, WorkflowGraph } from './types';

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 56;
export const HORIZONTAL_GAP = 24;
export const VERTICAL_GAP = 44;
export const PADDING = 24;

export interface PositionedNode extends GraphNode {
  readonly x: number; // center x
  readonly y: number; // center y
}

export interface LayoutResult {
  readonly nodes: readonly PositionedNode[];
  readonly width: number;
  readonly height: number;
}

interface NodeByStage {
  readonly stage: number;
  readonly nodes: readonly GraphNode[];
}

function groupByStage(nodes: readonly GraphNode[]): readonly NodeByStage[] {
  const map = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const arr = map.get(n.stage);
    if (arr) arr.push(n);
    else map.set(n.stage, [n]);
  }
  const stages = [...map.keys()].sort((a, b) => a - b);
  return stages.map((stage) => ({
    stage,
    nodes: map.get(stage)!,
  }));
}

function rowWidth(count: number): number {
  if (count === 0) return 0;
  return count * NODE_WIDTH + (count - 1) * HORIZONTAL_GAP;
}

export function layoutGraph(graph: WorkflowGraph): LayoutResult {
  const grouped = groupByStage(graph.nodes);
  const widest = grouped.reduce((m, g) => Math.max(m, rowWidth(g.nodes.length)), 0);
  const totalWidth = widest + PADDING * 2;

  // Re-index stages to a contiguous sequence so we don't get gaps if some
  // stage numbers are unused.
  const stageRows = grouped.map((g, i) => ({ row: i, nodes: g.nodes }));
  const totalHeight =
    stageRows.length === 0
      ? PADDING * 2
      : stageRows.length * NODE_HEIGHT +
        (stageRows.length - 1) * VERTICAL_GAP +
        PADDING * 2;

  const positioned: PositionedNode[] = [];
  for (const { row, nodes } of stageRows) {
    const w = rowWidth(nodes.length);
    const startX = PADDING + (widest - w) / 2;
    const y = PADDING + NODE_HEIGHT / 2 + row * (NODE_HEIGHT + VERTICAL_GAP);
    nodes.forEach((n, i) => {
      const x = startX + NODE_WIDTH / 2 + i * (NODE_WIDTH + HORIZONTAL_GAP);
      positioned.push({ ...n, x, y });
    });
  }

  return { nodes: positioned, width: totalWidth, height: totalHeight };
}
