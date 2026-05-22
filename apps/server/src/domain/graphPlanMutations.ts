import {
  graphPlanBlockSchema,
  graphPlanDocumentSchema,
  graphPlanGraphSchema,
  graphPlanMutationOperationSchema,
  type GraphPlanBlock,
  type GraphPlanDocument,
  type GraphPlanEdge,
  type GraphPlanGraph,
  type GraphPlanMutationOperation,
  type GraphPlanNode,
} from "@agent-gui/plan-schema";
import { ZodError } from "zod";

export class GraphPlanMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphPlanMutationError";
  }
}

export function applyGraphPlanMutations(
  graphPlan: GraphPlanDocument,
  operations: GraphPlanMutationOperation[],
): GraphPlanDocument {
  if (operations.length === 0) {
    throw new GraphPlanMutationError("Graph plan mutation requires at least one operation.");
  }

  let nextDocument = parseDocument(structuredClone(graphPlan), "Input graph plan is invalid");

  operations.forEach((rawOperation, index) => {
    const parsedOperation = graphPlanMutationOperationSchema.safeParse(rawOperation);
    if (!parsedOperation.success) {
      throw new GraphPlanMutationError(`Operation ${index} is invalid: ${formatZodError(parsedOperation.error)}`);
    }
    const operation = parsedOperation.data;
    nextDocument = applyGraphPlanMutation(nextDocument, operation, index);
  });

  return parseDocument(nextDocument, "Mutated graph plan is invalid");
}

