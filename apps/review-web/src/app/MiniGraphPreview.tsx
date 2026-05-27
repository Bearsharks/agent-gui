import type { GraphPlanDocument, GraphPlanEdge, GraphPlanGraph } from "@agent-gui/plan-schema";
import { useId } from "react";

type PreviewNode = {
  id: string;
  title: string;
  x: number;
  y: number;
};

const NODE_WIDTH = 92;
const NODE_HEIGHT = 34;
const COLUMN_GAP = 34;
const ROW_GAP = 18;
const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 150;

export function MiniGraphPreview({ document }: { document: GraphPlanDocument }) {
  const arrowId = `mini-graph-arrow-${useId().replace(/:/g, "")}`;
  const graph = document.graphs.find((candidate) => candidate.id === document.rootGraphId) ?? document.graphs[0];
  if (!graph || graph.nodes.length === 0) {
    return <div className="mini-graph-empty">그래프 없음</div>;
  }

  const nodes = layoutNodes(graph);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges.filter((edge) => nodeById.has(edge.from) && nodeById.has(edge.to));

  return (
    <svg className="mini-graph-preview" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} role="img" aria-label={`${graph.title} graph preview`}>
      <defs>
        <marker id={arrowId} markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
          <path d="M0,0 L6,3 L0,6 Z" />
        </marker>
      </defs>
      <rect className="mini-graph-background" x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} rx="6" />
      {edges.map((edge) => (
        <MiniEdge arrowId={arrowId} edge={edge} key={edge.id} nodeById={nodeById} />
      ))}
      {nodes.map((node) => (
        <g className="mini-graph-node" key={node.id} transform={`translate(${node.x} ${node.y})`}>
          <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="5" />
          <text x="8" y="21">
            {truncate(node.title, 15)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MiniEdge({ arrowId, edge, nodeById }: { arrowId: string; edge: GraphPlanEdge; nodeById: Map<string, PreviewNode> }) {
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);
  if (!from || !to) return null;

  const startX = from.x + NODE_WIDTH;
  const startY = from.y + NODE_HEIGHT / 2;
  const endX = to.x;
  const endY = to.y + NODE_HEIGHT / 2;
  const midX = startX + Math.max(14, (endX - startX) / 2);

  return <path className={`mini-graph-edge ${edge.kind}`} d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`} markerEnd={`url(#${arrowId})`} />;
}

function layoutNodes(graph: GraphPlanGraph): PreviewNode[] {
  const visibleNodes = graph.nodes.slice(0, 6);
  const columns = Math.min(3, Math.max(1, visibleNodes.length));
  const rows = Math.ceil(visibleNodes.length / columns);
  const totalWidth = columns * NODE_WIDTH + (columns - 1) * COLUMN_GAP;
  const totalHeight = rows * NODE_HEIGHT + (rows - 1) * ROW_GAP;
  const left = Math.max(12, (CANVAS_WIDTH - totalWidth) / 2);
  const top = Math.max(12, (CANVAS_HEIGHT - totalHeight) / 2);

  return visibleNodes.map((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: node.id,
      title: node.title,
      x: left + column * (NODE_WIDTH + COLUMN_GAP),
      y: top + row * (NODE_HEIGHT + ROW_GAP),
    };
  });
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
