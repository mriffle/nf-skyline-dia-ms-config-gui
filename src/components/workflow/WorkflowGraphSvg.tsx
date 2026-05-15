import { memo } from 'react';
import type { KeyboardEvent } from 'react';
import type { LayoutResult, PositionedNode } from '../../workflow/layout';
import { NODE_HEIGHT, NODE_WIDTH } from '../../workflow/layout';
import type { GraphEdge, NodeStatus } from '../../workflow/types';

interface Props {
  readonly layout: LayoutResult;
  readonly edges: readonly GraphEdge[];
  readonly onNodeClick?: (formPath: string) => void;
}

interface NodeStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly textColor: string;
  readonly subTextColor: string;
}

// Required-missing nodes use the same chrome as their filled counterparts; the
// only visual cue is the "?" placeholder rendered in red where the filename
// would normally be. Drops the prior dashed-red border + giant "?" treatment.
const PROCESS_STYLES: Record<NodeStatus, NodeStyle> = {
  active: {
    fill: '#475fa6',          // accent.500
    stroke: '#2f3f6e',        // accent.700
    textColor: '#ffffff',
    subTextColor: '#d8def0',  // accent.100
  },
  'required-missing': {
    fill: '#475fa6',
    stroke: '#2f3f6e',
    textColor: '#ffffff',
    subTextColor: '#d8def0',
  },
};

const FILE_STYLES: Record<NodeStatus, NodeStyle> = {
  active: {
    fill: '#eef1f9',          // accent.50
    stroke: '#2f3f6e',        // accent.700
    textColor: '#1f2a4a',
    subTextColor: '#475fa6',
  },
  'required-missing': {
    fill: '#eef1f9',
    stroke: '#2f3f6e',
    textColor: '#1f2a4a',
    subTextColor: '#475fa6',
  },
};

const MISSING_LABEL_COLOR = '#dc2626'; // red.600 — only the "?" itself is red

function styleFor(node: PositionedNode): NodeStyle {
  const isProcess = node.kind === 'process';
  return (isProcess ? PROCESS_STYLES : FILE_STYLES)[node.status];
}

// File-shape with a small dog-ear corner at the top-right.
function fileShapePath(cx: number, cy: number): string {
  const x = cx - NODE_WIDTH / 2;
  const y = cy - NODE_HEIGHT / 2;
  const w = NODE_WIDTH;
  const h = NODE_HEIGHT;
  const dog = 13; // dog-ear size
  // Polygon: TL → top before dog-ear → dog-ear diagonal → right side → BR → BL → close
  return [
    `M ${x} ${y}`,
    `L ${x + w - dog} ${y}`,
    `L ${x + w} ${y + dog}`,
    `L ${x + w} ${y + h}`,
    `L ${x} ${y + h}`,
    'Z',
  ].join(' ');
}

function WorkflowNodeShape({
  node,
  onClick,
}: {
  node: PositionedNode;
  onClick?: (formPath: string) => void;
}) {
  const style = styleFor(node);
  const isProcess = node.kind === 'process';
  const isMissing = node.status === 'required-missing';
  const labelColor = isMissing ? MISSING_LABEL_COLOR : style.textColor;
  const clickable = !!(onClick && node.formPath);
  const handleClick = clickable
    ? () => onClick!(node.formPath!)
    : undefined;
  const handleKey = clickable
    ? (e: KeyboardEvent<SVGGElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick!(node.formPath!);
        }
      }
    : undefined;

  return (
    <g
      onClick={handleClick}
      onKeyDown={handleKey}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={
        clickable
          ? `${node.sublabel ?? node.label}: jump to form field`
          : undefined
      }
      style={clickable ? { cursor: 'pointer' } : undefined}
      className={clickable ? 'wf-clickable' : undefined}
    >
      {isProcess ? (
        <rect
          x={node.x - NODE_WIDTH / 2}
          y={node.y - NODE_HEIGHT / 2}
          width={NODE_WIDTH}
          height={NODE_HEIGHT}
          rx={6}
          ry={6}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={1.5}
        />
      ) : (
        <path
          d={fileShapePath(node.x, node.y)}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      <text
        x={node.x}
        y={node.sublabel ? node.y - 2 : node.y + 4}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill={labelColor}
      >
        {node.label}
      </text>
      {node.sublabel ? (
        <text
          x={node.x}
          y={node.y + 14}
          textAnchor="middle"
          fontSize={10}
          fill={style.subTextColor}
        >
          {node.sublabel}
        </text>
      ) : null}
    </g>
  );
}

interface EdgeProps {
  readonly from: PositionedNode;
  readonly to: PositionedNode;
  readonly layoutNodes: readonly PositionedNode[];
}

// A short cubic bezier — works well when source and target are within a few
// rows of each other and there are no obstacles in between.
function buildShortPath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1;
  const cx1 = x1;
  const cy1 = y1 + dy / 2;
  const cx2 = x2;
  const cy2 = y2 - dy / 2;
  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
}

