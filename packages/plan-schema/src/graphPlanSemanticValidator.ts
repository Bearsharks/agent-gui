import type { GraphPlanDocument, GraphPlanGraph, GraphPlanNode, GraphPlanTarget } from "./graphPlan";
import {
  categoryForGraphPlanIssue,
  summarizeGraphPlanValidation,
  type GraphPlanIssueCode,
  type GraphPlanValidationIssue,
  type GraphPlanValidationMode,
  type GraphPlanValidationSummary,
} from "./graphPlanValidation";

export type { GraphPlanValidationIssue, GraphPlanValidationMode, GraphPlanValidationSummary } from "./graphPlanValidation";

type ValidationIndex = {
  graphs: Map<string, GraphPlanGraph>;
  nodes: Map<string, GraphPlanNode>;
  edges: Map<string, { graphId: string }>;
  iframes: Map<string, { graphId: string; nodeId: string }>;
};

export function validateGraphPlanSemantics(document: GraphPlanDocument): GraphPlanValidationIssue[] {
  const issues: GraphPlanValidationIssue[] = [];
  const index = buildIndex(document, issues);

  if (!index.graphs.has(document.rootGraphId)) {
    addIssue(issues, "error", "missing_root_graph", `Root graph '${document.rootGraphId}' does not exist.`, "rootGraphId");
  }

  for (const graph of document.graphs) validateGraph(graph, index, issues, graph.id === document.rootGraphId);
  return issues;
}

export function validateGraphPlan(
  document: GraphPlanDocument,
  options: { mode?: GraphPlanValidationMode; checkedAt?: string } = {},
): GraphPlanValidationSummary {
  return summarizeGraphPlanValidation(validateGraphPlanSemantics(document), options.mode ?? "draft", options.checkedAt);
}

export function assertGraphPlanSemantics(document: GraphPlanDocument): void {
  const errors = validateGraphPlanSemantics(document).filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(`Graph plan semantic validation failed:\n${errors.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}`);
  }
}

function buildIndex(document: GraphPlanDocument, issues: GraphPlanValidationIssue[]): ValidationIndex {
  const index: ValidationIndex = {
    graphs: new Map(),
    nodes: new Map(),
    edges: new Map(),
    iframes: new Map(),
  };

  for (const graph of document.graphs) {
    if (index.graphs.has(graph.id)) {
      addIssue(issues, "error", "duplicate_graph_id", `Duplicate graph id '${graph.id}'.`, `graphs.${graph.id}`);
    }
    index.graphs.set(graph.id, graph);

    for (const node of graph.nodes) {
      const key = nodeKeyFor(graph.id, node.id);
      if (index.nodes.has(key)) {
        addIssue(issues, "error", "duplicate_node_id", `Duplicate node id '${node.id}' in graph '${graph.id}'.`, key);
      }
      index.nodes.set(key, node);
      indexNodeIframes(graph.id, node, index, issues);
    }

    for (const edge of graph.edges) {
      const key = edgeKeyFor(graph.id, edge.id);
      if (index.edges.has(key)) {
        addIssue(issues, "error", "duplicate_edge_id", `Duplicate edge id '${edge.id}' in graph '${graph.id}'.`, key);
      }
      index.edges.set(key, { graphId: graph.id });
    }
  }

  return index;
}

function indexNodeIframes(graphId: string, node: GraphPlanNode, index: ValidationIndex, issues: GraphPlanValidationIssue[]): void {
  const seen = new Set<string>();
  for (const iframe of node.iframes ?? []) {
    const key = iframeKeyFor(graphId, node.id, iframe.id);
    if (seen.has(iframe.id)) {
      addIssue(issues, "error", "duplicate_iframe_id", `Duplicate iframe id '${iframe.id}' in node '${node.id}'.`, key);
    }
    seen.add(iframe.id);
    index.iframes.set(key, { graphId, nodeId: node.id });
  }
}

function validateGraph(graph: GraphPlanGraph, index: ValidationIndex, issues: GraphPlanValidationIssue[], isRoot: boolean): void {
  if (isRoot && graph.parent) {
    addIssue(issues, "warning", "parent_subgraph_not_declared", `Root graph '${graph.id}' should not declare a parent.`, `graphs.${graph.id}.parent`);
  }

  if (!isRoot) validateGraphParent(graph, index, issues);

  for (const node of graph.nodes) {
    validateNodeSubgraphs(graph, node, index, issues);
  }

  for (const edge of graph.edges) {
    if (!index.nodes.has(nodeKeyFor(graph.id, edge.from))) {
      addIssue(issues, "error", "missing_edge_from", `Edge '${edge.id}' source node '${edge.from}' does not exist.`, edgeKeyFor(graph.id, edge.id));
    }
    if (!index.nodes.has(nodeKeyFor(graph.id, edge.to))) {
      addIssue(issues, "error", "missing_edge_to", `Edge '${edge.id}' target node '${edge.to}' does not exist.`, edgeKeyFor(graph.id, edge.id));
    }
  }
}

