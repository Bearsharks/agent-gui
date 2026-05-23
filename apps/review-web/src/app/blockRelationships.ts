import type { GraphPlanBlock, GraphPlanEdge, GraphPlanTarget } from "@agent-gui/plan-schema";
import { breadcrumbForTarget, conditionLabel, targetKey, type GraphIndex } from "./graphReviewModel";

export type BlockRelationship = {
  id: string;
  label: string;
  description: string;
  target?: GraphPlanTarget;
};

export function blockRelationships(block: GraphPlanBlock, graphId: string, nodeId: string, index: GraphIndex): BlockRelationship[] {
  const relationships: BlockRelationship[] = [];
  block.links?.forEach((link, linkIndex) => {
    relationships.push({
      id: `link:${linkIndex}:${targetKey(link.target)}`,
      label: linkPurposeLabel(link.purpose),
      description: breadcrumbForTarget(link.target, index),
      target: link.target,
    });
  });

  block.outputDefinitions?.forEach((output, outputIndex) => {
    const outputLabel = output.label ?? output.key;
    relationships.push({
      id: `output:${outputIndex}:${output.key}`,
      label: `출력 · ${outputLabel}`,
      description: `${output.valueType}${output.required ? " · 필수" : ""}`,
    });
    findOutputEdgeUsages(graphId, nodeId, block.id, output.key, index).forEach((edge) => {
      relationships.push({
        id: `output-edge:${output.key}:${edge.graphId}:${edge.edge.id}`,
        label: `영향 · ${outputLabel}`,
        description: `"${conditionLabel(edge.edge)}" 연결 조건에 사용됨`,
        target: { type: "edge", graphId: edge.graphId, edgeId: edge.edge.id },
      });
    });
  });

  return relationships;
}

function linkPurposeLabel(purpose: NonNullable<GraphPlanBlock["links"]>[number]["purpose"]) {
  const labels: Record<string, string> = {
    explains: "설명",
    validates: "검증",
    alternative: "대안",
    final_candidate: "최종 후보",
    depends_on: "의존",
    mitigates: "완화",
    produces: "생성",
    tests_interaction: "상호작용 테스트",
    shows_state: "상태 표시",
    implements_option: "선택지 구현",
  };
  return labels[purpose] ?? purpose;
}

function findOutputEdgeUsages(
  graphId: string,
  nodeId: string,
  blockId: string,
  outputKey: string,
  index: GraphIndex,
): { graphId: string; edge: GraphPlanEdge }[] {
  const usages: { graphId: string; edge: GraphPlanEdge }[] = [];
  for (const graph of index.graphsById.values()) {
    for (const edge of graph.edges) {
      if (pointerMatchesOutput(edge.source, graphId, nodeId, blockId, outputKey) || conditionReferencesOutput(edge.condition, graphId, nodeId, blockId, outputKey)) {
        usages.push({ graphId: graph.id, edge });
      }
    }
  }
  return usages;
}

function conditionReferencesOutput(condition: GraphPlanEdge["condition"], graphId: string, nodeId: string, blockId: string, outputKey: string): boolean {
  if (!condition) return false;
  if ("source" in condition) return pointerMatchesOutput(condition.source, graphId, nodeId, blockId, outputKey);
  if ("all" in condition) return condition.all.some((child) => conditionReferencesOutput(child, graphId, nodeId, blockId, outputKey));
  if ("any" in condition) return condition.any.some((child) => conditionReferencesOutput(child, graphId, nodeId, blockId, outputKey));
  return conditionReferencesOutput(condition.not, graphId, nodeId, blockId, outputKey);
}

function pointerMatchesOutput(pointer: GraphPlanEdge["source"], graphId: string, nodeId: string, blockId: string, outputKey: string): boolean {
  return pointer?.graphId === graphId && pointer.nodeId === nodeId && pointer.blockId === blockId && pointer.outputKey === outputKey;
}
