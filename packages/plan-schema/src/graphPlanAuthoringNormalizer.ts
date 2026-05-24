import { graphPlanDocumentSchema } from "./graphPlan";
import { validateGraphPlan, type GraphPlanValidationMode } from "./graphPlanSemanticValidator";

export function normalizeGraphPlanForAuthoring(graphPlan: unknown, mode: GraphPlanValidationMode = "draft") {
  const parsed = graphPlanDocumentSchema.safeParse(graphPlan);
  if (!parsed.success) {
    return {
      graphPlan,
      changes: [],
      schemaIssues: parsed.error.issues,
      validation: null,
    };
  }
  return {
    graphPlan: parsed.data,
    changes: [],
    schemaIssues: [],
    validation: validateGraphPlan(parsed.data, { mode }),
  };
}
