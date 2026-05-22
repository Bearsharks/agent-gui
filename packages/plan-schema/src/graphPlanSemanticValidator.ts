import type {
  GraphPlanBlock,
  GraphPlanDocument,
  GraphPlanGraph,
  GraphPlanNode,
  GraphPlanOutputDefinition,
  GraphPlanPointer,
  GraphPlanRuntimeState,
  GraphPlanTarget,
} from "./graphPlan";
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
  blocks: Map<string, GraphPlanBlock>;
  edges: Map<string, { graph: GraphPlanGraph; edgeId: string }>;
  blockItems: Map<string, { type?: string }>;
  blockOutputs: Map<string, Map<string, GraphPlanOutputDefinition>>;
  prototypePieces: Map<string, { graphId: string; nodeId: string; blockId: string; prototypeId: string; pieceId: string }>;
};

export function validateGraphPlanSemantics(document: GraphPlanDocument): GraphPlanValidationIssue[] {
  const issues: GraphPlanValidationIssue[] = [];
  const index = buildIndex(document, issues);

  if (!index.graphs.has(document.rootGraphId)) {
    addIssue(issues, "error", "missing_root_graph", `Root graph '${document.rootGraphId}' does not exist.`, "rootGraphId");
  }

  for (const graph of document.graphs) {
    validateGraph(graph, index, issues, graph.id === document.rootGraphId);
  }

  return issues;
}

export function validateGraphPlan(document: GraphPlanDocument, options: { mode?: GraphPlanValidationMode; checkedAt?: string } = {}): GraphPlanValidationSummary {
  return summarizeGraphPlanValidation(validateGraphPlanSemantics(document), options.mode ?? "draft", options.checkedAt);
}

export function assertGraphPlanSemantics(document: GraphPlanDocument): void {
  const issues = validateGraphPlanSemantics(document);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    const message = errors.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
    throw new Error(`Graph plan semantic validation failed:\n${message}`);
  }
}

export function validateGraphPlanRuntimeState(document: GraphPlanDocument, runtimeState: GraphPlanRuntimeState): GraphPlanValidationIssue[] {
  const issues: GraphPlanValidationIssue[] = [];
  const index = buildIndex(document, issues);

  if (runtimeState.documentId !== document.id) {
    addIssue(issues, "error", "runtime_document_mismatch", `Runtime state documentId '${runtimeState.documentId}' does not match document '${document.id}'.`, "runtime.documentId");
  }

  for (const [key, entry] of Object.entries(runtimeState.outputValues ?? {})) {
    validateRuntimeOutput(entry.target, entry.value, index, issues, `runtime.outputValues.${key}`);
  }
  runtimeState.outputEntries?.forEach((entry, entryIndex) => {
    validateRuntimeOutput(entry.target, entry.value, index, issues, `runtime.outputEntries.${entryIndex}`);
  });
  runtimeState.events?.forEach((event, eventIndex) => {
    if (event.type === "experiment_run" || event.type === "validator_result") {
      event.outputEntries?.forEach((entry, entryIndex) => {
        validateRuntimeOutput(entry.target, entry.value, index, issues, `runtime.events.${eventIndex}.outputEntries.${entryIndex}`);
      });
    }
    if (event.type === "output_value") {
      validateRuntimeOutput(event.target, event.value, index, issues, `runtime.events.${eventIndex}`);
    }
    if (event.type === "experiment_run") {
      event.evidenceTargets?.forEach((target, targetIndex) => validateTarget(target, index, issues, `runtime.events.${eventIndex}.evidenceTargets.${targetIndex}`));
    }
    if (event.type === "validator_result") {
      validateTarget(event.target, index, issues, `runtime.events.${eventIndex}.target`);
    }
    if (event.type === "user_decision") {
      validateTarget(event.target, index, issues, `runtime.events.${eventIndex}.target`);
    }
  });

  return issues;
}

function buildIndex(document: GraphPlanDocument, issues: GraphPlanValidationIssue[]): ValidationIndex {
  const index: ValidationIndex = {
    graphs: new Map(),
    nodes: new Map(),
    blocks: new Map(),
    edges: new Map(),
    blockItems: new Map(),
    blockOutputs: new Map(),
    prototypePieces: new Map(),
  };

  for (const graph of document.graphs) {
    if (index.graphs.has(graph.id)) {
      addIssue(issues, "error", "duplicate_graph_id", `Duplicate graph id '${graph.id}'.`, `graphs.${graph.id}`);
    }
    index.graphs.set(graph.id, graph);

    for (const edge of graph.edges) {
      const edgeKey = edgeKeyFor(graph.id, edge.id);
      if (index.edges.has(edgeKey)) {
        addIssue(issues, "error", "duplicate_edge_id", `Duplicate edge id '${edge.id}' in graph '${graph.id}'.`, edgeKey);
      }
      index.edges.set(edgeKey, { graph, edgeId: edge.id });
    }

    for (const node of graph.nodes) {
      const nodeKey = nodeKeyFor(graph.id, node.id);
      if (index.nodes.has(nodeKey)) {
        addIssue(issues, "error", "duplicate_node_id", `Duplicate node id '${node.id}' in graph '${graph.id}'.`, nodeKey);
      }
      index.nodes.set(nodeKey, node);

      for (const block of node.blocks) {
        const blockKey = blockKeyFor(graph.id, node.id, block.id);
        if (index.blocks.has(blockKey)) {
          addIssue(issues, "error", "duplicate_block_id", `Duplicate block id '${block.id}' in node '${node.id}'.`, blockKey);
        }
        index.blocks.set(blockKey, block);
        index.blockOutputs.set(blockKey, new Map(block.outputDefinitions?.map((output) => [output.key, output]) ?? []));
        indexBlockItems(index, graph.id, node.id, block);
      }
    }
  }

  return index;
}

