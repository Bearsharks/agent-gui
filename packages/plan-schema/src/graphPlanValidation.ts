import { z } from "zod";
import { graphPlanPointerSchema, graphPlanTargetSchema } from "./graphPlan";

export const graphPlanIssueCategorySchema = z.enum([
  "identity",
  "reference",
  "target",
  "graph_contract",
  "condition",
  "runtime",
  "artifact",
  "revision_lineage",
  "authoring_quality",
]);

export const graphPlanIssueCodes = [
  "duplicate_graph_id",
  "duplicate_node_id",
  "duplicate_block_id",
  "duplicate_edge_id",
  "duplicate_output_definition",
  "missing_root_graph",
  "missing_pointer",
  "missing_output_definition",
  "missing_graph_ref",
  "missing_owned_graph",
  "missing_graph_owner",
  "missing_edge_from",
  "missing_edge_to",
  "owned_graph_owner_mismatch",
  "graph_ref_owner_mismatch",
  "owned_graph_ref_not_declared",
  "missing_target_graph",
  "missing_target_node",
  "missing_target_block",
  "missing_target_block_item",
  "missing_target_edge",
  "missing_target_prototype_piece",
  "target_block_item_type_mismatch",
  "missing_graph_contract_input",
  "missing_graph_contract_output",
  "required_graph_input_unbound",
  "empty_graph_contract_binding",
  "graph_contract_output_not_produced",
  "graph_contract_binding_type_mismatch",
  "graph_contract_binding_target_output_missing",
  "produced_output_type_mismatch",
  "condition_value_not_allowed",
  "condition_value_type_mismatch",
  "condition_operator_type_mismatch",
  "missing_selected_option",
  "missing_selected_comparison_option",
  "missing_downstream_graph",
  "missing_comparison_downstream_graph",
  "missing_score_option",
  "missing_score_criterion",
  "selected_option_status_mismatch",
  "runtime_document_mismatch",
  "runtime_output_value_type_mismatch",
  "runtime_output_value_not_allowed",
  "runtime_current_node_missing",
  "missing_target_artifact_range",
  "invalid_artifact_line_range",
  "invalid_artifact_char_range",
  "artifact_range_path_mismatch",
  "split_mapping_previous_count",
  "split_mapping_new_count",
  "merge_mapping_previous_count",
  "merge_mapping_new_count",
  "untyped_evidence_ref",
  "missing_evidence_ref",
  "synthesis_missing_branch_evidence",
  "missing_experiment_hypothesis",
  "missing_experiment_procedure_graph",
] as const;

export const graphPlanIssueCodeSchema = z.enum(graphPlanIssueCodes);

export type GraphPlanIssueCategory = z.infer<typeof graphPlanIssueCategorySchema>;
export type GraphPlanIssueCode = (typeof graphPlanIssueCodes)[number];

export const graphPlanIssueCategoryByCode = {
  duplicate_graph_id: "identity",
  duplicate_node_id: "identity",
  duplicate_block_id: "identity",
  duplicate_edge_id: "identity",
  duplicate_output_definition: "identity",
  missing_root_graph: "identity",
  missing_pointer: "reference",
  missing_output_definition: "reference",
  missing_graph_ref: "reference",
  missing_owned_graph: "reference",
  missing_graph_owner: "reference",
  missing_edge_from: "reference",
  missing_edge_to: "reference",
  owned_graph_owner_mismatch: "reference",
  graph_ref_owner_mismatch: "reference",
  owned_graph_ref_not_declared: "reference",
  missing_target_graph: "target",
  missing_target_node: "target",
  missing_target_block: "target",
  missing_target_block_item: "target",
  missing_target_edge: "target",
  missing_target_prototype_piece: "target",
  target_block_item_type_mismatch: "target",
  missing_graph_contract_input: "graph_contract",
  missing_graph_contract_output: "graph_contract",
  required_graph_input_unbound: "graph_contract",
  empty_graph_contract_binding: "graph_contract",
  graph_contract_output_not_produced: "graph_contract",
  graph_contract_binding_type_mismatch: "graph_contract",
  graph_contract_binding_target_output_missing: "graph_contract",
  produced_output_type_mismatch: "graph_contract",
  condition_value_not_allowed: "condition",
  condition_value_type_mismatch: "condition",
  condition_operator_type_mismatch: "condition",
  missing_selected_option: "condition",
  missing_selected_comparison_option: "condition",
  missing_downstream_graph: "condition",
  missing_comparison_downstream_graph: "condition",
  missing_score_option: "condition",
  missing_score_criterion: "condition",
  selected_option_status_mismatch: "condition",
  runtime_document_mismatch: "runtime",
  runtime_output_value_type_mismatch: "runtime",
  runtime_output_value_not_allowed: "runtime",
  runtime_current_node_missing: "runtime",
  missing_target_artifact_range: "artifact",
  invalid_artifact_line_range: "artifact",
  invalid_artifact_char_range: "artifact",
  artifact_range_path_mismatch: "artifact",
  split_mapping_previous_count: "revision_lineage",
  split_mapping_new_count: "revision_lineage",
  merge_mapping_previous_count: "revision_lineage",
  merge_mapping_new_count: "revision_lineage",
  untyped_evidence_ref: "authoring_quality",
  missing_evidence_ref: "authoring_quality",
  synthesis_missing_branch_evidence: "authoring_quality",
  missing_experiment_hypothesis: "authoring_quality",
  missing_experiment_procedure_graph: "authoring_quality",
} satisfies Record<GraphPlanIssueCode, GraphPlanIssueCategory>;

export const graphPlanValidationModeSchema = z.enum(["draft", "publish"]);

export const graphPlanValidationIssueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  code: graphPlanIssueCodeSchema,
  category: graphPlanIssueCategorySchema,
  message: z.string(),
  path: z.string(),
  target: graphPlanTargetSchema.optional(),
  pointer: graphPlanPointerSchema.optional(),
});

export const graphPlanValidationSummarySchema = z.object({
  mode: graphPlanValidationModeSchema,
  checkedAt: z.string(),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  publishReady: z.boolean(),
  issues: z.array(graphPlanValidationIssueSchema),
});

export type GraphPlanValidationMode = z.infer<typeof graphPlanValidationModeSchema>;
export type GraphPlanValidationIssue = z.infer<typeof graphPlanValidationIssueSchema>;
export type GraphPlanValidationSummary = z.infer<typeof graphPlanValidationSummarySchema>;

export function categoryForGraphPlanIssue(code: GraphPlanIssueCode): GraphPlanIssueCategory {
  return graphPlanIssueCategoryByCode[code];
}

export function summarizeGraphPlanValidation(
  issues: GraphPlanValidationIssue[],
  mode: GraphPlanValidationMode = "draft",
  checkedAt = new Date().toISOString(),
): GraphPlanValidationSummary {
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  return {
    mode,
    checkedAt,
    errorCount,
    warningCount,
    publishReady: errorCount === 0,
    issues,
  };
}

