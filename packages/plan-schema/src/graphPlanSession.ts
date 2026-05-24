import { z } from "zod";
import {
  graphPlanDocumentSchema,
  graphPlanEdgeSchema,
  graphPlanGraphSchema,
  graphPlanIframeSchema,
  graphPlanNodeSchema,
  graphPlanTargetSchema,
} from "./graphPlan";
import { graphPlanValidationSummarySchema } from "./graphPlanValidation";

export const graphPlanSessionStatusSchema = z.enum(["draft", "needs_agent", "agent_replied", "revision_ready", "approved", "rejected"]);
export const feedbackDispositionSchema = z.enum(["open", "answered", "incorporated_in_revision", "rejected", "needs_user_clarification"]);
export const graphPlanFeedbackIntentSchema = z.enum(["revise", "simplify", "rename", "question"]).optional();

export const graphPlanChangeSummarySchema = z.object({
  structure: z.array(z.string()).default([]),
  content: z.array(z.string()).default([]),
  validation: z.array(z.string()).default([]),
});

export const userFeedbackEventSchema = z.object({
  id: z.string(),
  type: z.literal("user.feedback"),
  sessionId: z.string(),
  revision: z.number().int().positive(),
  target: graphPlanTargetSchema,
  intent: graphPlanFeedbackIntentSchema,
  message: z.string(),
  createdAt: z.string(),
});

export const agentReplyEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.reply"),
  sessionId: z.string(),
  revision: z.number().int().positive(),
  replyToEventId: z.string(),
  target: graphPlanTargetSchema,
  body: z.string(),
  disposition: feedbackDispositionSchema.optional(),
  createdAt: z.string(),
});

export const agentRevisionEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.revision"),
  sessionId: z.string(),
  fromRevision: z.number().int().positive(),
  toRevision: z.number().int().positive(),
  target: graphPlanTargetSchema.optional(),
  changeSummary: graphPlanChangeSummarySchema,
  validation: graphPlanValidationSummarySchema,
  createdAt: z.string(),
});

export const userApprovalEventSchema = z.object({
  id: z.string(),
  type: z.literal("user.approval"),
  sessionId: z.string(),
  revision: z.number().int().positive(),
  message: z.string().optional(),
  createdAt: z.string(),
});

export const planEventSchema = z.discriminatedUnion("type", [userFeedbackEventSchema, agentReplyEventSchema, agentRevisionEventSchema, userApprovalEventSchema]);

export const planSessionSchema = z.object({
  id: z.string(),
  status: graphPlanSessionStatusSchema,
  revision: z.number().int().positive(),
  graphPlan: graphPlanDocumentSchema,
  validation: graphPlanValidationSummarySchema,
  events: z.array(planEventSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const validationPolicySchema = z.enum(["allow_all", "block_errors"]);

export const replaceGraphPlanInputSchema = z.object({
  sessionId: z.string(),
  baseRevision: z.number().int().positive(),
  graphPlan: graphPlanDocumentSchema,
  changeSummary: graphPlanChangeSummarySchema,
  replacementRationale: z.string().min(20),
  validationPolicy: validationPolicySchema.default("block_errors"),
});

export const graphPlanMutationOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("replace_document"), graphPlan: graphPlanDocumentSchema }),
  z.object({
    op: z.literal("update_graph"),
    target: z.object({ type: z.literal("graph"), graphId: z.string() }),
    fields: graphPlanGraphSchema.omit({ id: true, nodes: true, edges: true }).partial(),
  }),
  z.object({
    op: z.literal("add_graph"),
    graph: graphPlanGraphSchema,
  }),
  z.object({
    op: z.literal("remove_graph"),
    target: z.object({ type: z.literal("graph"), graphId: z.string() }),
  }),
  z.object({
    op: z.literal("update_node"),
    target: z.object({ type: z.literal("node"), graphId: z.string(), nodeId: z.string() }),
    fields: graphPlanNodeSchema.omit({ id: true }).partial(),
  }),
  z.object({ op: z.literal("add_node"), graphId: z.string(), node: graphPlanNodeSchema }),
  z.object({ op: z.literal("remove_node"), target: z.object({ type: z.literal("node"), graphId: z.string(), nodeId: z.string() }) }),
  z.object({ op: z.literal("add_edge"), graphId: z.string(), edge: graphPlanEdgeSchema }),
  z.object({
    op: z.literal("update_edge"),
    target: z.object({ type: z.literal("edge"), graphId: z.string(), edgeId: z.string() }),
    fields: graphPlanEdgeSchema.omit({ id: true }).partial(),
  }),
  z.object({ op: z.literal("remove_edge"), target: z.object({ type: z.literal("edge"), graphId: z.string(), edgeId: z.string() }) }),
  z.object({
    op: z.literal("attach_subgraph"),
    parent: z.object({ graphId: z.string(), nodeId: z.string() }),
    graphId: z.string(),
  }),
  z.object({
    op: z.literal("detach_subgraph"),
    parent: z.object({ graphId: z.string(), nodeId: z.string() }),
    graphId: z.string(),
  }),
  z.object({
    op: z.literal("add_iframe"),
    target: z.object({ type: z.literal("node"), graphId: z.string(), nodeId: z.string() }),
    iframe: graphPlanIframeSchema,
  }),
  z.object({
    op: z.literal("update_iframe"),
    target: z.object({ type: z.literal("iframe"), graphId: z.string(), nodeId: z.string(), iframeId: z.string() }),
    fields: graphPlanIframeSchema.omit({ id: true }).partial(),
  }),
  z.object({
    op: z.literal("remove_iframe"),
    target: z.object({ type: z.literal("iframe"), graphId: z.string(), nodeId: z.string(), iframeId: z.string() }),
  }),
]);

export const graphPlanMutationInputSchema = z.object({
  sessionId: z.string(),
  baseRevision: z.number().int().positive(),
  mode: z.literal("atomic").default("atomic"),
  operations: z.array(graphPlanMutationOperationSchema).min(1),
  changeSummary: graphPlanChangeSummarySchema,
  validationPolicy: validationPolicySchema.default("block_errors"),
});

export const graphPlanMutationResultSchema = z.object({
  session: planSessionSchema,
  revisionEvent: agentRevisionEventSchema,
  validation: graphPlanValidationSummarySchema,
});

export type GraphPlanSessionStatus = z.infer<typeof graphPlanSessionStatusSchema>;
export type FeedbackDisposition = z.infer<typeof feedbackDispositionSchema>;
export type GraphPlanChangeSummary = z.infer<typeof graphPlanChangeSummarySchema>;
export type UserFeedbackEvent = z.infer<typeof userFeedbackEventSchema>;
export type AgentReplyEvent = z.infer<typeof agentReplyEventSchema>;
export type AgentRevisionEvent = z.infer<typeof agentRevisionEventSchema>;
export type UserApprovalEvent = z.infer<typeof userApprovalEventSchema>;
export type PlanEvent = z.infer<typeof planEventSchema>;
export type PlanSession = z.infer<typeof planSessionSchema>;
export type ValidationPolicy = z.infer<typeof validationPolicySchema>;
export type ReplaceGraphPlanInput = z.infer<typeof replaceGraphPlanInputSchema>;
export type GraphPlanMutationOperation = z.infer<typeof graphPlanMutationOperationSchema>;
export type GraphPlanMutationInput = z.infer<typeof graphPlanMutationInputSchema>;
export type GraphPlanMutationResult = z.infer<typeof graphPlanMutationResultSchema>;
