import { z } from "zod";
import {
  graphPlanBlockSchema,
  graphPlanDocumentSchema,
  graphPlanEdgeSchema,
  graphPlanGraphSchema,
  graphPlanNodeSchema,
  graphPlanTargetSchema,
} from "./graphPlan";
import { graphPlanValidationSummarySchema } from "./graphPlanValidation";

export const graphPlanSessionStatusSchema = z.enum([
  "draft",
  "needs_agent",
  "agent_replied",
  "revision_ready",
  "approved",
  "rejected",
]);

export const feedbackDispositionSchema = z.enum([
  "open",
  "answered",
  "incorporated_in_revision",
  "rejected",
  "needs_user_clarification",
]);

export const graphPlanFeedbackIntentSchema = z
  .enum([
    "revise",
    "simplify",
    "make_more_radical",
    "make_more_conservative",
    "reassess_risk",
    "verify_against_code",
    "rename",
    "question",
  ])
  .optional();

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

export const planEventSchema = z.discriminatedUnion("type", [
  userFeedbackEventSchema,
  agentReplyEventSchema,
  agentRevisionEventSchema,
  userApprovalEventSchema,
]);

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
  validationPolicy: validationPolicySchema.default("block_errors"),
});

const graphPlanMutationBaseSchema = z.object({
  op: z.string(),
});

const targetMutationBaseSchema = graphPlanMutationBaseSchema.extend({
  target: graphPlanTargetSchema,
});

export const graphPlanMutationOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("replace_document"), graphPlan: graphPlanDocumentSchema }),
  targetMutationBaseSchema.extend({
    op: z.literal("update_node_fields"),
    target: z.object({ type: z.literal("node"), graphId: z.string(), nodeId: z.string() }),
    fields: graphPlanNodeSchema.omit({ id: true, blocks: true }).partial(),
  }),
  targetMutationBaseSchema.extend({
    op: z.literal("update_block_fields"),
    target: z.object({ type: z.literal("block"), graphId: z.string(), nodeId: z.string(), blockId: z.string() }),
    fields: z.record(z.string(), z.unknown()),
  }),
  targetMutationBaseSchema.extend({
    op: z.literal("replace_block"),
    target: z.object({ type: z.literal("block"), graphId: z.string(), nodeId: z.string(), blockId: z.string() }),
    block: graphPlanBlockSchema,
  }),
  targetMutationBaseSchema.extend({
    op: z.literal("append_block"),
    target: z.object({ type: z.literal("node"), graphId: z.string(), nodeId: z.string() }),
    block: graphPlanBlockSchema,
  }),
  z.object({ op: z.literal("add_node"), graphId: z.string(), node: graphPlanNodeSchema }),
  z.object({ op: z.literal("add_edge"), graphId: z.string(), edge: graphPlanEdgeSchema }),
  targetMutationBaseSchema.extend({
    op: z.literal("remove_node"),
    target: z.object({ type: z.literal("node"), graphId: z.string(), nodeId: z.string() }),
    policy: z
      .object({
        edges: z.enum(["error", "remove", "reconnect"]).default("error"),
        ownedGraphs: z.enum(["error", "remove", "detach"]).default("error"),
        feedbackTargets: z.enum(["error", "preserve_as_historical"]).default("preserve_as_historical"),
        revisionTargets: z.enum(["error", "preserve_as_historical"]).default("preserve_as_historical"),
      })
      .optional(),
  }),
  targetMutationBaseSchema.extend({
    op: z.literal("remove_edge"),
    target: z.object({ type: z.literal("edge"), graphId: z.string(), edgeId: z.string() }),
  }),
  targetMutationBaseSchema.extend({
    op: z.literal("rewire_edge"),
    target: z.object({ type: z.literal("edge"), graphId: z.string(), edgeId: z.string() }),
    from: z.string().optional(),
    to: z.string().optional(),
    policy: z
      .object({
        validateReachability: z.boolean().default(true),
        preserveCondition: z.boolean().default(true),
      })
      .optional(),
  }),
  z.object({
    op: z.literal("add_subgraph"),
    parent: z.object({ type: z.literal("node"), graphId: z.string(), nodeId: z.string() }),
    graph: graphPlanGraphSchema,
    attach: z
      .object({
        mode: z.enum(["none", "graph_ref_block"]).default("none"),
        blockId: z.string().optional(),
        relationship: z.string().optional(),
      })
      .optional(),
  }),
  targetMutationBaseSchema.extend({
    op: z.literal("attach_graph_ref"),
    target: z.object({ type: z.literal("node"), graphId: z.string(), nodeId: z.string() }),
    block: graphPlanBlockSchema,
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

