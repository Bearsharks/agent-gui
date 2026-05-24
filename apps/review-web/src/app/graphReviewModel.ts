import type { GraphPlanDocument, GraphPlanEdge, GraphPlanGraph, GraphPlanNode, GraphPlanTarget, GraphPlanValidationIssue } from "@agent-gui/plan-schema";

export type GraphSelection = {
  graphId: string;
  nodeId?: string;
  edgeId?: string;
  iframeId?: string;
};

export type GraphIndex = {
  graphsById: Map<string, GraphPlanGraph>;
  nodesByKey: Map<string, GraphPlanNode>;
  edgesByKey: Map<string, GraphPlanEdge>;
  parentByGraphId: Map<string, { graphId: string; nodeId: string }>;
  issuesByTargetKey: Map<string, GraphPlanValidationIssue[]>;
};

export function buildGraphIndex(document: GraphPlanDocument, issues: GraphPlanValidationIssue[] = []): GraphIndex {
  const graphsById = new Map<string, GraphPlanGraph>();
  const nodesByKey = new Map<string, GraphPlanNode>();
  const edgesByKey = new Map<string, GraphPlanEdge>();
  const parentByGraphId = new Map<string, { graphId: string; nodeId: string }>();

  for (const graph of document.graphs) {
    graphsById.set(graph.id, graph);
    if (graph.parent) parentByGraphId.set(graph.id, graph.parent);
    for (const node of graph.nodes) nodesByKey.set(nodeKey(graph.id, node.id), node);
    for (const edge of graph.edges) edgesByKey.set(edgeKey(graph.id, edge.id), edge);
  }

  const issuesByTargetKey = new Map<string, GraphPlanValidationIssue[]>();
  for (const issue of issues) {
    const key = issue.target ? targetKey(issue.target) : "plan";
    const current = issuesByTargetKey.get(key) ?? [];
    current.push(issue);
    issuesByTargetKey.set(key, current);
  }

  return { graphsById, nodesByKey, edgesByKey, parentByGraphId, issuesByTargetKey };
}

export function normalizeSelection(document: GraphPlanDocument, index: GraphIndex, selection: Partial<GraphSelection> | null | undefined): GraphSelection {
  const graphId = selection?.graphId && index.graphsById.has(selection.graphId) ? selection.graphId : document.rootGraphId;
  const nodeId = selection?.nodeId && index.nodesByKey.has(nodeKey(graphId, selection.nodeId)) ? selection.nodeId : firstNodeId(index.graphsById.get(graphId));
  const edgeId = selection?.edgeId && index.edgesByKey.has(edgeKey(graphId, selection.edgeId)) ? selection.edgeId : undefined;
  const node = nodeId ? index.nodesByKey.get(nodeKey(graphId, nodeId)) : undefined;
  const iframeId = node?.iframes?.some((iframe) => iframe.id === selection?.iframeId) ? selection?.iframeId : undefined;
  return { graphId, nodeId, edgeId, iframeId };
}

export function selectionFromSearch(document: GraphPlanDocument, index: GraphIndex, search: string): GraphSelection {
  const params = new URLSearchParams(search);
  return normalizeSelection(document, index, {
    graphId: params.get("graph") ?? undefined,
    nodeId: params.get("node") ?? undefined,
    edgeId: params.get("edge") ?? undefined,
    iframeId: params.get("iframe") ?? undefined,
  });
}

export function selectionToSearch(selection: GraphSelection): string {
  const params = new URLSearchParams();
  params.set("graph", selection.graphId);
  if (selection.nodeId) params.set("node", selection.nodeId);
  if (selection.edgeId) params.set("edge", selection.edgeId);
  if (selection.iframeId) params.set("iframe", selection.iframeId);
  return params.toString();
}

