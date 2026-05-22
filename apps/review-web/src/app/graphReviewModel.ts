import type {
  GraphPlanBlock,
  GraphPlanDocument,
  GraphPlanEdge,
  GraphPlanGraph,
  GraphPlanNode,
  GraphPlanPointer,
  GraphPlanTarget,
  GraphPlanValidationIssue,
} from "@agent-gui/plan-schema";

export type GraphSelection = {
  graphId: string;
  nodeId?: string;
  blockId?: string;
  itemId?: string;
  itemType?: Extract<GraphPlanTarget, { type: "block_item" }>["itemType"];
  edgeId?: string;
  prototypeId?: string;
  pieceId?: string;
};

export type GraphIndex = {
  graphsById: Map<string, GraphPlanGraph>;
  nodesByKey: Map<string, GraphPlanNode>;
  blocksByKey: Map<string, GraphPlanBlock>;
  edgesByKey: Map<string, GraphPlanEdge>;
  parentByGraphId: Map<string, GraphPlanPointer>;
  issuesByTargetKey: Map<string, GraphPlanValidationIssue[]>;
};

export function buildGraphIndex(document: GraphPlanDocument, issues: GraphPlanValidationIssue[] = []): GraphIndex {
  const graphsById = new Map<string, GraphPlanGraph>();
  const nodesByKey = new Map<string, GraphPlanNode>();
  const blocksByKey = new Map<string, GraphPlanBlock>();
  const edgesByKey = new Map<string, GraphPlanEdge>();
  const parentByGraphId = new Map<string, GraphPlanPointer>();

  for (const graph of document.graphs) {
    graphsById.set(graph.id, graph);
    if (graph.owner) parentByGraphId.set(graph.id, graph.owner);

    for (const node of graph.nodes) {
      nodesByKey.set(nodeKey(graph.id, node.id), node);
      for (const block of node.blocks) {
        blocksByKey.set(blockKey(graph.id, node.id, block.id), block);
      }
    }

    for (const edge of graph.edges) {
      edgesByKey.set(edgeKey(graph.id, edge.id), edge);
    }
  }

  const issuesByTargetKey = new Map<string, GraphPlanValidationIssue[]>();
  for (const issue of issues) {
    const key = issue.target ? targetKey(issue.target) : issue.pointer ? pointerKey(issue.pointer) : "plan";
    const current = issuesByTargetKey.get(key) ?? [];
    current.push(issue);
    issuesByTargetKey.set(key, current);
  }

  return { graphsById, nodesByKey, blocksByKey, edgesByKey, parentByGraphId, issuesByTargetKey };
}

export function normalizeSelection(document: GraphPlanDocument, index: GraphIndex, selection: Partial<GraphSelection>): GraphSelection {
  const graphId = selection.graphId && index.graphsById.has(selection.graphId) ? selection.graphId : document.rootGraphId;
  const nodeId = selection.nodeId && index.nodesByKey.has(nodeKey(graphId, selection.nodeId)) ? selection.nodeId : undefined;
  const blockId =
    nodeId && selection.blockId && index.blocksByKey.has(blockKey(graphId, nodeId, selection.blockId))
      ? selection.blockId
      : undefined;
  const itemId = blockId ? selection.itemId : undefined;
  const edgeId = selection.edgeId && index.edgesByKey.has(edgeKey(graphId, selection.edgeId)) ? selection.edgeId : undefined;
  return { graphId, nodeId, blockId, itemId, itemType: selection.itemType, edgeId, prototypeId: selection.prototypeId, pieceId: selection.pieceId };
}

export function selectionFromSearch(document: GraphPlanDocument, index: GraphIndex, search: string): GraphSelection {
  const params = new URLSearchParams(search);
  return normalizeSelection(document, index, {
    graphId: params.get("graph") ?? undefined,
    nodeId: params.get("node") ?? undefined,
    blockId: params.get("block") ?? undefined,
    itemId: params.get("item") ?? undefined,
    edgeId: params.get("edge") ?? undefined,
    pieceId: params.get("piece") ?? undefined,
  });
}

export function selectionToSearch(selection: GraphSelection): string {
  const params = new URLSearchParams();
  params.set("graph", selection.graphId);
  if (selection.nodeId) params.set("node", selection.nodeId);
  if (selection.blockId) params.set("block", selection.blockId);
  if (selection.itemId) params.set("item", selection.itemId);
  if (selection.edgeId) params.set("edge", selection.edgeId);
  if (selection.pieceId) params.set("piece", selection.pieceId);
  return params.toString();
}

export function selectionToTarget(selection: GraphSelection): GraphPlanTarget {
  if (selection.pieceId && selection.prototypeId && selection.nodeId && selection.blockId) {
    return {
      type: "prototype_piece",
      graphId: selection.graphId,
      nodeId: selection.nodeId,
      blockId: selection.blockId,
      prototypeId: selection.prototypeId,
      pieceId: selection.pieceId,
    };
  }
  if (selection.itemId && selection.blockId && selection.nodeId) {
    return {
      type: "block_item",
      graphId: selection.graphId,
      nodeId: selection.nodeId,
      blockId: selection.blockId,
      itemId: selection.itemId,
      itemType: selection.itemType,
    };
  }
  if (selection.edgeId) return { type: "edge", graphId: selection.graphId, edgeId: selection.edgeId };
  if (selection.blockId && selection.nodeId) {
    return { type: "block", graphId: selection.graphId, nodeId: selection.nodeId, blockId: selection.blockId };
  }
  if (selection.nodeId) return { type: "node", graphId: selection.graphId, nodeId: selection.nodeId };
  return { type: "graph", graphId: selection.graphId };
}