function applyGraphPlanMutation(
  document: GraphPlanDocument,
  operation: GraphPlanMutationOperation,
  index: number,
): GraphPlanDocument {
  try {
    switch (operation.op) {
      case "replace_document":
        return parseDocument(structuredClone(operation.graphPlan), "Replacement graph plan is invalid");
      case "update_node_fields": {
        const node = findNode(document, operation.target.graphId, operation.target.nodeId);
        const fields = operation.fields as Partial<GraphPlanNode> & { id?: unknown; blocks?: unknown };
        if (fields.id !== undefined || fields.blocks !== undefined) {
          throw new GraphPlanMutationError("update_node_fields cannot change node id or blocks; use add/remove/replace block operations.");
        }
        Object.assign(node, fields);
        return parseDocument(document, "Updated node fields produce an invalid graph plan");
      }
      case "update_block_fields": {
        const block = findBlock(document, operation.target.graphId, operation.target.nodeId, operation.target.blockId);
        const fields = operation.fields as Partial<GraphPlanBlock> & { id?: unknown; type?: unknown };
        if (fields.id !== undefined || fields.type !== undefined) {
          throw new GraphPlanMutationError("update_block_fields cannot change block id or type; use replace_block.");
        }
        Object.assign(block, fields);
        parseBlock(block, "Updated block fields produce an invalid block");
        return parseDocument(document, "Updated block fields produce an invalid graph plan");
      }
      case "replace_block": {
        if (operation.block.id !== operation.target.blockId) {
          throw new GraphPlanMutationError(
            `replace_block target block "${operation.target.blockId}" must match replacement block id "${operation.block.id}".`,
          );
        }
        const node = findNode(document, operation.target.graphId, operation.target.nodeId);
        const blockIndex = findBlockIndex(node, operation.target.blockId, operation.target.graphId, operation.target.nodeId);
        node.blocks[blockIndex] = operation.block;
        return parseDocument(document, "Replacement block produces an invalid graph plan");
      }
      case "append_block": {
        const node = findNode(document, operation.target.graphId, operation.target.nodeId);
        assertMissingBlock(node, operation.block.id, operation.target.graphId, operation.target.nodeId);
        node.blocks.push(operation.block);
        return parseDocument(document, "Appended block produces an invalid graph plan");
      }
      case "add_node": {
        const graph = findGraph(document, operation.graphId);
        assertMissingNode(graph, operation.node.id);
        graph.nodes.push(operation.node);
        if (graph.layout?.order && !graph.layout.order.includes(operation.node.id)) {
          graph.layout.order.push(operation.node.id);
        }
        return parseDocument(document, "Added node produces an invalid graph plan");
      }
      case "add_edge": {
        const graph = findGraph(document, operation.graphId);
        assertMissingEdge(graph, operation.edge.id);
        assertNodeExists(graph, operation.edge.from, operation.graphId);
        assertNodeExists(graph, operation.edge.to, operation.graphId);
        graph.edges.push(operation.edge);
        return parseDocument(document, "Added edge produces an invalid graph plan");
      }
      case "remove_node": {
        const graph = findGraph(document, operation.target.graphId);
        const nodeIndex = findNodeIndex(graph, operation.target.nodeId);
        const node = graph.nodes[nodeIndex];
        removeNodeOwnedGraphs(document, graph.id, node, operation.policy?.ownedGraphs ?? "error");
        removeNodeEdges(graph, node.id, operation.policy?.edges ?? "error");
        graph.nodes.splice(nodeIndex, 1);
        removeNodeFromLayout(graph, node.id);
        return parseDocument(document, "Removed node produces an invalid graph plan");
      }
      case "remove_edge": {
        const graph = findGraph(document, operation.target.graphId);
        const edgeIndex = findEdgeIndex(graph, operation.target.edgeId);
        graph.edges.splice(edgeIndex, 1);
        return parseDocument(document, "Removed edge produces an invalid graph plan");
      }
      case "rewire_edge": {
        const graph = findGraph(document, operation.target.graphId);
        const edge = findEdge(graph, operation.target.edgeId);
        if (operation.from === undefined && operation.to === undefined) {
          throw new GraphPlanMutationError("rewire_edge requires at least one of from or to.");
        }
        if (operation.from !== undefined) {
          assertNodeExists(graph, operation.from, operation.target.graphId);
          edge.from = operation.from;
        }
        if (operation.to !== undefined) {
          assertNodeExists(graph, operation.to, operation.target.graphId);
          edge.to = operation.to;
        }
        if (operation.policy?.preserveCondition === false) {
          delete edge.condition;
        }
        return parseDocument(document, "Rewired edge produces an invalid graph plan");
      }
      case "add_subgraph": {
        const parentNode = findNode(document, operation.parent.graphId, operation.parent.nodeId);
        assertMissingGraph(document, operation.graph.id);
        const attachedBlockId = operation.attach?.mode === "graph_ref_block" ? (operation.attach.blockId ?? `b-ref-${operation.graph.id}`) : undefined;
        const graph = parseGraph(
          {
            ...operation.graph,
            owner: operation.graph.owner ?? {
              graphId: operation.parent.graphId,
              nodeId: operation.parent.nodeId,
              blockId: attachedBlockId,
            },
          },
          `Subgraph "${operation.graph.id}" is invalid`,
        );
        document.graphs.push(graph);
        parentNode.ownedGraphIds = uniqueStrings([...(parentNode.ownedGraphIds ?? []), graph.id]);
        if (operation.attach?.mode === "graph_ref_block") {
          const blockId = attachedBlockId ?? `b-ref-${graph.id}`;
          assertMissingBlock(parentNode, blockId, operation.parent.graphId, operation.parent.nodeId);
          parentNode.blocks.push(
            parseBlock(
              {
                id: blockId,
                type: "graph_ref",
                graphId: graph.id,
                relationship: operation.attach.relationship ?? "decomposes_node",
                ownership: "owned",
              },
              `Generated graph_ref block "${blockId}" is invalid`,
            ),
          );
        } else if (operation.attach && operation.attach.mode !== "none") {
          throw new GraphPlanMutationError(`Unsupported add_subgraph attach mode "${operation.attach.mode}".`);
        }
        return parseDocument(document, "Added subgraph produces an invalid graph plan");
      }
      case "attach_graph_ref": {
        if (operation.block.type !== "graph_ref") {
          throw new GraphPlanMutationError("attach_graph_ref requires a graph_ref block.");
        }
        findGraph(document, operation.block.graphId);
        const node = findNode(document, operation.target.graphId, operation.target.nodeId);
        assertMissingBlock(node, operation.block.id, operation.target.graphId, operation.target.nodeId);
        node.blocks.push(operation.block);
        if (operation.block.ownership === "owned") {
          node.ownedGraphIds = uniqueStrings([...(node.ownedGraphIds ?? []), operation.block.graphId]);
        }
        return parseDocument(document, "Attached graph_ref block produces an invalid graph plan");
      }
      default:
        return assertNever(operation);
    }
  } catch (error) {
    if (error instanceof GraphPlanMutationError) {
      throw new GraphPlanMutationError(`Operation ${index} (${operation.op}) failed: ${error.message}`);
    }
    if (error instanceof ZodError) {
      throw new GraphPlanMutationError(`Operation ${index} (${operation.op}) failed: ${formatZodError(error)}`);
    }
    throw error;
  }
}