export function selectionToTarget(selection: GraphSelection): GraphPlanTarget {
  if (selection.iframeId && selection.nodeId) return { type: "iframe", graphId: selection.graphId, nodeId: selection.nodeId, iframeId: selection.iframeId };
  if (selection.edgeId) return { type: "edge", graphId: selection.graphId, edgeId: selection.edgeId };
  if (selection.nodeId) return { type: "node", graphId: selection.graphId, nodeId: selection.nodeId };
  return { type: "graph", graphId: selection.graphId };
}

export function targetToSelection(target: GraphPlanTarget, fallbackGraphId: string): GraphSelection {
  if (target.type === "plan") return { graphId: fallbackGraphId };
  if (target.type === "graph") return { graphId: target.graphId };
  if (target.type === "node") return { graphId: target.graphId, nodeId: target.nodeId };
  if (target.type === "edge") return { graphId: target.graphId, edgeId: target.edgeId };
  return { graphId: target.graphId, nodeId: target.nodeId, iframeId: target.iframeId };
}

export function targetKey(target: GraphPlanTarget): string {
  if (target.type === "plan") return "plan";
  if (target.type === "graph") return `graph:${target.graphId}`;
  if (target.type === "node") return nodeKey(target.graphId, target.nodeId);
  if (target.type === "edge") return edgeKey(target.graphId, target.edgeId);
  return iframeKey(target.graphId, target.nodeId, target.iframeId);
}

export function breadcrumbForTarget(target: GraphPlanTarget, index: GraphIndex): string {
  return breadcrumbSegmentsForTarget(target, index).map((segment) => segment.label).join(" / ");
}

export function breadcrumbSegmentsForTarget(target: GraphPlanTarget, index: GraphIndex): { label: string; target: GraphPlanTarget }[] {
  if (target.type === "plan") return [{ label: "전체 플랜", target }];
  const parts = graphAncestrySegments(target.graphId, index);
  if (target.type === "graph") return parts;
  if (target.type === "edge") {
    const edge = index.edgesByKey.get(edgeKey(target.graphId, target.edgeId));
    return [...parts, { label: `연결: ${edge?.label ?? edge?.id ?? target.edgeId}`, target }];
  }
  const node = index.nodesByKey.get(nodeKey(target.graphId, target.nodeId));
  parts.push({ label: node?.title ?? target.nodeId, target: { type: "node", graphId: target.graphId, nodeId: target.nodeId } });
  if (target.type === "iframe") {
    const iframe = node?.iframes?.find((candidate) => candidate.id === target.iframeId);
    parts.push({ label: iframe?.description ?? target.iframeId, target });
  }
  return parts;
}

function graphAncestrySegments(graphId: string, index: GraphIndex): { label: string; target: GraphPlanTarget }[] {
  return buildGraphChain(graphId, index).map((graph) => ({ label: graph.title, target: { type: "graph", graphId: graph.id } }));
}

export function buildGraphChain(graphId: string, index: GraphIndex): GraphPlanGraph[] {
  const chain: GraphPlanGraph[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = graphId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const graph = index.graphsById.get(currentId);
    if (!graph) break;
    chain.unshift(graph);
    currentId = index.parentByGraphId.get(currentId)?.graphId;
  }
  return chain;
}

export function getChildGraphIds(node: GraphPlanNode): string[] {
  return node.subGraphs ?? [];
}

export function conditionLabel(edge: GraphPlanEdge): string {
  if (edge.label) return edge.label;
  if (edge.condition) return edge.condition;
  return edge.kind;
}

export function nodeKey(graphId: string, nodeId: string): string {
  return `graph:${graphId}/node:${nodeId}`;
}

export function edgeKey(graphId: string, edgeId: string): string {
  return `graph:${graphId}/edge:${edgeId}`;
}

export function iframeKey(graphId: string, nodeId: string, iframeId: string): string {
  return `${nodeKey(graphId, nodeId)}/iframe:${iframeId}`;
}

function firstNodeId(graph?: GraphPlanGraph): string | undefined {
  return graph?.nodes[0]?.id;
}