export function targetToSelection(target: GraphPlanTarget, fallbackGraphId: string): GraphSelection {
  if (target.type === "plan") return { graphId: fallbackGraphId };
  if (target.type === "graph") return { graphId: target.graphId };
  if (target.type === "node") return { graphId: target.graphId, nodeId: target.nodeId };
  if (target.type === "block") return { graphId: target.graphId, nodeId: target.nodeId, blockId: target.blockId };
  if (target.type === "edge") return { graphId: target.graphId, edgeId: target.edgeId };
  if (target.type === "block_item") {
    return { graphId: target.graphId, nodeId: target.nodeId, blockId: target.blockId, itemId: target.itemId, itemType: target.itemType };
  }
  if (target.type === "prototype_piece") {
    return {
      graphId: target.graphId,
      nodeId: target.nodeId,
      blockId: target.blockId,
      prototypeId: target.prototypeId,
      pieceId: target.pieceId,
    };
  }
  return { graphId: target.graphId, nodeId: target.nodeId, blockId: target.blockId };
}

export function pointerToSelection(pointer: GraphPlanPointer, fallbackGraphId: string): GraphSelection {
  return {
    graphId: pointer.graphId ?? fallbackGraphId,
    nodeId: pointer.nodeId,
    blockId: pointer.blockId,
  };
}

export function targetKey(target: GraphPlanTarget): string {
  if (target.type === "plan") return "plan";
  if (target.type === "graph") return `graph:${target.graphId}`;
  if (target.type === "node") return nodeKey(target.graphId, target.nodeId);
  if (target.type === "block") return blockKey(target.graphId, target.nodeId, target.blockId);
  if (target.type === "edge") return edgeKey(target.graphId, target.edgeId);
  if (target.type === "block_item") return `item:${target.graphId}:${target.nodeId}:${target.blockId}:${target.itemId}`;
  if (target.type === "prototype_piece") {
    return `piece:${target.graphId}:${target.nodeId}:${target.blockId}:${target.prototypeId}:${target.pieceId}`;
  }
  return `artifact:${target.graphId}:${target.nodeId}:${target.blockId}:${target.artifactId}:${target.path ?? ""}`;
}

export function breadcrumbForTarget(target: GraphPlanTarget, index: GraphIndex): string {
  if (target.type === "plan") return "계획";
  const graph = index.graphsById.get(target.graphId);
  const parts = [graph?.title ?? target.graphId];
  if (target.type === "graph") return parts.join(" / ");
  if (target.type === "edge") {
    const edge = index.edgesByKey.get(edgeKey(target.graphId, target.edgeId));
    return `${parts.join(" / ")} / 연결: ${edge?.label ?? edge?.id ?? target.edgeId}`;
  }
  if ("nodeId" in target) {
    const node = index.nodesByKey.get(nodeKey(target.graphId, target.nodeId));
    parts.push(node?.title ?? target.nodeId);
  }
  if ("blockId" in target) {
    const block = index.blocksByKey.get(blockKey(target.graphId, target.nodeId, target.blockId));
    parts.push(block?.title ?? block?.type ?? target.blockId);
  }
  if (target.type === "block_item") parts.push(target.itemId);
  if (target.type === "prototype_piece") parts.push(target.pieceId);
  if (target.type === "artifact_range") parts.push(target.path ?? target.artifactId);
  return parts.join(" / ");
}

export function selectedGraph(index: GraphIndex, selection: GraphSelection): GraphPlanGraph | undefined {
  return index.graphsById.get(selection.graphId);
}

export function selectedNode(index: GraphIndex, selection: GraphSelection): GraphPlanNode | undefined {
  return selection.nodeId ? index.nodesByKey.get(nodeKey(selection.graphId, selection.nodeId)) : undefined;
}

export function selectedBlock(index: GraphIndex, selection: GraphSelection): GraphPlanBlock | undefined {
  return selection.nodeId && selection.blockId ? index.blocksByKey.get(blockKey(selection.graphId, selection.nodeId, selection.blockId)) : undefined;
}

export function getChildGraphIds(node: GraphPlanNode): string[] {
  const refs = node.blocks.flatMap((block) => (block.type === "graph_ref" ? [block.graphId] : []));
  return Array.from(new Set([...(node.ownedGraphIds ?? []), ...refs]));
}

export function conditionLabel(edge: GraphPlanEdge): string {
  if (edge.label) return edge.label;
  if (!edge.condition) return edgeKindLabel(edge.kind);
  if ("label" in edge.condition && edge.condition.label) return edge.condition.label;
  if ("operator" in edge.condition) return edge.condition.operator;
  if ("all" in edge.condition) return "모든 조건";
  if ("any" in edge.condition) return "일부 조건";
  return "조건 제외";
}

function edgeKindLabel(kind: string): string {
  if (kind === "sequence") return "순서";
  if (kind === "conditional") return "조건";
  if (kind === "dependency") return "의존";
  if (kind === "loop") return "반복";
  if (kind === "reference") return "참조";
  if (kind === "rollback") return "롤백";
  return kind;
}

export function nodeKey(graphId: string, nodeId: string): string {
  return `node:${graphId}:${nodeId}`;
}

export function blockKey(graphId: string, nodeId: string, blockId: string): string {
  return `block:${graphId}:${nodeId}:${blockId}`;
}

export function edgeKey(graphId: string, edgeId: string): string {
  return `edge:${graphId}:${edgeId}`;
}

function pointerKey(pointer: GraphPlanPointer): string {
  if (pointer.blockId && pointer.graphId && pointer.nodeId) return blockKey(pointer.graphId, pointer.nodeId, pointer.blockId);
  if (pointer.nodeId && pointer.graphId) return nodeKey(pointer.graphId, pointer.nodeId);
  if (pointer.graphId) return `graph:${pointer.graphId}`;
  return "plan";
}
