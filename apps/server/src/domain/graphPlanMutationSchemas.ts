import {
  graphPlanMutationInputSchema,
  graphPlanMutationOperationSchema,
  graphPlanTargetSchema,
  type GraphPlanMutationInput,
  type GraphPlanMutationOperation,
  type GraphPlanTarget,
} from "@agent-gui/plan-schema";

export const serverGraphPlanTargetSchema = graphPlanTargetSchema;
export const serverGraphPlanMutationOperationSchema = graphPlanMutationOperationSchema;
export const serverGraphPlanMutationInputSchema = graphPlanMutationInputSchema;

export type ServerGraphPlanTarget = GraphPlanTarget;
export type ServerGraphPlanMutationOperation = GraphPlanMutationOperation;
export type ServerGraphPlanMutationInput = GraphPlanMutationInput;
