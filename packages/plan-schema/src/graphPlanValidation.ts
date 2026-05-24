import { z } from "zod";
import { graphPlanTargetSchema } from "./graphPlan";

export const graphPlanIssueCategorySchema = z.enum(["identity", "reference", "target", "iframe"]);

export const graphPlanIssueCodes = [
  "duplicate_graph_id",
  "missing_root_graph",
  "duplicate_node_id",
  "duplicate_edge_id",
  "duplicate_iframe_id",
  "missing_edge_from",
  "missing_edge_to",
  "missing_subgraph",
  "missing_graph_parent",
  "subgraph_parent_mismatch",
  "parent_subgraph_not_declared",
  "missing_target_graph",
  "missing_target_node",
  "missing_target_edge",
  "missing_target_iframe",
] as const;

export const graphPlanIssueCodeSchema = z.enum(graphPlanIssueCodes);
export const graphPlanValidationModeSchema = z.enum(["draft", "publish"]);

export type GraphPlanIssueCategory = z.infer<typeof graphPlanIssueCategorySchema>;
export type GraphPlanIssueCode = (typeof graphPlanIssueCodes)[number];
export type GraphPlanValidationMode = z.infer<typeof graphPlanValidationModeSchema>;

export const graphPlanIssueCategoryByCode = {
  duplicate_graph_id: "identity",
  missing_root_graph: "identity",
  duplicate_node_id: "identity",
  duplicate_edge_id: "identity",
  duplicate_iframe_id: "identity",
  missing_edge_from: "reference",
  missing_edge_to: "reference",
  missing_subgraph: "reference",
  missing_graph_parent: "reference",
  subgraph_parent_mismatch: "reference",
  parent_subgraph_not_declared: "reference",
  missing_target_graph: "target",
  missing_target_node: "target",
  missing_target_edge: "target",
  missing_target_iframe: "target",
} satisfies Record<GraphPlanIssueCode, GraphPlanIssueCategory>;

export const graphPlanValidationIssueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  code: graphPlanIssueCodeSchema,
  category: graphPlanIssueCategorySchema,
  message: z.string(),
  path: z.string(),
  target: graphPlanTargetSchema.optional(),
});

export const graphPlanValidationSummarySchema = z.object({
  mode: graphPlanValidationModeSchema,
  checkedAt: z.string(),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  publishReady: z.boolean(),
  issues: z.array(graphPlanValidationIssueSchema),
});

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