function indexBlockItems(index: ValidationIndex, graphId: string, nodeId: string, block: GraphPlanBlock): void {
  const addItem = (itemId: string, type?: string) => {
    index.blockItems.set(blockItemKeyFor(graphId, nodeId, block.id, itemId), { type });
  };

  switch (block.type) {
    case "task_list":
      block.items.forEach((item) => addItem(item.id, "task"));
      break;
    case "checklist":
      block.items.forEach((item) => addItem(item.id, "check"));
      break;
    case "criteria":
      block.criteria.forEach((item) => addItem(item.id, "criterion"));
      break;
    case "review_bundle":
      block.acceptanceCriteria.forEach((item) => addItem(item.id, "criterion"));
      break;
    case "prototype":
      for (const piece of block.pieces) {
        addItem(piece.id, "prototype_piece");
        index.prototypePieces.set(prototypePieceKeyFor(graphId, nodeId, block.id, block.prototypeId, piece.id), {
          graphId,
          nodeId,
          blockId: block.id,
          prototypeId: block.prototypeId,
          pieceId: piece.id,
        });
      }
      break;
    case "choice_set":
      block.options.forEach((item) => addItem(item.id, "option"));
      break;
    case "comparison":
      block.criteria.forEach((item) => addItem(item.id, "criterion"));
      block.options.forEach((item) => addItem(item.id, "option"));
      block.scores.forEach((item) => {
        if (item.id) addItem(item.id, "score");
      });
      break;
    case "evidence":
      block.items.forEach((item) => addItem(item.id, "evidence"));
      break;
    case "synthesis":
      block.entries.forEach((item) => addItem(item.id, "finding"));
      break;
    case "risk":
      block.risks.forEach((item) => addItem(item.id, "risk"));
      break;
    case "verification":
      block.checks.forEach((item) => addItem(item.id, "verification"));
      break;
    case "artifact":
      block.artifacts.forEach((item) => addItem(item.id, "artifact"));
      break;
    case "changelog":
      block.entries.forEach((item) => addItem(item.id, "change"));
      break;
    case "investigation":
      block.hypotheses.forEach((item) => addItem(item.id, "hypothesis"));
      block.experiments.forEach((item) => addItem(item.id, "experiment"));
      block.observations.forEach((item) => addItem(item.id, "evidence"));
      break;
    case "migration":
      block.steps.forEach((item) => addItem(item.id, "migration_step"));
      block.compatibility?.items?.forEach((item) => addItem(item.id, "migration_step"));
      block.rollbackPlans?.forEach((item) => addItem(item.id, "migration_step"));
      break;
    case "checkpoint_outcome":
    case "text":
    case "graph_ref":
      break;
  }
}

function validateGraph(graph: GraphPlanGraph, index: ValidationIndex, issues: GraphPlanValidationIssue[], isRoot: boolean): void {
  if (!isRoot && graph.owner && !pointerExists(graph.owner, index)) {
    addIssue(issues, "error", "missing_graph_owner", `Owner pointer for graph '${graph.id}' does not resolve.`, `graphs.${graph.id}.owner`);
  }
  validateOutputDefinitions(graph.contract?.inputs, index, issues, `graphs.${graph.id}.contract.inputs`);
  validateOutputDefinitions(graph.contract?.outputs, index, issues, `graphs.${graph.id}.contract.outputs`);
  validateGraphContractOutputsProduced(graph, index, issues, `graphs.${graph.id}.contract.outputs`);

  for (const node of graph.nodes) {
    validateNode(graph, node, index, issues);
  }

  for (const edge of graph.edges) {
    if (!index.nodes.has(nodeKeyFor(graph.id, edge.from))) {
      addIssue(issues, "error", "missing_edge_from", `Edge '${edge.id}' source node '${edge.from}' does not exist.`, edgeKeyFor(graph.id, edge.id));
    }
    if (!index.nodes.has(nodeKeyFor(graph.id, edge.to))) {
      addIssue(issues, "error", "missing_edge_to", `Edge '${edge.id}' target node '${edge.to}' does not exist.`, edgeKeyFor(graph.id, edge.id));
    }
    validatePointer(edge.source, index, issues, `${edgeKeyFor(graph.id, edge.id)}.source`);
    validateCondition(edge.condition, index, issues, `${edgeKeyFor(graph.id, edge.id)}.condition`);
  }
}

