import { z } from "zod";

export const planTargetSchema = z.object({
  type: z.enum([
    "plan",
    "phase",
    "step",
    "decision",
    "risk",
    "verification",
    "prototype",
    "prototype_piece",
  ]),
  id: z.string().optional(),
});

export type PlanTarget = z.infer<typeof planTargetSchema>;

export const prototypeLinkSchema = z.object({
  target: planTargetSchema,
  purpose: z.enum(["explains", "validates", "alternative", "final_candidate"]),
});

export const prototypeCodeRefSchema = z.object({
  type: z.literal("session_artifact"),
  path: z.string(),
});

export const prototypePieceSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  kind: z.enum([
    "component",
    "panel",
    "form",
    "card",
    "navigation",
    "state_view",
    "interaction_slice",
  ]),
  links: z.array(prototypeLinkSchema),
  codeRef: prototypeCodeRefSchema.optional(),
  state: z.record(z.string(), z.unknown()).optional(),
});

export const planPrototypeSchema = z.object({
  id: z.string(),
  revision: z.number().int().positive(),
  title: z.string(),
  summary: z.string().optional(),
  kind: z.enum(["wireframe", "mockup", "flow", "interaction"]),
  links: z.array(prototypeLinkSchema),
  pieces: z.array(prototypePieceSchema),
  codeRef: prototypeCodeRefSchema.optional(),
  state: z.record(z.string(), z.unknown()),
  notes: z.array(z.string()).optional(),
});

export const planDecisionSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  rationale: z.string().optional(),
});

export const planPhaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  goal: z.string().optional(),
  stepIds: z.array(z.string()),
  status: z.enum(["open", "needs_revision", "accepted"]).optional(),
});

export const planStepSchema = z.object({
  id: z.string(),
  phaseId: z.string().optional(),
  title: z.string(),
  kind: z.enum(["research", "decision", "code", "test", "checkpoint"]),
  summary: z.string(),
  files: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  verification: z.array(z.string()).optional(),
  status: z.enum(["open", "needs_revision", "accepted"]).optional(),
});

export const planRiskSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  description: z.string(),
  mitigation: z.string().optional(),
});

export const planDraftSchema = z.object({
  title: z.string(),
  goal: z.string(),
  summary: z.string().optional(),
  decisions: z.array(planDecisionSchema),
  phases: z.array(planPhaseSchema).optional(),
  steps: z.array(planStepSchema),
  risks: z.array(planRiskSchema).optional(),
  verification: z.array(z.string()).optional(),
  prototypes: z.array(planPrototypeSchema).optional(),
});

export const feedbackDispositionSchema = z.enum([
  "open",
  "answered",
  "incorporated_in_revision",
  "rejected",
  "needs_user_clarification",
]);

export const userFeedbackEventSchema = z.object({
  id: z.string(),
  type: z.literal("user.feedback"),
  sessionId: z.string(),
  revision: z.number().int().positive(),
  target: planTargetSchema,
  intent: z
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
    .optional(),
  message: z.string(),
  createdAt: z.string(),
});

export const agentReplyEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.reply"),
  sessionId: z.string(),
  revision: z.number().int().positive(),
  replyToEventId: z.string(),
  target: planTargetSchema,
  body: z.string(),
  disposition: feedbackDispositionSchema.optional(),
  createdAt: z.string(),
});

export const prototypeChangeSummarySchema = z.object({
  prototypeId: z.string(),
  pieceId: z.string().optional(),
  changeSummary: z.array(z.string()),
  linkedTargets: z.array(planTargetSchema),
});

export const agentRevisionEventSchema = z.object({
  id: z.string(),
  type: z.literal("agent.revision"),
  sessionId: z.string(),
  fromRevision: z.number().int().positive(),
  toRevision: z.number().int().positive(),
  changeSummary: z.array(z.string()),
  prototypeChanges: z.array(prototypeChangeSummarySchema).optional(),
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
  status: z.enum([
    "draft",
    "needs_agent",
    "agent_replied",
    "revision_ready",
    "approved",
    "rejected",
  ]),
  revision: z.number().int().positive(),
  plan: planDraftSchema,
  events: z.array(planEventSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PrototypeLink = z.infer<typeof prototypeLinkSchema>;
export type PrototypeCodeRef = z.infer<typeof prototypeCodeRefSchema>;
export type PrototypePiece = z.infer<typeof prototypePieceSchema>;
export type PlanPrototype = z.infer<typeof planPrototypeSchema>;
export type PlanDecision = z.infer<typeof planDecisionSchema>;
export type PlanPhase = z.infer<typeof planPhaseSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;
export type PlanRisk = z.infer<typeof planRiskSchema>;
export type PlanDraft = z.infer<typeof planDraftSchema>;
export type FeedbackDisposition = z.infer<typeof feedbackDispositionSchema>;
export type UserFeedbackEvent = z.infer<typeof userFeedbackEventSchema>;
export type AgentReplyEvent = z.infer<typeof agentReplyEventSchema>;
export type PrototypeChangeSummary = z.infer<typeof prototypeChangeSummarySchema>;
export type AgentRevisionEvent = z.infer<typeof agentRevisionEventSchema>;
export type UserApprovalEvent = z.infer<typeof userApprovalEventSchema>;
export type PlanEvent = z.infer<typeof planEventSchema>;
export type PlanSession = z.infer<typeof planSessionSchema>;