function validateGraphParent(graph: GraphPlanGraph, index: ValidationIndex, issues: GraphPlanValidationIssue[]): void {
  const parent = graph.parent;
  if (!parent || !index.nodes.has(nodeKeyFor(parent.graphId, parent.nodeId))) {
    addIssue(issues, "error", "missing_graph_parent", `Parent for graph '${graph.id}' does not resolve.`, `graphs.${graph.id}.parent`);
    return;
  }

  const parentNode = index.nodes.get(nodeKeyFor(parent.graphId, parent.nodeId));
  if (!parentNode?.subGraphs?.includes(graph.id)) {
    addIssue(issues, "error", "parent_subgraph_not_declared", `Parent node '${parent.nodeId}' does not list graph '${graph.id}' in subGraphs.`, `graphs.${graph.id}.parent`);
  }
}

function validateNodeSubgraphs(graph: GraphPlanGraph, node: GraphPlanNode, index: ValidationIndex, issues: GraphPlanValidationIssue[]): void {
  for (const childGraphId of node.subGraphs ?? []) {
    const childGraph = index.graphs.get(childGraphId);
    const path = `${nodeKeyFor(graph.id, node.id)}.subGraphs.${childGraphId}`;
    if (!childGraph) {
      addIssue(issues, "error", "missing_subgraph", `Subgraph '${childGraphId}' does not exist.`, path);
      continue;
    }
    if (!childGraph.parent || childGraph.parent.graphId !== graph.id || childGraph.parent.nodeId !== node.id) {
      addIssue(issues, "error", "subgraph_parent_mismatch", `Subgraph '${childGraphId}' parent does not point back to node '${node.id}'.`, path);
    }
  }
}

export function validateTarget(
  target: GraphPlanTarget | undefined,
  document: GraphPlanDocument,
  path = "target",
  severity: "error" | "warning" = "error",
): GraphPlanValidationIssue[] {
  if (!target) return [];
  const issues: GraphPlanValidationIssue[] = [];
  const index = buildIndex(document, issues);
  validateTargetWithIndex(target, index, issues, path, severity);
  return issues;
}

function validateTargetWithIndex(target: GraphPlanTarget, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string, severity: "error" | "warning"): void {
  if (target.type === "plan") return;
  if (target.type === "graph" && !index.graphs.has(target.graphId)) {
    addIssue(issues, severity, "missing_target_graph", `Target graph '${target.graphId}' does not exist.`, path, { target });
  }
  if (target.type === "node" && !index.nodes.has(nodeKeyFor(target.graphId, target.nodeId))) {
    addIssue(issues, severity, "missing_target_node", `Target node '${target.graphId}/${target.nodeId}' does not exist.`, path, { target });
  }
  if (target.type === "edge" && !index.edges.has(edgeKeyFor(target.graphId, target.edgeId))) {
    addIssue(issues, severity, "missing_target_edge", `Target edge '${target.graphId}/${target.edgeId}' does not exist.`, path, { target });
  }
  if (target.type === "iframe" && !index.iframes.has(iframeKeyFor(target.graphId, target.nodeId, target.iframeId))) {
    addIssue(issues, severity, "missing_target_iframe", `Target iframe '${target.graphId}/${target.nodeId}/${target.iframeId}' does not exist.`, path, { target });
  }
}

function addIssue(
  issues: GraphPlanValidationIssue[],
  severity: "error" | "warning",
  code: GraphPlanIssueCode,
  message: string,
  path: string,
  refs: Pick<GraphPlanValidationIssue, "target"> = {},
): void {
  issues.push({ severity, code, category: categoryForGraphPlanIssue(code), message, path, ...refs });
}

function nodeKeyFor(graphId: string, nodeId: string): string {
  return `graph:${graphId}/node:${nodeId}`;
}

function edgeKeyFor(graphId: string, edgeId: string): string {
  return `graph:${graphId}/edge:${edgeId}`;
}

function iframeKeyFor(graphId: string, nodeId: string, iframeId: string): string {
  return `${nodeKeyFor(graphId, nodeId)}/iframe:${iframeId}`;
}
