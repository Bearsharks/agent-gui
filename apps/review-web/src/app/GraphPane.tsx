import type { GraphPlanDocument, GraphPlanEdge, GraphPlanGraph, GraphPlanNode, GraphPlanTarget } from "@agent-gui/plan-schema";
import { Button } from "@agent-gui/design-system";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler,
} from "@xyflow/react";
import { useMemo, type MouseEvent, type ReactNode } from "react";
import { conditionLabel, edgeKey, getChildGraphIds, nodeKey, targetKey, type GraphIndex, type GraphSelection } from "./graphReviewModel";
import { MarkdownView } from "./MarkdownView";

type ReviewFlowNode = FlowNode<{ label: ReactNode; target: GraphSelection }, "default">;
type ReviewFlowEdge = FlowEdge<{ edge?: GraphPlanEdge; graphId?: string }>;

const NODE_WIDTH = 220;
const NODE_HEIGHT = 116;
const COLUMN_GAP = 150;
const ROW_GAP = 42;
const GRAPH_LANE_GAP = 120;

export function GraphPane({
  document,
  index,
  selection,
  onSelect,
  onNodeSelect,
}: {
  document: GraphPlanDocument;
  index: GraphIndex;
  selection: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
  onNodeSelect: (selection: GraphSelection) => void;
}) {
  const { nodes, edges } = useGraphFlowModel(document, index, selection);
  const handleNodeClick: NodeMouseHandler<ReviewFlowNode> = (_event, node) => onNodeSelect(node.data.target);

  return (
    <aside className="graph-pane">
      <div className="graph-canvas" aria-label={`${document.title} graph`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.24 }}
          minZoom={0.25}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={handleNodeClick}
          onEdgeClick={(_event, edge) => {
            if (edge.data?.edge && edge.data.graphId) onSelect({ graphId: edge.data.graphId, edgeId: edge.data.edge.id });
          }}
        >
          <Background color="#d8cfc0" gap={24} />
          <MiniMap pannable zoomable nodeStrokeWidth={3} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </aside>
  );
}

