import type { GraphPlanEdge, GraphPlanGraph, GraphPlanNode, GraphPlanTarget } from "@agent-gui/plan-schema";
import { Button } from "@agent-gui/design-system";
import { Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge as FlowEdge, type Node as FlowNode, type NodeMouseHandler } from "@xyflow/react";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { labelBlockType, labelNodeKind, labelStatus } from "./graphReviewLabels";
import { blockKey, conditionLabel, edgeKey, getChildGraphIds, nodeKey, targetKey, type GraphIndex, type GraphSelection } from "./graphReviewModel";

type ReviewFlowNode = FlowNode<{ label: ReactNode; target: GraphSelection }, "default">;
type ReviewFlowEdge = FlowEdge<{ edge?: GraphPlanEdge; graphId?: string }>;

const elk = new ELK();

export function GraphPane({
  graph,
  index,
  selection,
  expandedNodeSelection,
  onSelect,
  onNodeSelect,
}: {
  graph: GraphPlanGraph;
  index: GraphIndex;
  selection: GraphSelection;
  expandedNodeSelection: GraphSelection | null;
  onSelect: (selection: GraphSelection) => void;
  onNodeSelect: (selection: GraphSelection) => void;
}) {
  const orderedNodes = useMemo(
    () =>
      graph.layout?.order
        ? graph.layout.order.map((id) => graph.nodes.find((node) => node.id === id)).filter((node): node is GraphPlanNode => Boolean(node))
        : graph.nodes,
    [graph],
  );
  const { nodes, edges } = useGraphFlowModel(graph, orderedNodes, index, selection, expandedNodeSelection, onSelect);

  const handleNodeClick: NodeMouseHandler<ReviewFlowNode> = (_event, node) => {
    onNodeSelect(node.data.target);
  };

  return (
    <aside className="graph-pane">
      <div className="graph-canvas" aria-label={`${graph.title} graph`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.28 }}
          minZoom={0.35}
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
  displayGraph,
  node,
  selection,
  expandedNodeSelection,
  index,
  onSelect,
  onTargetSelect,
  onClose,
  onResizeStart,
  footer,
}: {
  displayGraph: GraphPlanGraph;
  node: GraphPlanNode;
  selection: GraphSelection;
  expandedNodeSelection: GraphSelection;
  index: GraphIndex;
  onSelect: (selection: GraphSelection) => void;
  onTargetSelect: (target: GraphPlanTarget) => void;
  onClose: () => void;
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  footer?: ReactNode;
}) {
  const nodeGraphId = expandedNodeSelection.graphId;
  const childGraphIds = getChildGraphIds(node);
  const iframes = node.iframes ?? [];
  const activeIframe = selection.graphId === nodeGraphId && selection.nodeId === node.id
    ? iframes.find((iframe) => iframe.id === selection.iframeId) ?? iframes[0]
    : iframes[0];
  const nodeIssueCount = issueCountForTarget(index, { type: "node", graphId: nodeGraphId, nodeId: node.id });
  return (
    <aside className="selected-node-overlay">
      <div className="selected-node-resize-handle" onMouseDown={onResizeStart} aria-hidden="true" />
      <header className="selected-node-overlay-header">
        <div>
          <span>{labelNodeKind(node.kind)}</span>
          <strong>{node.title}</strong>
          {node.summary ? <p>{node.summary}</p> : null}
        </div>
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      </header>
      <div className="selected-node-meta-strip">
        <span>블록 {node.blocks.length}개</span>
        {iframes.length > 0 ? <span>iframe {iframes.length}개</span> : null}
        {childGraphIds.length > 0 ? <span>하위 그래프 {childGraphIds.length}개</span> : null}
        {node.status ? <span>{labelStatus(node.status)}</span> : null}
        {nodeIssueCount > 0 ? <span className="issue-chip">이슈 {nodeIssueCount}개</span> : null}
      </div>
      <div className="selected-node-primary-detail">
        <section className="selected-node-info-card">
          <strong>노드 정보</strong>
          {node.summary ? <p>{node.summary}</p> : <p className="muted">요약 없음</p>}
          {childGraphIds.length > 0 ? <span>연결된 하위 그래프: {childGraphIds.join(", ")}</span> : null}
        </section>
        {iframes.length > 0 ? (
          <section className="selected-node-iframe-panel" aria-label={`${node.title} iframe preview`}>
            <div className="iframe-tab-list" role="tablist">
              {iframes.map((iframe) => (
                <button
                  className={activeIframe?.id === iframe.id && selection.iframeId === iframe.id ? "selected" : ""}
                  key={iframe.id}
                  onClick={() => onSelect({ graphId: nodeGraphId, nodeId: node.id, iframeId: iframe.id })}
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
        {node.blocks.length > 0 ? (
          <section className="selected-node-block-summary" aria-label={`${node.title} block summary`}>
            <strong>블록 요약</strong>
            <div>
              {node.blocks.map((block) => {
                const issueCount = issueCountForTarget(index, { type: "block", graphId: nodeGraphId, nodeId: node.id, blockId: block.id });
                return (
                  <button
                    key={block.id}
                    onClick={() => onTargetSelect({ type: "block", graphId: nodeGraphId, nodeId: node.id, blockId: block.id })}
                    type="button"
                  >
                    <span>{labelBlockType(block.type)}</span>
                    <strong>{block.title ?? labelBlockType(block.type)}</strong>
                    {issueCount > 0 ? <em>이슈 {issueCount}개</em> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
      {childGraphIds.length > 0 ? <div className="selected-node-overlay-footer">현재 그래프: {displayGraph.title}</div> : null}
      {footer}
    </aside>
  );
}

function useGraphFlowModel(
  graph: GraphPlanGraph,
  orderedNodes: GraphPlanNode[],
  index: GraphIndex,
  selection: GraphSelection,
  expandedNodeSelection: GraphSelection | null,
  onSelect: (selection: GraphSelection) => void,
) {
  const expansionSelection = expandedNodeSelection ?? selection;
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(() => new Map());
  const layoutKey = useMemo(
    () =>
      JSON.stringify({
        graphId: graph.id,
        selectedNodeId: expansionSelection.nodeId,
        selectedGraphId: expansionSelection.graphId,
        nodes: orderedNodes.map((node) => node.id),
        edges: graph.edges.map((edge) => [edge.id, edge.from, edge.to]),
        childGraphs: visibleNestedGraphIds(graph, expansionSelection, index),
      }),
    [expansionSelection, graph, graph.edges, index, orderedNodes],
  );

  useEffect(() => {
    let cancelled = false;
    const baseNodes = buildFallbackFlowNodes(graph, orderedNodes, index, selection, expansionSelection, onSelect);
    const flowEdges = buildFlowEdges(graph, selection, expansionSelection, index);

    const elkGraph: ElkNode = {
      id: graph.id,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "28",
        "elk.layered.spacing.nodeNodeBetweenLayers": "46",
      },
      children: baseNodes.map((node) => ({
        id: node.id,
        width: Number(node.width ?? 190),
        height: Number(node.height ?? 142),
      })),
      edges: flowEdges
        .filter((edge) => baseNodes.some((node) => node.id === edge.source) && baseNodes.some((node) => node.id === edge.target))
        .map((edge) => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target],
        })),
    };

    void elk.layout(elkGraph).then((layouted) => {
      if (cancelled) return;
      setPositions(new Map((layouted.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }])));
    });

    return () => {
      cancelled = true;
    };
  }, [expansionSelection, graph.id, index, layoutKey, onSelect, orderedNodes, selection]);

  const nodes = useMemo(
    () =>
      buildFallbackFlowNodes(graph, orderedNodes, index, selection, expansionSelection, onSelect).map((node) => {
        const layoutPosition = positions.get(node.id);
        return {
          ...node,
          position: layoutPosition ? positionForFlowNode(node.id, layoutPosition, graph.id, index) : node.position,
        };
      }),
    [expansionSelection, graph, index, onSelect, orderedNodes, positions, selection],
  );
  const edges = useMemo(() => buildFlowEdges(graph, selection, expansionSelection, index), [expansionSelection, graph, index, selection]);

  return { nodes, edges };
}

function buildFallbackFlowNodes(
  graph: GraphPlanGraph,
  orderedNodes: GraphPlanNode[],
  index: GraphIndex,
  selection: GraphSelection,
  expansionSelection: GraphSelection,
  onSelect: (selection: GraphSelection) => void,
): ReviewFlowNode[] {
  const baseNodes: ReviewFlowNode[] = orderedNodes.map((node, nodeIndex): ReviewFlowNode => {
    const childGraphIds = getChildGraphIds(node);
    const iframeCount = node.iframes?.length ?? 0;
    const issueCount = issueCountForTarget(index, { type: "node", graphId: graph.id, nodeId: node.id });
    const selected = selection.graphId === graph.id && selection.nodeId === node.id;
    return {
      id: node.id,
      type: "default",
      position: { x: nodeIndex * 230, y: 120 + (nodeIndex % 2) * 28 },
      width: 150,
      height: 96,
      className: `review-flow-node ${selected ? "selected" : ""} ${childGraphIds.length > 0 ? "drillable" : ""}`,
      data: {
        target: { graphId: graph.id, nodeId: node.id },
        label: (
          <div className="review-flow-node-body">
            <span className="node-kind">{labelNodeKind(node.kind)}</span>
            <strong>{node.title}</strong>
            {node.summary ? <span className="node-summary">{node.summary}</span> : null}
            <span className="node-meta">
              <span>블록 {node.blocks.length}개</span>
              {iframeCount > 0 ? <span>iframe {iframeCount}</span> : null}
              {childGraphIds.length > 0 ? <span>하위 그래프</span> : null}
              {issueCount > 0 ? <span className="issue-chip">{issueCount}</span> : null}
            </span>
          </div>
        ),
      },
    };
  });
  const childNodes =
    visibleNestedGraphIds(graph, expansionSelection, index).flatMap((childGraphId) => {
      const childGraph = index.graphsById.get(childGraphId);
      if (!childGraph) return [];
      const depth = nestedGraphDepth(graph.id, childGraph.id, index);
      return childGraph.nodes.map((node, nodeIndex): ReviewFlowNode => {
        const selected = selection.graphId === childGraph.id && selection.nodeId === node.id;
        const iframeCount = node.iframes?.length ?? 0;
        const issueCount = issueCountForTarget(index, { type: "node", graphId: childGraph.id, nodeId: node.id });
        return {
          id: childFlowNodeId(childGraph.id, node.id),
          type: "default",
          position: { x: 320 + nodeIndex * 190, y: 260 },
          width: 150,
          height: 96,
          className: `review-flow-node child-graph-node depth-${depth} ${selected ? "selected" : ""}`,
          data: {
            target: { graphId: childGraph.id, nodeId: node.id },
            label: (
              <div className="review-flow-node-body">
                <span className="node-kind">{childGraph.title}</span>
                <strong>{node.title}</strong>
                <span className="node-meta">
                  <span>블록 {node.blocks.length}개</span>
                  {iframeCount > 0 ? <span>iframe {iframeCount}</span> : null}
                  {issueCount > 0 ? <span className="issue-chip">{issueCount}</span> : null}
                </span>
              </div>
            ),
          },
        };
      });
    });
  return [...baseNodes, ...childNodes];
}

function buildFlowEdges(graph: GraphPlanGraph, selection: GraphSelection, expansionSelection: GraphSelection, index: GraphIndex): ReviewFlowEdge[] {
  const graphEdges = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: conditionLabel(edge),
    type: "smoothstep",
    animated: edge.kind === "conditional" || (selection.graphId === graph.id && selection.edgeId === edge.id),
    className: selection.graphId === graph.id && selection.edgeId === edge.id ? "review-flow-edge selected" : "review-flow-edge",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { edge, graphId: graph.id },
  }));
  const childEdges =
    visibleNestedGraphIds(graph, expansionSelection, index).flatMap((childGraphId) => {
      const childGraph = index.graphsById.get(childGraphId);
      if (!childGraph) return [];
      const source = visibleGraphRefSource(graph.id, childGraph.id, expansionSelection, index);
      const sourceNodeId = source.nodeId;
      const refEdges: ReviewFlowEdge[] = sourceNodeId
        ? childGraph.nodes.slice(0, 1).map((node) => ({
            id: `child-ref:${source.graphId}:${sourceNodeId}:${childGraph.id}:${node.id}`,
            source: flowNodeIdForGraphNode(graph.id, source.graphId, sourceNodeId),
            target: childFlowNodeId(childGraph.id, node.id),
            label: "자식",
            type: "smoothstep",
            animated: false,
            className: "review-flow-edge child-graph-edge",
            markerEnd: { type: MarkerType.ArrowClosed },
            data: { graphId: childGraph.id },
          }))
        : [];
      const internalEdges: ReviewFlowEdge[] = childGraph.edges.map((edge) => ({
        id: `child-edge:${childGraph.id}:${edge.id}`,
        source: childFlowNodeId(childGraph.id, edge.from),
        target: childFlowNodeId(childGraph.id, edge.to),
        label: conditionLabel(edge),
        type: "smoothstep",
        animated: edge.kind === "conditional" || (selection.graphId === childGraph.id && selection.edgeId === edge.id),
        className: `review-flow-edge child-graph-edge ${selection.graphId === childGraph.id && selection.edgeId === edge.id ? "selected" : ""}`,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { edge, graphId: childGraph.id },
      }));
      return [...refEdges, ...internalEdges];
    });
  return [...graphEdges, ...childEdges];
}

function visibleGraphRefSource(
  displayGraphId: string,
  childGraphId: string,
  expansionSelection: GraphSelection,
  index: GraphIndex,
): { graphId: string; nodeId?: string } {
  const selectedNode = selectedNodeForSelection(index, expansionSelection);
  const selectedNodeRefsGraph = selectedNode?.blocks.some((block) => block.type === "graph_ref" && block.graphId === childGraphId);
  if (selectedNodeRefsGraph && expansionSelection.nodeId) {
    return { graphId: expansionSelection.graphId, nodeId: expansionSelection.nodeId };
  }

  const owner = index.parentByGraphId.get(childGraphId);
  return { graphId: owner?.graphId ?? displayGraphId, nodeId: owner?.nodeId };
}

function childFlowNodeId(graphId: string, nodeId: string): string {
  return `${graphId}::${nodeId}`;
}

function positionForFlowNode(
  flowNodeId: string,
  layoutPosition: { x: number; y: number },
  displayGraphId: string,
  index: GraphIndex,
): { x: number; y: number } {
  const parsed = parseChildFlowNodeId(flowNodeId);
  if (!parsed) return { x: layoutPosition.x + 48, y: layoutPosition.y + 72 };
  const depth = nestedGraphDepth(displayGraphId, parsed.graphId, index);
  return {
    x: layoutPosition.x + 48,
    y: layoutPosition.y + 72 + depth * 300,
  };
}

function parseChildFlowNodeId(flowNodeId: string): { graphId: string; nodeId: string } | null {
  const [graphId, nodeId] = flowNodeId.split("::");
  if (!graphId || !nodeId) return null;
  return { graphId, nodeId };
}

function flowNodeIdForGraphNode(displayGraphId: string, graphId: string, nodeId: string): string {
  return graphId === displayGraphId ? nodeId : childFlowNodeId(graphId, nodeId);
}

function nestedGraphDepth(displayGraphId: string, graphId: string, index: GraphIndex): number {
  let depth = 0;
  let currentId: string | undefined = graphId;
  const visited = new Set<string>();
  while (currentId && currentId !== displayGraphId && !visited.has(currentId)) {
    visited.add(currentId);
    depth += 1;
    currentId = index.parentByGraphId.get(currentId)?.graphId;
  }
  return depth;
}

function visibleNestedGraphIds(displayGraph: GraphPlanGraph, selection: GraphSelection, index: GraphIndex): string[] {
  const graphIds = new Set<string>();
  collectNestedGraphIds(displayGraph, index, graphIds);
  return Array.from(graphIds);
}

function collectNestedGraphIds(graph: GraphPlanGraph, index: GraphIndex, graphIds: Set<string>): void {
  graph.nodes.forEach((node) => {
    getChildGraphIds(node).forEach((childGraphId) => {
      if (graphIds.has(childGraphId)) return;
      const childGraph = index.graphsById.get(childGraphId);
      if (!childGraph) return;
      graphIds.add(childGraphId);
      collectNestedGraphIds(childGraph, index, graphIds);
    });
  });
}

function selectedNodeForSelection(index: GraphIndex, selection: GraphSelection): GraphPlanNode | undefined {
  return selection.nodeId ? index.nodesByKey.get(nodeKey(selection.graphId, selection.nodeId)) : undefined;
}

function issueCountForTarget(index: GraphIndex, target: GraphPlanTarget): number {
  const exact = index.issuesByTargetKey.get(targetKey(target))?.length ?? 0;
  if (target.type !== "node") return exact;
  const node = index.nodesByKey.get(nodeKey(target.graphId, target.nodeId));
  if (!node) return exact;
  return (
    exact +
    node.blocks.reduce((sum, block) => {
      return sum + (index.issuesByTargetKey.get(blockKey(target.graphId, target.nodeId, block.id))?.length ?? 0);
    }, 0)
  );
}