function validateNode(graph: GraphPlanGraph, node: GraphPlanNode, index: ValidationIndex, issues: GraphPlanValidationIssue[]): void {
  for (const childGraphId of node.ownedGraphIds ?? []) {
    const childGraph = index.graphs.get(childGraphId);
    const path = `${nodeKeyFor(graph.id, node.id)}.ownedGraphIds.${childGraphId}`;
    if (!childGraph) {
      addIssue(issues, "error", "missing_owned_graph", `Owned graph '${childGraphId}' does not exist.`, path);
      continue;
    }
    if (childGraph.owner && (childGraph.owner.graphId !== graph.id || childGraph.owner.nodeId !== node.id)) {
      addIssue(issues, "error", "owned_graph_owner_mismatch", `Owned graph '${childGraphId}' owner does not point back to node '${node.id}'.`, path);
    }
  }

  for (const link of node.links ?? []) {
    validateTarget(link.target, index, issues, `${nodeKeyFor(graph.id, node.id)}.links`);
  }

  for (const block of node.blocks) {
    validateBlock(graph, node, block, index, issues);
  }
}

function validateBlock(
  graph: GraphPlanGraph,
  node: GraphPlanNode,
  block: GraphPlanBlock,
  index: ValidationIndex,
  issues: GraphPlanValidationIssue[],
): void {
  const path = blockKeyFor(graph.id, node.id, block.id);

  for (const link of block.links ?? []) validateTarget(link.target, index, issues, `${path}.links`);
  validateOutputDefinitions(block.outputDefinitions, index, issues, `${path}.outputDefinitions`);
  for (const target of block.revisionMeta?.supersedes ?? []) validateTarget(target, index, issues, `${path}.revisionMeta.supersedes`);

  switch (block.type) {
    case "graph_ref": {
      const childGraph = index.graphs.get(block.graphId);
      if (!childGraph) {
        addIssue(issues, "error", "missing_graph_ref", `Referenced graph '${block.graphId}' does not exist.`, path);
        break;
      }
      if (block.ownership === "owned" && !(node.ownedGraphIds ?? []).includes(block.graphId)) {
        addIssue(issues, "warning", "owned_graph_ref_not_declared", `Owned graph_ref '${block.graphId}' is not listed in node.ownedGraphIds.`, path);
      }
      if (
        block.ownership === "owned" &&
        childGraph.owner &&
        (childGraph.owner.graphId !== graph.id || childGraph.owner.nodeId !== node.id || childGraph.owner.blockId !== block.id)
      ) {
        addIssue(issues, "error", "graph_ref_owner_mismatch", `Owned graph_ref '${block.graphId}' owner does not point back to this node.`, path);
      }
      validateGraphRefBindings(block, childGraph, index, issues, path);
      break;
    }
    case "task_list":
      block.items.forEach((item) => validateTarget(item.target, index, issues, `${path}.items.${item.id}.target`));
      break;
    case "checklist":
      block.items.forEach((item) => validateEvidenceRefs(item.evidenceRefs, index, issues, `${path}.items.${item.id}.evidenceRefs`));
      break;
    case "criteria":
      block.criteria.forEach((item) => validateEvidenceRefs(item.evidenceRefs, index, issues, `${path}.criteria.${item.id}.evidenceRefs`));
      break;
    case "review_bundle":
      block.linkedTargets.forEach((target) => validateTarget(target, index, issues, `${path}.linkedTargets`));
      block.acceptanceCriteria.forEach((item) => validateEvidenceRefs(item.evidenceRefs, index, issues, `${path}.acceptanceCriteria.${item.id}.evidenceRefs`));
      validateTarget(block.prototypeRef?.target, index, issues, `${path}.prototypeRef.target`);
      block.reviewTrace?.changedTargets?.forEach((target) => validateTarget(target, index, issues, `${path}.reviewTrace.changedTargets`));
      break;
    case "prototype":
      for (const piece of block.pieces) {
        validateTarget(piece.primaryTarget, index, issues, `${path}.pieces.${piece.id}.primaryTarget`);
        piece.validates.forEach((target) => validateTarget(target, index, issues, `${path}.pieces.${piece.id}.validates`));
        validatePointer(piece.context, index, issues, `${path}.pieces.${piece.id}.context`);
      }
      break;
    case "choice_set":
      validateChoiceSet(block, index, issues, path);
      break;
    case "comparison":
      validateComparison(block, index, issues, path);
      break;
    case "evidence":
      block.items.forEach((item) => validatePointer(item.sourcePointer, index, issues, `${path}.items.${item.id}.sourcePointer`));
      break;
    case "synthesis":
      block.sourceBranchRefs?.forEach((target) => validateTarget(target, index, issues, `${path}.sourceBranchRefs`));
      block.entries.forEach((entry) => validateEvidenceRefs(entry.evidenceRefs, index, issues, `${path}.entries.${entry.id}.evidenceRefs`));
      validateEvidenceRefs(block.conclusionEvidenceRefs, index, issues, `${path}.conclusionEvidenceRefs`);
      validateSynthesisCoverage(block, issues, path);
      break;
    case "risk":
      block.risks.forEach((risk) => validateEvidenceRefs(risk.evidenceRefs, index, issues, `${path}.risks.${risk.id}.evidenceRefs`));
      break;
    case "checkpoint_outcome":
      block.determiningRefs.forEach((target) => validateTarget(target, index, issues, `${path}.determiningRefs`));
      break;
    case "changelog":
      for (const entry of block.entries) {
        entry.previousTargets?.forEach((target) => validateTarget(target, index, issues, `${path}.entries.${entry.id}.previousTargets`, "warning"));
        entry.changedTargets.forEach((target) => validateTarget(target, index, issues, `${path}.entries.${entry.id}.changedTargets`));
        entry.mappings?.forEach((mapping) => {
          mapping.previousTargets.forEach((target) => validateTarget(target, index, issues, `${path}.entries.${entry.id}.mappings.${mapping.id}.previousTargets`, "warning"));
          mapping.newTargets.forEach((target) => validateTarget(target, index, issues, `${path}.entries.${entry.id}.mappings.${mapping.id}.newTargets`));
          validateTargetMappingShape(mapping, issues, `${path}.entries.${entry.id}.mappings.${mapping.id}`);
        });
      }
      block.reviewTrace?.changedTargets?.forEach((target) => validateTarget(target, index, issues, `${path}.reviewTrace.changedTargets`));
      break;
    case "investigation":
      validateInvestigation(block, index, issues, path);
      break;
    case "migration":
      block.rollbackTargets?.forEach((target) => validateTarget(target, index, issues, `${path}.rollbackTargets`));
      block.rollbackPlans?.forEach((plan) => plan.targets.forEach((target) => validateTarget(target, index, issues, `${path}.rollbackPlans.${plan.id}.targets`)));
      block.steps.forEach((step) => step.verificationTargets?.forEach((target) => validateTarget(target, index, issues, `${path}.steps.${step.id}.verificationTargets`)));
      break;
    case "text":
    case "verification":
    case "artifact":
      break;
  }
}

