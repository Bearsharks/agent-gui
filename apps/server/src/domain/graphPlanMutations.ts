import {
  graphPlanDocumentSchema,
  graphPlanGraphSchema,
  graphPlanIframeSchema,
  graphPlanNodeSchema,
  type GraphPlanDocument,
  type GraphPlanEdge,
  type GraphPlanGraph,
  type GraphPlanNode,
} from "@agent-gui/plan-schema";
import { ZodError } from "zod";
import { serverGraphPlanMutationOperationSchema, type ServerGraphPlanMutationOperation } from "./graphPlanMutationSchemas";

export class GraphPlanMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphPlanMutationError";
  }
}

export function applyGraphPlanMutations(graphPlan: GraphPlanDocument, operations: ServerGraphPlanMutationOperation[]): GraphPlanDocument {
  if (operations.length === 0) throw new GraphPlanMutationError("Graph plan mutation requires at least one operation.");

  let nextDocument = parseDocument(structuredClone(graphPlan), "Input graph plan is invalid");
  operations.forEach((rawOperation, index) => {
    const parsedOperation = serverGraphPlanMutationOperationSchema.safeParse(rawOperation);
    if (!parsedOperation.success) throw new GraphPlanMutationError(`Operation ${index} is invalid: ${formatZodError(parsedOperation.error)}`);
    nextDocument = applyGraphPlanMutation(nextDocument, parsedOperation.data, index);
  });
  return parseDocument(nextDocument, "Mutated graph plan is invalid");
}

function applyGraphPlanMutation(document: GraphPlanDocument, operation: ServerGraphPlanMutationOperation, index: number): GraphPlanDocument {
  try {
    switch (operation.op) {
      case "replace_document":
        return parseDocument(structuredClone(operation.graphPlan), "Replacement graph plan is invalid");
      case "update_graph": {
        const graph = findGraph(document, operation.target.graphId);
        Object.assign(graph, operation.fields);
        return parseDocument(document, "Updated graph produces an invalid graph plan");
      }
      case "add_graph": {
        assertMissingGraph(document, operation.graph.id);
        document.graphs.push(operation.graph);
        return parseDocument(document, "Added graph produces an invalid graph plan");
      }
      case "remove_graph": {
        if (operation.target.graphId === document.rootGraphId) throw new GraphPlanMutationError("Cannot remove the root graph.");
        const index = document.graphs.findIndex((graph) => graph.id === operation.target.graphId);
        if (index === -1) throw new GraphPlanMutationError(`Graph "${operation.target.graphId}" was not found.`);
        for (const graph of document.graphs) {
          for (const node of graph.nodes) node.subGraphs = node.subGraphs?.filter((graphId) => graphId !== operation.target.graphId);
        }
        document.graphs.splice(index, 1);
        return parseDocument(document, "Removed graph produces an invalid graph plan");
      }
      case "update_node": {
        const node = findNode(document, operation.target.graphId, operation.target.nodeId);
        Object.assign(node, operation.fields);
        graphPlanNodeSchema.parse(node);
        return parseDocument(document, "Updated node produces an invalid graph plan");
      }
      case "add_node": {
        const graph = findGraph(document, operation.graphId);
        assertMissingNode(graph, operation.node.id);
        graph.nodes.push(operation.node);
        return parseDocument(document, "Added node produces an invalid graph plan");
      }
      case "remove_node": {
        const graph = findGraph(document, operation.target.graphId);
        const nodeIndex = findNodeIndex(graph, operation.target.nodeId);
        removeNodeEdges(graph, operation.target.nodeId);
        graph.nodes.splice(nodeIndex, 1);
        return parseDocument(document, "Removed node produces an invalid graph plan");
      }
      case "add_edge": {
        const graph = findGraph(document, operation.graphId);
        assertMissingEdge(graph, operation.edge.id);
        assertNodeExists(graph, operation.edge.from);
        assertNodeExists(graph, operation.edge.to);
        graph.edges.push(operation.edge);
        return parseDocument(document, "Added edge produces an invalid graph plan");
      }
      case "update_edge": {
        const graph = findGraph(document, operation.target.graphId);
        const edge = findEdge(graph, operation.target.edgeId);
        Object.assign(edge, operation.fields);
        if (operation.fields.from) assertNodeExists(graph, operation.fields.from);
        if (operation.fields.to) assertNodeExists(graph, operation.fields.to);
        return parseDocument(document, "Updated edge produces an invalid graph plan");
      }
      case "remove_edge": {
        const graph = findGraph(document, operation.target.graphId);
        graph.edges.splice(findEdgeIndex(graph, operation.target.edgeId), 1);
        return parseDocument(document, "Removed edge produces an invalid graph plan");
      }
      case "attach_subgraph": {
        const parentNode = findNode(document, operation.parent.graphId, operation.parent.nodeId);
        const childGraph = findGraph(document, operation.graphId);
        parentNode.subGraphs = uniqueStrings([...(parentNode.subGraphs ?? []), childGraph.id]);
        childGraph.parent = { graphId: operation.parent.graphId, nodeId: operation.parent.nodeId };
        return parseDocument(document, "Attached subgraph produces an invalid graph plan");
      }
      case "detach_subgraph": {
        const parentNode = findNode(document, operation.parent.graphId, operation.parent.nodeId);
        const childGraph = findGraph(document, operation.graphId);
        parentNode.subGraphs = parentNode.subGraphs?.filter((graphId) => graphId !== childGraph.id);
        delete childGraph.parent;
        return parseDocument(document, "Detached subgraph produces an invalid graph plan");
      }
      case "add_iframe": {
        const node = findNode(document, operation.target.graphId, operation.target.nodeId);
        assertMissingIframe(node, operation.iframe.id);
        node.iframes = [...(node.iframes ?? []), operation.iframe];
        return parseDocument(document, "Added iframe produces an invalid graph plan");
      }
      case "update_iframe": {
        const iframe = findIframe(document, operation.target.graphId, operation.target.nodeId, operation.target.iframeId);
        Object.assign(iframe, operation.fields);
        graphPlanIframeSchema.parse(iframe);
        return parseDocument(document, "Updated iframe produces an invalid graph plan");
      }
      case "remove_iframe": {
        const node = findNode(document, operation.target.graphId, operation.target.nodeId);
        node.iframes?.splice(findIframeIndex(node, operation.target.iframeId), 1);
        return parseDocument(document, "Removed iframe produces an invalid graph plan");
      }
      default:
        return assertNever(operation);
    }
  } catch (error) {
    if (error instanceof GraphPlanMutationError) throw new GraphPlanMutationError(`Operation ${index} (${operation.op}) failed: ${error.message}`);
    if (error instanceof ZodError) throw new GraphPlanMutationError(`Operation ${index} (${operation.op}) failed: ${formatZodError(error)}`);
    throw error;
  }
}