// Find the horizontal envelope of every node living in a row strictly between
// fromRow and toRow. These nodes are "in the way" if a straight bezier between
// the endpoints would cross the central column.
function obstacleEnvelope(
  layoutNodes: readonly PositionedNode[],
  fromRow: number,
  toRow: number,
): { left: number; right: number } | null {
  const minRow = Math.min(fromRow, toRow);
  const maxRow = Math.max(fromRow, toRow);
  let left = Infinity;
  let right = -Infinity;
  for (const n of layoutNodes) {
    if (n.row > minRow && n.row < maxRow) {
      if (n.x - NODE_WIDTH / 2 < left) left = n.x - NODE_WIDTH / 2;
      if (n.x + NODE_WIDTH / 2 > right) right = n.x + NODE_WIDTH / 2;
    }
  }
  if (left === Infinity) return null;
  return { left, right };
}

// Build a cubic bezier whose control points are placed so the curve's apex
// clears the intermediate-node envelope by a fixed visual margin. Picks the
// side with shorter travel, then back-solves the control-point x from the
// desired apex x — because for cubic beziers with both control points at the
// same x, the midpoint sits only ~75% of the way out toward that x.
function buildBowedPath(
  from: PositionedNode,
  to: PositionedNode,
  layoutNodes: readonly PositionedNode[],
): string {
  const x1 = from.x;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y - NODE_HEIGHT / 2 - 2;

  const env = obstacleEnvelope(layoutNodes, from.row, to.row);
  if (!env) return buildShortPath(x1, y1, x2, y2);

  const APEX_CLEARANCE = 24; // gap between the curve's apex and the obstacle
  // If a straight bezier would already clear the obstacle (both endpoints sit
  // comfortably to the same side), don't bother bowing.
  if ((x1 <= env.left - APEX_CLEARANCE && x2 <= env.left - APEX_CLEARANCE) ||
      (x1 >= env.right + APEX_CLEARANCE && x2 >= env.right + APEX_CLEARANCE)) {
    return buildShortPath(x1, y1, x2, y2);
  }

  // Pick whichever side keeps the apex closer to the endpoints overall.
  const apexLeft = env.left - APEX_CLEARANCE;
  const apexRight = env.right + APEX_CLEARANCE;
  const leftTravel = Math.abs(x1 - apexLeft) + Math.abs(x2 - apexLeft);
  const rightTravel = Math.abs(x1 - apexRight) + Math.abs(x2 - apexRight);
  const apexX = leftTravel <= rightTravel ? apexLeft : apexRight;

  // For a cubic bezier with both control points at (cpX, _), the midpoint x
  // is (x1 + 6*cpX + x2) / 8. Solve for cpX given desired midpoint apexX.
  const cpX = (8 * apexX - x1 - x2) / 6;

  const dy = y2 - y1;
  const cy1 = y1 + dy * 0.3;
  const cy2 = y2 - dy * 0.3;
  return `M ${x1} ${y1} C ${cpX} ${cy1}, ${cpX} ${cy2}, ${x2} ${y2}`;
}

function WorkflowEdgePath({ from, to, layoutNodes }: EdgeProps) {
  const x1 = from.x;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y - NODE_HEIGHT / 2 - 2;
  const rowSpan = Math.abs(to.row - from.row);

  // Adjacent rows: empty gap between, no obstacles possible.
  const d =
    rowSpan <= 1
      ? buildShortPath(x1, y1, x2, y2)
      : buildBowedPath(from, to, layoutNodes);

  return (
    <path
      d={d}
      fill="none"
      stroke="#94a3b8"
      strokeWidth={1.25}
      markerEnd="url(#wf-arrow)"
    />
  );
}

function WorkflowGraphSvgImpl({ layout, edges, onNodeClick }: Props) {
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

  return (
    <svg
      role="img"
      aria-label="Workflow graph"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMin meet"
      className="block w-full"
      style={{ minHeight: layout.height }}
    >
      <defs>
        <marker
          id="wf-arrow"
          viewBox="0 0 8 8"
          refX={7}
          refY={4}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#94a3b8" />
        </marker>
      </defs>
      <g>
        {edges.map((e, i) => {
          const from = nodeById.get(e.from);
          const to = nodeById.get(e.to);
          if (!from || !to) return null;
          return (
            <WorkflowEdgePath
              key={i}
              from={from}
              to={to}
              layoutNodes={layout.nodes}
            />
          );
        })}
      </g>
      <g>
        {layout.nodes.map((n) => (
          <WorkflowNodeShape key={n.id} node={n} onClick={onNodeClick} />
        ))}
      </g>
    </svg>
  );
}

export const WorkflowGraphSvg = memo(WorkflowGraphSvgImpl);