type ChoiceSetBlock = Extract<GraphPlanBlock, { type: "choice_set" }>;
type ComparisonBlock = Extract<GraphPlanBlock, { type: "comparison" }>;
type InvestigationBlock = Extract<GraphPlanBlock, { type: "investigation" }>;
type SynthesisBlock = Extract<GraphPlanBlock, { type: "synthesis" }>;
type GraphRefBlock = Extract<GraphPlanBlock, { type: "graph_ref" }>;
type TargetMapping = {
  changeKind: "rename" | "split" | "merge" | "move" | "replace" | "delete" | "create";
  previousTargets: GraphPlanTarget[];
  newTargets: GraphPlanTarget[];
};

function validateOutputDefinitions(definitions: GraphPlanOutputDefinition[] | undefined, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string): void {
  const seen = new Set<string>();
  for (const definition of definitions ?? []) {
    if (seen.has(definition.key)) {
      addIssue(issues, "error", "duplicate_output_definition", `Duplicate output definition '${definition.key}'.`, `${path}.${definition.key}`);
    }
    validatePointer(definition.producedBy, index, issues, `${path}.${definition.key}.producedBy`);
    const producedByOutput = definition.producedBy ? outputDefinitionFor(definition.producedBy, index) : undefined;
    if (producedByOutput && producedByOutput.valueType !== definition.valueType) {
      addIssue(
        issues,
        "error",
        "produced_output_type_mismatch",
        `Produced output '${producedByOutput.key}' type '${producedByOutput.valueType}' does not match contract output '${definition.key}' type '${definition.valueType}'.`,
        `${path}.${definition.key}.producedBy`,
      );
    }
    seen.add(definition.key);
  }
}

function validateGraphContractOutputsProduced(graph: GraphPlanGraph, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string): void {
  const graphOutputKeys = new Set<string>();
  for (const node of graph.nodes) {
    for (const block of node.blocks) {
      for (const output of block.outputDefinitions ?? []) graphOutputKeys.add(output.key);
    }
  }

  for (const output of graph.contract?.outputs ?? []) {
    if (output.producedBy) continue;
    if (!graphOutputKeys.has(output.key)) {
      addIssue(
        issues,
        "warning",
        "graph_contract_output_not_produced",
        `Graph contract output '${output.key}' is not produced by any block outputDefinition in graph '${graph.id}'.`,
        `${path}.${output.key}`,
      );
    }
  }
}