export function SelectedNodeDetail({
  graph,
  node,
  selection,
  index,
  onSelect,
  onClose,
  onResizeStart,
}: {
  graph: GraphPlanGraph;
  node: GraphPlanNode;
  selection: GraphSelection;
  index: GraphIndex;
  onSelect: (selection: GraphSelection) => void;
  onClose: () => void;
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const iframes = node.iframes ?? [];
  const activeIframe = iframes.find((iframe) => iframe.id === selection.iframeId) ?? iframes[0];
  const childGraphIds = getChildGraphIds(node);

  return (
    <aside className="selected-node-overlay">
      <div className="selected-node-resize-handle" onMouseDown={onResizeStart} aria-hidden="true" />
      <header className="selected-node-overlay-header">
        <div>
          <span>{graph.title}</span>
          <strong>{node.title}</strong>
        </div>
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      </header>
      <div className="selected-node-primary-detail">
        <section className="selected-node-markdown-card">
          {node.markdownDesc ? <MarkdownView markdown={node.markdownDesc} /> : <p className="muted">본문 없음</p>}
          {childGraphIds.length > 0 ? <span>연결된 하위 그래프: {childGraphIds.join(", ")}</span> : null}
        </section>
        {iframes.length > 0 ? (
          <section className="selected-node-iframe-panel" aria-label={`${node.title} iframe preview`}>
            <div className="iframe-tab-list" role="tablist">
              {iframes.map((iframe) => (
                <button
                  className={activeIframe?.id === iframe.id ? "selected" : ""}
                  key={iframe.id}
                  onClick={() => onSelect({ graphId: graph.id, nodeId: node.id, iframeId: iframe.id })}
                  type="button"
                >
                  {iframe.description}
                </button>
              ))}
            </div>
            {activeIframe ? (
              <iframe
                className="selected-node-iframe-preview"
                src={activeIframe.url}
                title={activeIframe.description}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : null}
          </section>
        ) : (
          <section className="selected-node-empty-detail">
            <strong>iframe 없음</strong>
            <span>이 노드에는 연결된 sandbox iframe preview가 없습니다.</span>
          </section>
        )}
      </div>
    </aside>
  );
}

function useGraphFlowModel(document: GraphPlanDocument, index: GraphIndex, selection: GraphSelection) {
  return useMemo(() => {
    const graphLayouts = layoutGraphs(document);
    return {
      nodes: buildFlowNodes(document, index, selection, graphLayouts),
      edges: buildFlowEdges(document, index, selection),
    };
  }, [document, index, selection]);
}

function buildFlowNodes(
  document: GraphPlanDocument,
  index: GraphIndex,
  selection: GraphSelection,
  graphLayouts: Map<string, GraphLayout>,
): ReviewFlowNode[] {
  return orderedGraphs(document).flatMap((graph) => {
    const layout = graphLayouts.get(graph.id);
    return graph.nodes.map((node, nodeIndex) => {
      const selected = selection.graphId === graph.id && selection.nodeId === node.id;
      const issueCount = issueCountForTarget(index, { type: "node", graphId: graph.id, nodeId: node.id });
      const childGraphCount = node.subGraphs?.length ?? 0;
      const iframeCount = node.iframes?.length ?? 0;
      const position = layout?.nodePositions.get(node.id) ?? { x: nodeIndex * (NODE_WIDTH + COLUMN_GAP), y: 0 };
      return {
        id: flowNodeId(graph.id, node.id),
        type: "default",
        position,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        className: `review-flow-node ${selected ? "selected" : ""} ${childGraphCount > 0 ? "drillable" : ""}`,
        data: {
          target: { graphId: graph.id, nodeId: node.id },
          label: (
            <div className="review-flow-node-body">
              <span className="node-kind">{graph.title}</span>
              <strong>{node.title}</strong>
              {node.markdownDesc ? <span className="node-summary">{markdownSummary(node.markdownDesc)}</span> : null}
              <span className="node-meta">
                {iframeCount > 0 ? <span>iframe {iframeCount}</span> : null}
                {childGraphCount > 0 ? <span>하위 그래프</span> : null}
                {issueCount > 0 ? <span className="issue-chip">{issueCount}</span> : null}
              </span>
            </div>
          ),
        },
      } satisfies ReviewFlowNode;
    });
  });
}

function buildFlowEdges(document: GraphPlanDocument, index: GraphIndex, selection: GraphSelection): ReviewFlowEdge[] {
  const graphEdges = document.graphs.flatMap((graph) =>
    graph.edges.map((edge) => ({
      id: edge.id,
      source: flowNodeId(graph.id, edge.from),
      target: flowNodeId(graph.id, edge.to),
      label: edge.kind === "sequence" && !edge.label && !edge.condition ? undefined : conditionLabel(edge),
      type: "smoothstep",
      animated: edge.kind === "conditional" || edge.kind === "loop" || selection.edgeId === edge.id,
      className: selection.edgeId === edge.id ? "review-flow-edge selected" : "review-flow-edge",
      markerEnd: { type: MarkerType.ArrowClosed },
      labelShowBg: true,
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 4,
      data: { edge, graphId: graph.id },
    })),
  );
  const subgraphEdges = document.graphs.flatMap((graph) =>
    graph.nodes.flatMap((node) =>
      (node.subGraphs ?? []).flatMap((childGraphId) => {
        const childGraph = index.graphsById.get(childGraphId);
        const firstChildNode = childGraph?.nodes[0];
        if (!firstChildNode) return [];
        return {
          id: `subgraph:${graph.id}:${node.id}:${childGraphId}`,
          source: flowNodeId(graph.id, node.id),
          target: flowNodeId(childGraphId, firstChildNode.id),
          label: "하위 그래프",
          type: "smoothstep",
          animated: false,
          className: "review-flow-edge child-graph-edge",
          markerEnd: { type: MarkerType.ArrowClosed },
          labelShowBg: true,
          labelBgPadding: [5, 3] as [number, number],
          labelBgBorderRadius: 4,
          data: { graphId: childGraphId },
        } satisfies ReviewFlowEdge;
      }),
    ),
  );
  return [...graphEdges, ...subgraphEdges];
}

function issueCountForTarget(index: GraphIndex, target: GraphPlanTarget): number {
  return index.issuesByTargetKey.get(targetKey(target))?.length ?? 0;
}

function flowNodeId(graphId: string, nodeId: string): string {
  return `${graphId}::${nodeId}`;
}

type GraphLayout = {
  nodePositions: Map<string, { x: number; y: number }>;
  height: number;
};

function layoutGraphs(document: GraphPlanDocument): Map<string, GraphLayout> {
  const layouts = new Map<string, GraphLayout>();
  let laneY = 48;

  for (const graph of orderedGraphs(document)) {
    const levels = graphNodeLevels(graph);
    const rowsByLevel = new Map<number, number>();
    const nodePositions = new Map<string, { x: number; y: number }>();

    graph.nodes.forEach((node, nodeIndex) => {
      const level = levels.get(node.id) ?? nodeIndex;
      const row = rowsByLevel.get(level) ?? 0;
      rowsByLevel.set(level, row + 1);
      nodePositions.set(node.id, {
        x: 64 + level * (NODE_WIDTH + COLUMN_GAP),
        y: laneY + row * (NODE_HEIGHT + ROW_GAP),
      });
    });

    const maxRows = Math.max(1, ...rowsByLevel.values());
    const height = maxRows * NODE_HEIGHT + Math.max(0, maxRows - 1) * ROW_GAP;
    layouts.set(graph.id, { nodePositions, height });
    laneY += height + GRAPH_LANE_GAP;
  }

  return layouts;
}

function graphNodeLevels(graph: GraphPlanGraph): Map<string, number> {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const incomingCount = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const levels = new Map<string, number>();

  graph.nodes.forEach((node) => {
    incomingCount.set(node.id, 0);
    outgoing.set(node.id, []);
  });

  graph.edges
    .filter((edge) => edge.kind !== "loop" && nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .forEach((edge) => {
      incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
      outgoing.get(edge.from)?.push(edge.to);
    });

  const queue = graph.nodes.filter((node) => (incomingCount.get(node.id) ?? 0) === 0).map((node) => node.id);
  queue.forEach((nodeId) => levels.set(nodeId, 0));

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const nextLevel = (levels.get(nodeId) ?? 0) + 1;
    for (const nextNodeId of outgoing.get(nodeId) ?? []) {
      levels.set(nextNodeId, Math.max(levels.get(nextNodeId) ?? 0, nextLevel));
      incomingCount.set(nextNodeId, (incomingCount.get(nextNodeId) ?? 0) - 1);
      if ((incomingCount.get(nextNodeId) ?? 0) === 0) queue.push(nextNodeId);
    }
  }

  graph.nodes.forEach((node, index) => {
    if (!levels.has(node.id)) levels.set(node.id, index);
  });

  return levels;
}

function orderedGraphs(document: GraphPlanDocument): GraphPlanGraph[] {
  const graphsById = new Map(document.graphs.map((graph) => [graph.id, graph]));
  const ordered: GraphPlanGraph[] = [];
  const visited = new Set<string>();

  const visit = (graphId: string) => {
    if (visited.has(graphId)) return;
    const graph = graphsById.get(graphId);
    if (!graph) return;
    visited.add(graphId);
    ordered.push(graph);
    graph.nodes.forEach((node) => node.subGraphs?.forEach(visit));
  };

  visit(document.rootGraphId);
  document.graphs.forEach((graph) => visit(graph.id));
  return ordered;
}

function markdownSummary(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? "";
}