function parseDocument(document: unknown, context: string): GraphPlanDocument {
  const result = graphPlanDocumentSchema.safeParse(document);
  if (!result.success) throw new GraphPlanMutationError(`${context}: ${formatZodError(result.error)}`);
  return result.data;
}

function findGraph(document: GraphPlanDocument, graphId: string): GraphPlanGraph {
  const graph = document.graphs.find((candidate) => candidate.id === graphId);
  if (!graph) throw new GraphPlanMutationError(`Graph "${graphId}" was not found.`);
  return graph;
}

function assertMissingGraph(document: GraphPlanDocument, graphId: string): void {
  if (document.graphs.some((graph) => graph.id === graphId)) throw new GraphPlanMutationError(`Graph "${graphId}" already exists.`);
}

function findNode(document: GraphPlanDocument, graphId: string, nodeId: string): GraphPlanNode {
  const graph = findGraph(document, graphId);
  return graph.nodes[findNodeIndex(graph, nodeId)];
}

function findNodeIndex(graph: GraphPlanGraph, nodeId: string): number {
  const index = graph.nodes.findIndex((node) => node.id === nodeId);
  if (index === -1) throw new GraphPlanMutationError(`Node "${nodeId}" was not found in graph "${graph.id}".`);
  return index;
}

function assertMissingNode(graph: GraphPlanGraph, nodeId: string): void {
  if (graph.nodes.some((node) => node.id === nodeId)) throw new GraphPlanMutationError(`Node "${nodeId}" already exists in graph "${graph.id}".`);
}

function assertNodeExists(graph: GraphPlanGraph, nodeId: string): void {
  if (!graph.nodes.some((node) => node.id === nodeId)) throw new GraphPlanMutationError(`Node "${nodeId}" was not found in graph "${graph.id}".`);
}

function findEdge(graph: GraphPlanGraph, edgeId: string): GraphPlanEdge {
  return graph.edges[findEdgeIndex(graph, edgeId)];
}

function findEdgeIndex(graph: GraphPlanGraph, edgeId: string): number {
  const index = graph.edges.findIndex((edge) => edge.id === edgeId);
  if (index === -1) throw new GraphPlanMutationError(`Edge "${edgeId}" was not found in graph "${graph.id}".`);
  return index;
}

function assertMissingEdge(graph: GraphPlanGraph, edgeId: string): void {
  if (graph.edges.some((edge) => edge.id === edgeId)) throw new GraphPlanMutationError(`Edge "${edgeId}" already exists in graph "${graph.id}".`);
}

function removeNodeEdges(graph: GraphPlanGraph, nodeId: string): void {
  graph.edges = graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
}

function findIframe(document: GraphPlanDocument, graphId: string, nodeId: string, iframeId: string) {
  const node = findNode(document, graphId, nodeId);
  return (node.iframes ?? [])[findIframeIndex(node, iframeId)];
}

function findIframeIndex(node: GraphPlanNode, iframeId: string): number {
  const index = (node.iframes ?? []).findIndex((iframe) => iframe.id === iframeId);
  if (index === -1) throw new GraphPlanMutationError(`Iframe "${iframeId}" was not found in node "${node.id}".`);
  return index;
}

function assertMissingIframe(node: GraphPlanNode, iframeId: string): void {
  if ((node.iframes ?? []).some((iframe) => iframe.id === iframeId)) throw new GraphPlanMutationError(`Iframe "${iframeId}" already exists in node "${node.id}".`);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
}

function assertNever(value: never): never {
  throw new GraphPlanMutationError(`Unsupported graph mutation operation ${(value as { op?: string }).op ?? "<unknown>"}.`);
}