function validateGraphRefBindings(
  block: GraphRefBlock,
  childGraph: GraphPlanGraph,
  index: ValidationIndex,
  issues: GraphPlanValidationIssue[],
  path: string,
): void {
  const inputKeys = new Set(childGraph.contract?.inputs?.map((input) => input.key) ?? []);
  const outputKeys = new Set(childGraph.contract?.outputs?.map((output) => output.key) ?? []);
  const inputsByKey = new Map(childGraph.contract?.inputs?.map((input) => [input.key, input]) ?? []);
  const outputsByKey = new Map(childGraph.contract?.outputs?.map((output) => [output.key, output]) ?? []);
  const boundInputKeys = new Set(block.inputBindings?.map((binding) => binding.key) ?? []);

  for (const binding of block.inputBindings ?? []) {
    if (!binding.source && !binding.target && !binding.targetPointer) {
      addIssue(issues, "warning", "empty_graph_contract_binding", `Input binding '${binding.key}' has no source or target.`, `${path}.inputBindings.${binding.key}`);
    }
    if (!inputKeys.has(binding.key)) {
      addIssue(issues, "error", "missing_graph_contract_input", `Input binding '${binding.key}' is not declared by graph '${childGraph.id}'.`, `${path}.inputBindings.${binding.key}`);
    }
    validatePointer(binding.source, index, issues, `${path}.inputBindings.${binding.key}.source`);
    validateTarget(binding.target, index, issues, `${path}.inputBindings.${binding.key}.target`);
    validatePointer(binding.targetPointer, index, issues, `${path}.inputBindings.${binding.key}.targetPointer`);
    validateBindingType(binding.source, inputsByKey.get(binding.key), index, issues, `${path}.inputBindings.${binding.key}.source`);
    validateBindingType(binding.targetPointer, inputsByKey.get(binding.key), index, issues, `${path}.inputBindings.${binding.key}.targetPointer`);
  }

  for (const input of childGraph.contract?.inputs ?? []) {
    if (input.required && !boundInputKeys.has(input.key)) {
      addIssue(issues, "warning", "required_graph_input_unbound", `Required graph input '${input.key}' is not bound by graph_ref '${block.id}'.`, `${path}.inputBindings.${input.key}`);
    }
  }

  for (const binding of block.outputBindings ?? []) {
    if (!binding.source && !binding.target && !binding.targetPointer) {
      addIssue(issues, "warning", "empty_graph_contract_binding", `Output binding '${binding.key}' has no source or target.`, `${path}.outputBindings.${binding.key}`);
    }
    if (!outputKeys.has(binding.key)) {
      addIssue(issues, "error", "missing_graph_contract_output", `Output binding '${binding.key}' is not declared by graph '${childGraph.id}'.`, `${path}.outputBindings.${binding.key}`);
    }
    validatePointer(binding.source, index, issues, `${path}.outputBindings.${binding.key}.source`);
    validateTarget(binding.target, index, issues, `${path}.outputBindings.${binding.key}.target`);
    validatePointer(binding.targetPointer, index, issues, `${path}.outputBindings.${binding.key}.targetPointer`);
    validateBindingType(binding.source, outputsByKey.get(binding.key), index, issues, `${path}.outputBindings.${binding.key}.source`);
    validateBindingType(binding.targetPointer, outputsByKey.get(binding.key), index, issues, `${path}.outputBindings.${binding.key}.targetPointer`);
    validateBindingTargetOutput(binding.target, binding.key, index, issues, `${path}.outputBindings.${binding.key}.target`);
  }
}

function validateBindingType(
  source: GraphPlanPointer | undefined,
  contractDefinition: GraphPlanOutputDefinition | undefined,
  index: ValidationIndex,
  issues: GraphPlanValidationIssue[],
  path: string,
): void {
  if (!source || !contractDefinition) return;
  const sourceOutput = outputDefinitionFor(source, index);
  if (!sourceOutput) return;
  if (sourceOutput.valueType !== contractDefinition.valueType) {
    addIssue(
      issues,
      "error",
      "graph_contract_binding_type_mismatch",
      `Binding source output '${sourceOutput.key}' type '${sourceOutput.valueType}' does not match contract key '${contractDefinition.key}' type '${contractDefinition.valueType}'.`,
      path,
    );
  }
}

function validateBindingTargetOutput(
  target: GraphPlanTarget | undefined,
  outputKey: string,
  index: ValidationIndex,
  issues: GraphPlanValidationIssue[],
  path: string,
): void {
  if (!target || target.type !== "block") return;
  const outputs = index.blockOutputs.get(blockKeyFor(target.graphId, target.nodeId, target.blockId));
  if (outputs && !outputs.has(outputKey)) {
    addIssue(
      issues,
      "warning",
      "graph_contract_binding_target_output_missing",
      `Output binding target block does not declare output '${outputKey}'. Use targetPointer to bind a specific parent output when names differ.`,
      path,
    );
  }
}

function validateCondition(condition: GraphPlanGraph["edges"][number]["condition"] | undefined, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string): void {
  if (!condition) return;
  if ("all" in condition) {
    condition.all.forEach((child, indexInCondition) => validateCondition(child, index, issues, `${path}.all.${indexInCondition}`));
    return;
  }
  if ("any" in condition) {
    condition.any.forEach((child, indexInCondition) => validateCondition(child, index, issues, `${path}.any.${indexInCondition}`));
    return;
  }
  if ("not" in condition) {
    validateCondition(condition.not, index, issues, `${path}.not`);
    return;
  }

  validatePointer(condition.source, index, issues, `${path}.source`);
  validateConditionValue(condition, index, issues, path);
}

function validateConditionValue(
  condition: Extract<GraphPlanGraph["edges"][number]["condition"], { source: GraphPlanPointer }>,
  index: ValidationIndex,
  issues: GraphPlanValidationIssue[],
  path: string,
): void {
  const output = outputDefinitionFor(condition.source, index);
  if (!output) return;

  if (condition.value !== undefined && output.allowedValues && !output.allowedValues.some((allowed) => JSON.stringify(allowed) === JSON.stringify(condition.value))) {
    addIssue(issues, "error", "condition_value_not_allowed", `Condition value is not listed in output '${output.key}' allowedValues.`, `${path}.value`);
  }

  if (condition.value !== undefined && !valueMatchesOutputType(condition.value, output.valueType)) {
    addIssue(issues, "error", "condition_value_type_mismatch", `Condition value does not match output '${output.key}' type '${output.valueType}'.`, `${path}.value`);
  }

  const numericOperators = ["greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal"];
  if (numericOperators.includes(condition.operator) && output.valueType !== "number") {
    addIssue(issues, "error", "condition_operator_type_mismatch", `Operator '${condition.operator}' requires a number output.`, `${path}.operator`);
  }
  if (condition.operator === "contains" && !["string", "multi_choice", "array", "object"].includes(output.valueType)) {
    addIssue(issues, "error", "condition_operator_type_mismatch", "Operator 'contains' requires string, multi_choice, array, or object output.", `${path}.operator`);
  }
}

