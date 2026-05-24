import type { GraphPlanDocument, GraphPlanEdge, GraphPlanGraph, GraphPlanNode, GraphPlanTarget } from "@agent-gui/plan-schema";
import { Button } from "@agent-gui/design-system";
import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge as FlowEdge, type Node as FlowNode, type NodeMouseHandler } from "@xyflow/react";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { conditionLabel, edgeKey, getChildGraphIds, nodeKey, targetKey, type GraphIndex, type GraphSelection } from "./graphReviewModel";

type ReviewFlowNode = FlowNode<{ label: ReactNode; target: GraphSelection }, "default">;
type ReviewFlowEdge = FlowEdge<{ edge?: GraphPlanEdge; graphId?: string }>;

const elk = new ELK();

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
  footer,
}: {
  graph: GraphPlanGraph;
  node: GraphPlanNode;
  selection: GraphSelection;
  index: GraphIndex;
  onSelect: (selection: GraphSelection) => void;
  onClose: () => void;
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  footer?: ReactNode;
}) {
  const iframes = node.iframes ?? [];
  const activeIframe = iframes.find((iframe) => iframe.id === selection.iframeId) ?? iframes[0];
  const nodeIssueCount = issueCountForTarget(index, { type: "node", graphId: graph.id, nodeId: node.id });
  const incoming = graph.edges.filter((edge) => edge.to === node.id);
  const outgoing = graph.edges.filter((edge) => edge.from === node.id);
  const childGraphIds = getChildGraphIds(node);

  return (
    <aside className="selected-node-overlay">
      <div className="selected-node-resize-handle" onMouseDown={onResizeStart} aria-hidden="true" />
      <header className="selected-node-overlay-header">
        <div>
          <span>{graph.title}</span>
          <strong>{node.title}</strong>
          {node.description ? <p>{node.description}</p> : null}
        </div>
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      </header>
      <div className="selected-node-meta-strip">
        {iframes.length > 0 ? <span>iframe {iframes.length}개</span> : null}
        {childGraphIds.length > 0 ? <span>하위 그래프 {childGraphIds.length}개</span> : null}
        {incoming.length > 0 ? <span>in {incoming.length}</span> : null}
        {outgoing.length > 0 ? <span>out {outgoing.length}</span> : null}
        {nodeIssueCount > 0 ? <span className="issue-chip">이슈 {nodeIssueCount}개</span> : null}
      </div>
      <div className="selected-node-primary-detail">
        <section className="selected-node-info-card">
          <strong>노드 정보</strong>
          {node.description ? <p>{node.description}</p> : <p className="muted">설명 없음</p>}
          {childGraphIds.length > 0 ? <span>연결된 하위 그래프: {childGraphIds.join(", ")}</span> : null}
          {incoming.length > 0 ? <span>이전 흐름: {incoming.map((edge) => edge.label ?? edge.from).join(", ")}</span> : null}
          {outgoing.length > 0 ? <span>다음 흐름: {outgoing.map((edge) => edge.label ?? edge.to).join(", ")}</span> : null}
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
      {footer}
    </aside>
  );
}

function useGraphFlowModel(document: GraphPlanDocument, index: GraphIndex, selection: GraphSelection) {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(() => new Map());
  const baseNodes = useMemo(() => buildFlowNodes(document, index, selection), [document, index, selection]);
  const baseEdges = useMemo(() => buildFlowEdges(document, index, selection), [document, index, selection]);
  const layoutKey = useMemo(() => JSON.stringify({ graphs: document.graphs.map((graph) => [graph.id, graph.nodes.length, graph.edges.length]) }), [document]);

  useEffect(() => {
    let cancelled = false;
    const elkGraph: ElkNode = {
      id: document.rootGraphId,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "36",
        "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      },
      children: baseNodes.map((node) => ({ id: node.id, width: Number(node.width ?? 180), height: Number(node.height ?? 108) })),
      edges: baseEdges
        .filter((edge) => baseNodes.some((node) => node.id === edge.source) && baseNodes.some((node) => node.id === edge.target))
        .map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    };
    void elk.layout(elkGraph).then((layouted) => {
      if (!cancelled) setPositions(new Map((layouted.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }])));
    });
    return () => {
      cancelled = true;
    };
  }, [baseEdges, baseNodes, document.rootGraphId, layoutKey]);

  return {
    nodes: baseNodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })),
    edges: baseEdges,
  };
}

function buildFlowNodes(document: GraphPlanDocument, index: GraphIndex, selection: GraphSelection): ReviewFlowNode[] {
  return document.graphs.flatMap((graph, graphIndex) =>
    graph.nodes.map((node, nodeIndex) => {
      const selected = selection.graphId === graph.id && selection.nodeId === node.id;
      const issueCount = issueCountForTarget(index, { type: "node", graphId: graph.id, nodeId: node.id });
      const childGraphCount = node.subGraphs?.length ?? 0;
      const iframeCount = node.iframes?.length ?? 0;
      return {
        id: flowNodeId(graph.id, node.id),
        type: "default",
        position: { x: nodeIndex * 220, y: graphIndex * 260 },
        width: 170,
        height: 104,
        className: `review-flow-node ${selected ? "selected" : ""} ${childGraphCount > 0 ? "drillable" : ""}`,
        data: {
          target: { graphId: graph.id, nodeId: node.id },
          label: (
            <div className="review-flow-node-body">
              <span className="node-kind">{graph.title}</span>
              <strong>{node.title}</strong>
              {node.description ? <span className="node-summary">{node.description}</span> : null}
              <span className="node-meta">
                {iframeCount > 0 ? <span>iframe {iframeCount}</span> : null}
                {childGraphCount > 0 ? <span>하위 그래프</span> : null}
                {issueCount > 0 ? <span className="issue-chip">{issueCount}</span> : null}
              </span>
            </div>
          ),
        },
      } satisfies ReviewFlowNode;
    }),
  );
}

function buildFlowEdges(document: GraphPlanDocument, index: GraphIndex, selection: GraphSelection): ReviewFlowEdge[] {
  const graphEdges = document.graphs.flatMap((graph) =>
    graph.edges.map((edge) => ({
      id: edge.id,
      source: flowNodeId(graph.id, edge.from),
      target: flowNodeId(graph.id, edge.to),
      label: conditionLabel(edge),
      type: "smoothstep",
      animated: edge.kind === "conditional" || edge.kind === "loop" || selection.edgeId === edge.id,
      className: selection.edgeId === edge.id ? "review-flow-edge selected" : "review-flow-edge",
      markerEnd: { type: MarkerType.ArrowClosed },
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
