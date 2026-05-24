import {
  graphPlanChangeSummarySchema,
  graphPlanIframeSchema as planGraphPlanIframeSchema,
  graphPlanMutationOperationSchema,
  graphPlanTargetSchema,
  validationPolicySchema,
  type GraphPlanIframe,
  type GraphPlanTarget,
} from "@agent-gui/plan-schema";
import { z } from "zod";

export const graphPlanIframeSchema = planGraphPlanIframeSchema;
export const serverGraphPlanTargetSchema = graphPlanTargetSchema;
export const graphPlanIframeTargetSchema = z.object({
  type: z.literal("iframe"),
  graphId: z.string(),
  nodeId: z.string(),
  iframeId: z.string(),
});

const nodeTargetSchema = z.object({
  type: z.literal("node"),
  graphId: z.string(),
  nodeId: z.string(),
});

export const graphPlanIframeMutationOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_iframe"),
    target: nodeTargetSchema,
    iframe: graphPlanIframeSchema,
  }),
  z.object({
    op: z.literal("update_iframe"),
    target: graphPlanIframeTargetSchema,
    fields: graphPlanIframeSchema.omit({ id: true }).partial(),
  }),
  z.object({
    op: z.literal("remove_iframe"),
    target: graphPlanIframeTargetSchema,
  }),
]);

export const serverGraphPlanMutationOperationSchema = z.union([
  graphPlanMutationOperationSchema,
  graphPlanIframeMutationOperationSchema,
]);

export const serverGraphPlanMutationInputSchema = z.object({
  sessionId: z.string(),
  baseRevision: z.number().int().positive(),
  mode: z.literal("atomic").default("atomic"),
  operations: z.array(serverGraphPlanMutationOperationSchema).min(1),
  changeSummary: graphPlanChangeSummarySchema,
  validationPolicy: validationPolicySchema.default("block_errors"),
});

export type { GraphPlanIframe };
export type GraphPlanIframeTarget = Extract<GraphPlanTarget, { type: "iframe" }>;
export type ServerGraphPlanTarget = GraphPlanTarget;
export type ServerGraphPlanMutationOperation = z.infer<typeof serverGraphPlanMutationOperationSchema>;
export type ServerGraphPlanMutationInput = z.infer<typeof serverGraphPlanMutationInputSchema>;