function outputDefinitionFor(pointer: GraphPlanPointer, index: ValidationIndex): GraphPlanOutputDefinition | undefined {
  if (!pointer.graphId || !pointer.nodeId || !pointer.blockId || !pointer.outputKey) return undefined;
  return index.blockOutputs.get(blockKeyFor(pointer.graphId, pointer.nodeId, pointer.blockId))?.get(pointer.outputKey);
}

function valueMatchesOutputType(value: unknown, valueType: GraphPlanOutputDefinition["valueType"]): boolean {
  switch (valueType) {
    case "string":
    case "single_choice":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "multi_choice":
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

function validateRuntimeOutput(target: GraphPlanPointer, value: unknown, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string): void {
  validatePointer(target, index, issues, `${path}.target`);
  const output = outputDefinitionFor(target, index);
  if (!output) return;
  if (!valueMatchesOutputType(value, output.valueType)) {
    addIssue(issues, "error", "runtime_output_value_type_mismatch", `Runtime output value does not match output '${output.key}' type '${output.valueType}'.`, `${path}.value`);
  }
  if (output.allowedValues && !output.allowedValues.some((allowed) => JSON.stringify(allowed) === JSON.stringify(value))) {
    addIssue(issues, "error", "runtime_output_value_not_allowed", `Runtime output value is not listed in output '${output.key}' allowedValues.`, `${path}.value`);
  }
}

function validateChoiceSet(block: ChoiceSetBlock, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string): void {
  const selected = block.selectedOptionId ? block.options.find((option) => option.id === block.selectedOptionId) : undefined;
  if (block.selectedOptionId && !selected) {
    addIssue(issues, "error", "missing_selected_option", `Selected option '${block.selectedOptionId}' does not exist.`, `${path}.selectedOptionId`);
  }

  for (const option of block.options) {
    validateTarget(option.downstreamTarget, index, issues, `${path}.options.${option.id}.downstreamTarget`);
    if (option.downstreamGraphId && !index.graphs.has(option.downstreamGraphId)) {
      addIssue(issues, "error", "missing_downstream_graph", `Downstream graph '${option.downstreamGraphId}' does not exist.`, `${path}.options.${option.id}.downstreamGraphId`);
    }
    if (option.id === block.selectedOptionId && option.status !== "selected") {
      addIssue(issues, "warning", "selected_option_status_mismatch", `Selected option '${option.id}' should have status 'selected'.`, `${path}.options.${option.id}.status`);
    }
  }
}

function validateComparison(block: ComparisonBlock, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string): void {
  if (block.selectedOptionId && !block.options.some((option) => option.id === block.selectedOptionId)) {
    addIssue(issues, "error", "missing_selected_comparison_option", `Selected comparison option '${block.selectedOptionId}' does not exist.`, `${path}.selectedOptionId`);
  }

  for (const option of block.options) {
    validateTarget(option.downstreamTarget, index, issues, `${path}.options.${option.id}.downstreamTarget`);
    if (option.downstreamGraphId && !index.graphs.has(option.downstreamGraphId)) {
      addIssue(issues, "error", "missing_comparison_downstream_graph", `Downstream graph '${option.downstreamGraphId}' does not exist.`, `${path}.options.${option.id}.downstreamGraphId`);
    }
  }

  for (const score of block.scores) {
    if (!block.options.some((option) => option.id === score.optionId)) {
      addIssue(issues, "error", "missing_score_option", `Score references missing option '${score.optionId}'.`, `${path}.scores.${score.id ?? `${score.optionId}-${score.criterionId}`}`);
    }
    if (!block.criteria.some((criterion) => criterion.id === score.criterionId)) {
      addIssue(issues, "error", "missing_score_criterion", `Score references missing criterion '${score.criterionId}'.`, `${path}.scores.${score.id ?? `${score.optionId}-${score.criterionId}`}`);
    }
    validateEvidenceRefs(score.evidenceRefs, index, issues, `${path}.scores.${score.id ?? `${score.optionId}-${score.criterionId}`}.evidenceRefs`);
  }
}

function validateInvestigation(block: InvestigationBlock, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string): void {
  const hypothesisIds = new Set(block.hypotheses.map((hypothesis) => hypothesis.id));
  block.hypotheses.forEach((hypothesis) => validateEvidenceRefs(hypothesis.evidenceRefs, index, issues, `${path}.hypotheses.${hypothesis.id}.evidenceRefs`));

  for (const experiment of block.experiments) {
    if (!hypothesisIds.has(experiment.hypothesisId)) {
      addIssue(issues, "error", "missing_experiment_hypothesis", `Experiment '${experiment.id}' references missing hypothesis '${experiment.hypothesisId}'.`, `${path}.experiments.${experiment.id}.hypothesisId`);
    }
    if (experiment.procedureGraphId && !index.graphs.has(experiment.procedureGraphId)) {
      addIssue(issues, "error", "missing_experiment_procedure_graph", `Procedure graph '${experiment.procedureGraphId}' does not exist.`, `${path}.experiments.${experiment.id}.procedureGraphId`);
    }
    validateTarget(experiment.procedureTarget, index, issues, `${path}.experiments.${experiment.id}.procedureTarget`);
  }

  block.observations.forEach((observation) => validateEvidenceRefs(observation.evidenceRefs, index, issues, `${path}.observations.${observation.id}.evidenceRefs`));
}

function validateSynthesisCoverage(block: SynthesisBlock, issues: GraphPlanValidationIssue[], path: string): void {
  if (block.joinPolicy !== "all" || !block.sourceBranchRefs?.length) return;

  const citedGraphIds = new Set<string>();
  for (const entry of block.entries) {
    for (const ref of entry.evidenceRefs) {
      if (typeof ref !== "string") citedGraphIds.add(ref.graphId);
    }
  }
  for (const ref of block.conclusionEvidenceRefs ?? []) {
    if (typeof ref !== "string") citedGraphIds.add(ref.graphId);
  }

  for (const source of block.sourceBranchRefs) {
    if (source.type !== "graph") continue;
    if (!citedGraphIds.has(source.graphId)) {
      addIssue(
        issues,
        "warning",
        "synthesis_missing_branch_evidence",
        `Synthesis joinPolicy 'all' lists source branch '${source.graphId}' but cites no evidence from that graph.`,
        `${path}.sourceBranchRefs.${source.graphId}`,
      );
    }
  }
}

function validateTargetMappingShape(mapping: TargetMapping, issues: GraphPlanValidationIssue[], path: string): void {
  if (mapping.changeKind === "split" && mapping.previousTargets.length !== 1) {
    addIssue(issues, "warning", "split_mapping_previous_count", "Split mappings should usually have exactly one previous target.", path);
  }
  if (mapping.changeKind === "split" && mapping.newTargets.length < 2) {
    addIssue(issues, "warning", "split_mapping_new_count", "Split mappings should have at least two new targets.", path);
  }
  if (mapping.changeKind === "merge" && mapping.previousTargets.length < 2) {
    addIssue(issues, "warning", "merge_mapping_previous_count", "Merge mappings should have at least two previous targets.", path);
  }
  if (mapping.changeKind === "merge" && mapping.newTargets.length !== 1) {
    addIssue(issues, "warning", "merge_mapping_new_count", "Merge mappings should usually have exactly one new target.", path);
  }
}

function validateEvidenceRefs(refs: Array<string | { graphId: string; nodeId?: string; blockId: string; itemId: string }> | undefined, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string): void {
  for (const ref of refs ?? []) {
    if (typeof ref === "string") {
      addIssue(issues, "warning", "untyped_evidence_ref", `Evidence ref '${ref}' is not path-aware and cannot be validated.`, path);
      continue;
    }
    const key = blockItemKeyFor(ref.graphId, ref.nodeId ?? "*", ref.blockId, ref.itemId);
    if (ref.nodeId) {
      if (!index.blockItems.has(key)) {
        addIssue(issues, "error", "missing_evidence_ref", `Evidence ref '${ref.graphId}/${ref.blockId}/${ref.itemId}' does not resolve.`, path);
      }
      continue;
    }
    const matching = [...index.blockItems.keys()].some((itemKey) => itemKey.startsWith(`graph:${ref.graphId}/node:`) && itemKey.endsWith(`/block:${ref.blockId}/item:${ref.itemId}`));
    if (!matching) {
      addIssue(issues, "error", "missing_evidence_ref", `Evidence ref '${ref.graphId}/${ref.blockId}/${ref.itemId}' does not resolve.`, path);
    }
  }
}

function validateTarget(target: GraphPlanTarget | undefined, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string, severity: "error" | "warning" = "error"): void {
  if (!target) return;

  switch (target.type) {
    case "plan":
      return;
    case "graph":
      if (!index.graphs.has(target.graphId)) addIssue(issues, severity, "missing_target_graph", `Target graph '${target.graphId}' does not exist.`, path, { target });
      return;
    case "node":
      if (!index.nodes.has(nodeKeyFor(target.graphId, target.nodeId))) addIssue(issues, severity, "missing_target_node", `Target node '${target.graphId}/${target.nodeId}' does not exist.`, path, { target });
      return;
    case "block":
      if (!index.blocks.has(blockKeyFor(target.graphId, target.nodeId, target.blockId))) addIssue(issues, severity, "missing_target_block", `Target block '${target.graphId}/${target.nodeId}/${target.blockId}' does not exist.`, path, { target });
      return;
    case "artifact_range":
      if (!index.blockItems.has(blockItemKeyFor(target.graphId, target.nodeId, target.blockId, target.artifactId))) {
        addIssue(issues, severity, "missing_target_artifact_range", `Target artifact range '${target.graphId}/${target.nodeId}/${target.blockId}/${target.artifactId}' does not exist.`, path, { target });
      }
      validateArtifactRangePath(target, index, issues, path);
      if (target.lineStart && target.lineEnd && target.lineEnd < target.lineStart) {
        addIssue(issues, "error", "invalid_artifact_line_range", "Artifact range lineEnd must be greater than or equal to lineStart.", path, { target });
      }
      if (target.charStart !== undefined && target.charEnd !== undefined && target.charEnd < target.charStart) {
        addIssue(issues, "error", "invalid_artifact_char_range", "Artifact range charEnd must be greater than or equal to charStart.", path, { target });
      }
      return;
    case "block_item":
      if (!index.blockItems.has(blockItemKeyFor(target.graphId, target.nodeId, target.blockId, target.itemId))) {
        addIssue(issues, severity, "missing_target_block_item", `Target block item '${target.graphId}/${target.nodeId}/${target.blockId}/${target.itemId}' does not exist.`, path, { target });
        return;
      }
      if (target.itemType) {
        const item = index.blockItems.get(blockItemKeyFor(target.graphId, target.nodeId, target.blockId, target.itemId));
        if (item?.type && item.type !== target.itemType && !(item.type === "prototype_piece" && target.itemType === "artifact")) {
          addIssue(issues, "warning", "target_block_item_type_mismatch", `Target item type '${target.itemType}' does not match indexed item type '${item.type}'.`, path, { target });
        }
      }
      return;
    case "edge":
      if (!index.edges.has(edgeKeyFor(target.graphId, target.edgeId))) addIssue(issues, severity, "missing_target_edge", `Target edge '${target.graphId}/${target.edgeId}' does not exist.`, path, { target });
      return;
    case "prototype_piece":
      if (!index.prototypePieces.has(prototypePieceKeyFor(target.graphId, target.nodeId, target.blockId, target.prototypeId, target.pieceId))) {
        addIssue(issues, severity, "missing_target_prototype_piece", `Target prototype piece '${target.prototypeId}/${target.pieceId}' does not exist.`, path, { target });
      }
      return;
  }
}

function validateArtifactRangePath(
  target: Extract<GraphPlanTarget, { type: "artifact_range" }>,
  index: ValidationIndex,
  issues: GraphPlanValidationIssue[],
  path: string,
): void {
  if (!target.path) return;
  const block = index.blocks.get(blockKeyFor(target.graphId, target.nodeId, target.blockId));
  if (!block || block.type !== "artifact") return;
  const artifact = block.artifacts.find((item) => item.id === target.artifactId);
  if (artifact?.kind !== "file" && artifact?.kind !== "generated_output") return;
  if (artifact.ref !== target.path) {
    addIssue(
      issues,
      "warning",
      "artifact_range_path_mismatch",
      `Artifact range path '${target.path}' does not match artifact ref '${artifact.ref}'.`,
      path,
      { target },
    );
  }
}

function validatePointer(pointer: GraphPlanPointer | undefined, index: ValidationIndex, issues: GraphPlanValidationIssue[], path: string): void {
  if (!pointer) return;
  if (!pointerExists(pointer, index)) {
    addIssue(issues, "error", "missing_pointer", "Pointer does not resolve.", path, { pointer });
    return;
  }
  if (pointer.outputKey && pointer.graphId && pointer.nodeId && pointer.blockId) {
    const blockKey = blockKeyFor(pointer.graphId, pointer.nodeId, pointer.blockId);
    const outputs = index.blockOutputs.get(blockKey);
    if (outputs && !outputs.has(pointer.outputKey)) {
      addIssue(issues, "error", "missing_output_definition", `Pointer outputKey '${pointer.outputKey}' is not defined by the source block.`, path, { pointer });
    }
  }
}

function pointerExists(pointer: GraphPlanPointer, index: ValidationIndex): boolean {
  if (pointer.itemId && pointer.graphId && pointer.nodeId && pointer.blockId) return index.blockItems.has(blockItemKeyFor(pointer.graphId, pointer.nodeId, pointer.blockId, pointer.itemId));
  if (pointer.blockId && pointer.graphId && pointer.nodeId) return index.blocks.has(blockKeyFor(pointer.graphId, pointer.nodeId, pointer.blockId));
  if (pointer.nodeId && pointer.graphId) return index.nodes.has(nodeKeyFor(pointer.graphId, pointer.nodeId));
  if (pointer.graphId) return index.graphs.has(pointer.graphId);
  return true;
}

function addIssue(
  issues: GraphPlanValidationIssue[],
  severity: "error" | "warning",
  code: GraphPlanIssueCode,
  message: string,
  path: string,
  refs: Pick<GraphPlanValidationIssue, "target" | "pointer"> = {},
): void {
  issues.push({ severity, code, category: categoryForGraphPlanIssue(code), message, path, ...refs });
}

function nodeKeyFor(graphId: string, nodeId: string): string {
  return `graph:${graphId}/node:${nodeId}`;
}

function blockKeyFor(graphId: string, nodeId: string, blockId: string): string {
  return `${nodeKeyFor(graphId, nodeId)}/block:${blockId}`;
}

function blockItemKeyFor(graphId: string, nodeId: string, blockId: string, itemId: string): string {
  return `${blockKeyFor(graphId, nodeId, blockId)}/item:${itemId}`;
}

function edgeKeyFor(graphId: string, edgeId: string): string {
  return `graph:${graphId}/edge:${edgeId}`;
}

function prototypePieceKeyFor(graphId: string, nodeId: string, blockId: string, prototypeId: string, pieceId: string): string {
  return `${blockKeyFor(graphId, nodeId, blockId)}/prototype:${prototypeId}/piece:${pieceId}`;
}