function parseDocument(document: unknown, context: string): GraphPlanDocument {
  const result = graphPlanDocumentSchema.safeParse(document);
  if (!result.success) {
    throw new GraphPlanMutationError(`${context}: ${formatZodError(result.error)}`);
  }
  return result.data;
}

function parseGraph(graph: unknown, context: string): GraphPlanGraph {
  const result = graphPlanGraphSchema.safeParse(graph);
  if (!result.success) {
    throw new GraphPlanMutationError(`${context}: ${formatZodError(result.error)}`);
  }
  return result.data;
}

function parseBlock(block: unknown, context: string): GraphPlanBlock {
  const result = graphPlanBlockSchema.safeParse(block);
  if (!result.success) {
    throw new GraphPlanMutationError(`${context}: ${formatZodError(result.error)}`);
  }
  return result.data;
}

function findGraph(document: GraphPlanDocument, graphId: string): GraphPlanGraph {
  const graph = document.graphs.find((candidate) => candidate.id === graphId);
  if (!graph) {
    throw new GraphPlanMutationError(`Graph "${graphId}" was not found.`);
  }
  return graph;
}

function assertMissingGraph(document: GraphPlanDocument, graphId: string): void {
  if (document.graphs.some((graph) => graph.id === graphId)) {
    throw new GraphPlanMutationError(`Graph "${graphId}" already exists.`);
  }
}

function findNode(document: GraphPlanDocument, graphId: string, nodeId: string): GraphPlanNode {
  const graph = findGraph(document, graphId);
  return graph.nodes[findNodeIndex(graph, nodeId)];
}

function findNodeIndex(graph: GraphPlanGraph, nodeId: string): number {
  const nodeIndex = graph.nodes.findIndex((candidate) => candidate.id === nodeId);
  if (nodeIndex === -1) {
    throw new GraphPlanMutationError(`Node "${nodeId}" was not found in graph "${graph.id}".`);
  }
  return nodeIndex;
}

function assertMissingNode(graph: GraphPlanGraph, nodeId: string): void {
  if (graph.nodes.some((node) => node.id === nodeId)) {
    throw new GraphPlanMutationError(`Node "${nodeId}" already exists in graph "${graph.id}".`);
  }
}

function assertNodeExists(graph: GraphPlanGraph, nodeId: string, graphId: string): void {
  if (!graph.nodes.some((node) => node.id === nodeId)) {
    throw new GraphPlanMutationError(`Node "${nodeId}" was not found in graph "${graphId}".`);
  }
}

function findBlock(document: GraphPlanDocument, graphId: string, nodeId: string, blockId: string): GraphPlanBlock {
  const node = findNode(document, graphId, nodeId);
  return node.blocks[findBlockIndex(node, blockId, graphId, nodeId)];
}

