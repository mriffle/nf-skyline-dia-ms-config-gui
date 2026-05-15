import { memo } from 'react';
import type { LayoutResult, PositionedNode } from '../../workflow/layout';
import { NODE_HEIGHT, NODE_WIDTH } from '../../workflow/layout';
import type { GraphEdge, NodeStatus } from '../../workflow/types';

interface Props {
  readonly layout: LayoutResult;
  readonly edges: readonly GraphEdge[];
}

interface NodeStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeDasharray?: string;
  readonly textColor: string;
  readonly subTextColor: string;
}

const PROCESS_STYLES: Record<NodeStatus, NodeStyle> = {
  active: {
    fill: '#475fa6',          // accent.500
    stroke: '#2f3f6e',        // accent.700
    textColor: '#ffffff',
    subTextColor: '#d8def0',  // accent.100
  },
  inactive: {
    fill: '#f1f5f9',          // slate.100
    stroke: '#cbd5e1',        // slate.300
    textColor: '#64748b',     // slate.500
    subTextColor: '#94a3b8',  // slate.400
  },
  'required-missing': {
    fill: '#ffffff',
    stroke: '#ef4444',        // red.500
    strokeDasharray: '4 3',
    textColor: '#dc2626',     // red.600
    subTextColor: '#f87171',  // red.400
  },
  'optional-missing': {
    fill: '#f8fafc',          // slate.50
    stroke: '#cbd5e1',        // slate.300
    strokeDasharray: '2 3',
    textColor: '#94a3b8',
    subTextColor: '#cbd5e1',
  },
};

const FILE_STYLES: Record<NodeStatus, NodeStyle> = {
  active: {
    fill: '#eef1f9',          // accent.50
    stroke: '#2f3f6e',        // accent.700
    textColor: '#1f2a4a',
    subTextColor: '#475fa6',
  },
  inactive: {
    fill: '#f1f5f9',
    stroke: '#cbd5e1',
    textColor: '#64748b',     // slate.500
    subTextColor: '#94a3b8',  // slate.400
  },
  'required-missing': {
    fill: '#ffffff',
    stroke: '#ef4444',
    strokeDasharray: '4 3',
    textColor: '#dc2626',
    subTextColor: '#f87171',
  },
  'optional-missing': {
    fill: '#f8fafc',
    stroke: '#cbd5e1',
    strokeDasharray: '2 3',
    textColor: '#94a3b8',
    subTextColor: '#cbd5e1',
  },
};

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

function WorkflowNodeShape({ node }: { node: PositionedNode }) {
  const style = styleFor(node);
  const isProcess = node.kind === 'process';
  const labelIsQuestion = node.label === '?';

  return (
    <g>
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
          strokeDasharray={style.strokeDasharray}
        />
      ) : (
        <path
          d={fileShapePath(node.x, node.y)}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={1.5}
          strokeDasharray={style.strokeDasharray}
          strokeLinejoin="round"
        />
      )}
      {labelIsQuestion ? (
        <text
          x={node.x}
          y={node.y + 8}
          textAnchor="middle"
          fontSize={28}
          fontWeight={700}
          fill={style.textColor}
        >
          ?
        </text>
      ) : (
        <>
          <text
            x={node.x}
            y={node.sublabel ? node.y - 2 : node.y + 4}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill={style.textColor}
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
        </>
      )}
    </g>
  );
}

interface EdgeProps {
  readonly from: PositionedNode;
  readonly to: PositionedNode;
}

function WorkflowEdgePath({ from, to }: EdgeProps) {
  const inactive = from.status !== 'active' || to.status !== 'active';
  const stroke = inactive ? '#cbd5e1' : '#94a3b8'; // slate.300 vs slate.400
  const marker = inactive ? 'url(#wf-arrow-inactive)' : 'url(#wf-arrow-active)';

  const x1 = from.x;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y - NODE_HEIGHT / 2 - 2; // small gap before arrowhead
  const dy = y2 - y1;
  const cx1 = x1;
  const cy1 = y1 + dy / 2;
  const cx2 = x2;
  const cy2 = y2 - dy / 2;
  const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={1.25}
      markerEnd={marker}
    />
  );
}

function WorkflowGraphSvgImpl({ layout, edges }: Props) {
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
          id="wf-arrow-active"
          viewBox="0 0 8 8"
          refX={7}
          refY={4}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#94a3b8" />
        </marker>
        <marker
          id="wf-arrow-inactive"
          viewBox="0 0 8 8"
          refX={7}
          refY={4}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#cbd5e1" />
        </marker>
      </defs>
      <g>
        {edges.map((e, i) => {
          const from = nodeById.get(e.from);
          const to = nodeById.get(e.to);
          if (!from || !to) return null;
          return <WorkflowEdgePath key={i} from={from} to={to} />;
        })}
      </g>
      <g>
        {layout.nodes.map((n) => (
          <WorkflowNodeShape key={n.id} node={n} />
        ))}
      </g>
    </svg>
  );
}

export const WorkflowGraphSvg = memo(WorkflowGraphSvgImpl);