function findBlockIndex(node: GraphPlanNode, blockId: string, graphId: string, nodeId: string): number {
  const blockIndex = node.blocks.findIndex((candidate) => candidate.id === blockId);
  if (blockIndex === -1) {
    throw new GraphPlanMutationError(`Block "${blockId}" was not found in node "${nodeId}" of graph "${graphId}".`);
  }
  return blockIndex;
}

function assertMissingBlock(node: GraphPlanNode, blockId: string, graphId: string, nodeId: string): void {
  if (node.blocks.some((block) => block.id === blockId)) {
    throw new GraphPlanMutationError(`Block "${blockId}" already exists in node "${nodeId}" of graph "${graphId}".`);
  }
}

function findEdge(graph: GraphPlanGraph, edgeId: string): GraphPlanEdge {
  return graph.edges[findEdgeIndex(graph, edgeId)];
}

function findEdgeIndex(graph: GraphPlanGraph, edgeId: string): number {
  const edgeIndex = graph.edges.findIndex((candidate) => candidate.id === edgeId);
  if (edgeIndex === -1) {
    throw new GraphPlanMutationError(`Edge "${edgeId}" was not found in graph "${graph.id}".`);
  }
  return edgeIndex;
}

function assertMissingEdge(graph: GraphPlanGraph, edgeId: string): void {
  if (graph.edges.some((edge) => edge.id === edgeId)) {
    throw new GraphPlanMutationError(`Edge "${edgeId}" already exists in graph "${graph.id}".`);
  }
}

function removeNodeEdges(graph: GraphPlanGraph, nodeId: string, policy: "error" | "remove" | "reconnect"): void {
  const connectedEdges = graph.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
  if (connectedEdges.length === 0) {
    return;
  }
  if (policy === "error") {
    throw new GraphPlanMutationError(
      `Node "${nodeId}" has connected edges (${connectedEdges.map((edge) => edge.id).join(", ")}); set policy.edges to "remove".`,
    );
  }
  if (policy === "reconnect") {
    throw new GraphPlanMutationError('remove_node policy.edges "reconnect" is not supported by the MVP helper.');
  }
  graph.edges = graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
}

function removeNodeOwnedGraphs(
  document: GraphPlanDocument,
  graphId: string,
  node: GraphPlanNode,
  policy: "error" | "remove" | "detach",
): void {
  const ownedGraphIds = uniqueStrings([
    ...(node.ownedGraphIds ?? []),
    ...document.graphs
      .filter((graph) => graph.owner?.graphId === graphId && graph.owner.nodeId === node.id)
      .map((graph) => graph.id),
  ]);

  if (ownedGraphIds.length === 0) {
    return;
  }
  if (policy === "error") {
    throw new GraphPlanMutationError(
      `Node "${node.id}" owns graph(s) ${ownedGraphIds.join(", ")}; set policy.ownedGraphs to "remove" or "detach".`,
    );
  }
  if (policy === "remove") {
    if (ownedGraphIds.includes(document.rootGraphId)) {
      throw new GraphPlanMutationError(`Cannot remove root graph "${document.rootGraphId}" as an owned graph side effect.`);
    }
    document.graphs = document.graphs.filter((graph) => !ownedGraphIds.includes(graph.id));
    return;
  }

  document.graphs.forEach((graph) => {
    if (ownedGraphIds.includes(graph.id) && graph.owner?.graphId === graphId && graph.owner.nodeId === node.id) {
      delete graph.owner;
    }
  });
}

function removeNodeFromLayout(graph: GraphPlanGraph, nodeId: string): void {
  if (!graph.layout) {
    return;
  }
  graph.layout.order = graph.layout.order?.filter((candidate) => candidate !== nodeId);
  graph.layout.groups = graph.layout.groups?.map((group) => ({
    ...group,
    nodeIds: group.nodeIds.filter((candidate) => candidate !== nodeId),
  }));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function assertNever(value: never): never {
  throw new GraphPlanMutationError(`Unsupported graph plan mutation operation: ${JSON.stringify(value)}.`);
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
