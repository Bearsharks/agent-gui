import { z } from "zod";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const isoDateTimeSchema = z.string().datetime();

export const graphTargetSchema = z.object({
  kind: z
    .enum([
      "graph",
      "node",
      "block",
      "edge",
      "condition",
      "checklist_item",
      "question_option",
      "evaluation_criterion",
      "evaluation_option",
      "evaluation_score",
      "evidence_source",
      "evidence_claim",
      "prototype_piece",
      "artifact_ref",
      "contract_io",
      "runtime_value",
    ])
    .optional(),
  graphId: z.string().optional(),
  nodeId: z.string().optional(),
  blockId: z.string().optional(),
  edgeId: z.string().optional(),
  conditionId: z.string().optional(),
  itemId: z.string().optional(),
  optionId: z.string().optional(),
  criterionId: z.string().optional(),
  sourceId: z.string().optional(),
  pieceId: z.string().optional(),
  artifactRefId: z.string().optional(),
  contractKey: z.string().optional(),
  outputKey: z.string().optional(),
  stateKey: z.string().optional(),
  path: z.string().optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().nonnegative().optional(),
}).superRefine((target, ctx) => {
  if (!target.kind) return;

  const requiredByKind: Partial<Record<NonNullable<typeof target.kind>, string[]>> = {
    graph: ["graphId"],
    node: ["nodeId"],
    block: ["nodeId", "blockId"],
    edge: ["edgeId"],
    condition: ["edgeId", "conditionId"],
    checklist_item: ["nodeId", "blockId", "itemId"],
    question_option: ["nodeId", "blockId", "optionId"],
    evaluation_criterion: ["nodeId", "blockId", "criterionId"],
    evaluation_option: ["nodeId", "blockId", "optionId"],
    evaluation_score: ["nodeId", "blockId", "optionId", "criterionId"],
    evidence_source: ["nodeId", "blockId", "sourceId"],
    evidence_claim: ["nodeId", "blockId"],
    prototype_piece: ["nodeId", "blockId", "pieceId"],
    artifact_ref: ["nodeId", "blockId", "artifactRefId"],
    contract_io: ["graphId", "contractKey"],
    runtime_value: ["stateKey"],
  };

  for (const field of requiredByKind[target.kind] ?? []) {
    if (target[field as keyof typeof target] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} is required for ${target.kind} targets.`,
        path: [field],
      });
    }
  }

  if (
    target.lineStart !== undefined &&
    target.lineEnd !== undefined &&
    target.lineStart > target.lineEnd
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "lineStart must be less than or equal to lineEnd.",
      path: ["lineStart"],
    });
  }

  if (
    target.charStart !== undefined &&
    target.charEnd !== undefined &&
    target.charStart > target.charEnd
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "charStart must be less than or equal to charEnd.",
      path: ["charStart"],
    });
  }
});

export const graphLifecycleStatusSchema = z.enum([
  "draft",
  "open",
  "active",
  "blocked",
  "done",
  "skipped",
]);

export const graphReviewStatusSchema = z.enum([
  "unreviewed",
  "needs_review",
  "in_review",
  "accepted",
  "rejected",
  "needs_revision",
]);

export const graphStatusSchema = z.union([
  graphLifecycleStatusSchema,
  graphReviewStatusSchema,
]);

export const graphOwnerSchema = z.object({
  kind: z.enum(["user", "agent", "team", "system"]),
  id: z.string().optional(),
  label: z.string(),
});

export const graphAssignmentSchema = z.object({
  owners: z.array(graphOwnerSchema).optional(),
  reviewers: z.array(graphOwnerSchema).optional(),
  approvers: z.array(graphOwnerSchema).optional(),
  dueAt: isoDateTimeSchema.optional(),
});

export const graphOutputDefinitionSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  valueType: z.enum([
    "string",
    "number",
    "boolean",
    "single_choice",
    "multi_choice",
    "object",
    "array",
  ]),
  required: z.boolean().default(false),
  allowedValues: z.array(jsonValueSchema).optional(),
});

export const graphExpressionSourceSchema = z.object({
  nodeId: z.string(),
  blockId: z.string().optional(),
  outputKey: z.string().optional(),
  stateKey: z.string().optional(),
});

export type GraphCondition = z.infer<typeof graphConditionSchema>;

export const graphConditionSchema: z.ZodType<{
  id?: string;
  label: string;
  source?: z.infer<typeof graphExpressionSourceSchema>;
  operator?:
    | "equals"
    | "not_equals"
    | "exists"
    | "not_exists"
    | "contains"
    | "greater_than"
    | "less_than"
    | "all_true"
    | "any_true"
    | "gate_passed"
    | "gate_failed"
    | "selected"
    | "score_at_least"
    | "approved";
  value?: JsonValue;
  expression?: string;
  all?: GraphCondition[];
  any?: GraphCondition[];
  not?: GraphCondition;
}> = z.lazy(() =>
  z.object({
  id: z.string().optional(),
  label: z.string(),
  source: graphExpressionSourceSchema.optional(),
  operator: z
    .enum([
      "equals",
      "not_equals",
      "exists",
      "not_exists",
      "contains",
      "greater_than",
      "less_than",
      "all_true",
      "any_true",
      "gate_passed",
      "gate_failed",
      "selected",
      "score_at_least",
      "approved",
    ])
    .optional(),
  value: jsonValueSchema.optional(),
  expression: z.string().optional(),
  all: z.array(graphConditionSchema).optional(),
  any: z.array(graphConditionSchema).optional(),
  not: graphConditionSchema.optional(),
  }).superRefine((condition, ctx) => {
    const modeCount = [
      condition.operator !== undefined,
      condition.expression !== undefined,
      condition.all !== undefined,
      condition.any !== undefined,
      condition.not !== undefined,
    ].filter(Boolean).length;

    if (modeCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Condition must define operator, expression, all, any, or not.",
      });
    }

    if (modeCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Condition must use only one evaluation mode.",
      });
    }
  }),
);

export const graphBlockBaseSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  summary: z.string().optional(),
  lifecycleStatus: graphLifecycleStatusSchema.optional(),
  reviewStatus: graphReviewStatusSchema.optional(),
  owner: graphOwnerSchema.optional(),
  assignment: graphAssignmentSchema.optional(),
  outputDefinitions: z.array(graphOutputDefinitionSchema).optional(),
});

export const textBlockSchema = graphBlockBaseSchema.extend({
  type: z.literal("text"),
  body: z.string(),
  format: z.enum(["plain", "markdown"]).default("markdown"),
});

export const checklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().default(false),
  severity: z.enum(["info", "warning", "blocking"]).optional(),
  group: z.string().optional(),
  owner: graphOwnerSchema.optional(),
});

export const checklistBlockSchema = graphBlockBaseSchema.extend({
  type: z.literal("checklist"),
  items: z.array(checklistItemSchema),
  gate: z.enum(["none", "all_required", "all_items", "any_item"]).default("none"),
  outputKey: z.string().default("gate_passed"),
});

export const questionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: jsonValueSchema.optional(),
});

export const questionBlockSchema = graphBlockBaseSchema.extend({
  type: z.literal("question"),
  prompt: z.string(),
  responseKind: z.enum([
    "free_text",
    "single_choice",
    "multi_choice",
    "confirmation",
    "rating",
  ]),
  options: z.array(questionOptionSchema).optional(),
  outputKey: z.string(),
  required: z.boolean().default(false),
});

export const approvalBlockSchema = graphBlockBaseSchema.extend({
  type: z.literal("approval"),
  prompt: z.string(),
  approvers: z.array(graphOwnerSchema).optional(),
  outputKey: z.string().default("approved"),
  required: z.boolean().default(true),
});

export const prototypePieceRefSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  purpose: z.string().optional(),
  target: graphTargetSchema.optional(),
});

export const prototypeBlockSchema = graphBlockBaseSchema.extend({
  type: z.literal("prototype"),
  prototypeId: z.string(),
  purpose: z.enum(["explains", "validates", "alternative", "final_candidate"]),
  pieceIds: z.array(z.string()).optional(),
  pieces: z.array(prototypePieceRefSchema).optional(),
  tabIds: z.array(z.string()).optional(),
});

export const artifactRefSchema = z.object({
  id: z.string().optional(),
  ref: z.string(),
  title: z.string().optional(),
  locatorKind: z.enum(["path", "url", "metric", "dataset", "inline"]).optional(),
  version: z.string().optional(),
  hash: z.string().optional(),
});

export const artifactBlockSchema = graphBlockBaseSchema.extend({
  type: z.literal("artifact"),
  artifactKind: z.enum([
    "file",
    "diff",
    "document",
    "dataset",
    "chart",
    "metric",
    "external_url",
  ]),
  ref: z.union([z.string(), artifactRefSchema]),
  mimeType: z.string().optional(),
  lifecycle: z
    .enum(["source", "expected_output", "generated", "reviewed", "final"])
    .optional(),
  artifactRole: z
    .enum(["input", "intermediate", "output", "evidence", "deliverable"])
    .optional(),
  dependsOn: z.array(graphTargetSchema).optional(),
  producedBy: graphTargetSchema.optional(),
});

export const graphBlockRefSchema = graphBlockBaseSchema.extend({
  type: z.literal("graph"),
  graphId: z.string(),
  role: z.enum(["subplan", "phase", "branch", "loop", "appendix"]).default("subplan"),
  inputBindings: z
    .array(
      z.object({
        childInputKey: z.string(),
        source: graphExpressionSourceSchema.optional(),
        value: jsonValueSchema.optional(),
      }),
    )
    .optional(),
  outputBindings: z
    .array(
      z.object({
        childOutputKey: z.string(),
        parentOutputKey: z.string(),
      }),
    )
    .optional(),
  defaultDepth: z.number().int().nonnegative().optional(),
});

export const evaluationCriterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  weight: z.number().optional(),
  scale: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
});

export const evaluationOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  target: graphTargetSchema.optional(),
  plannedScores: z.record(z.string(), z.number()).optional(),
  notes: z.string().optional(),
});

export const evaluationScoreCellSchema = z.object({
  optionId: z.string(),
  criterionId: z.string(),
  value: z.number(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  rationale: z.string().optional(),
});

export const evaluationBlockSchema = graphBlockBaseSchema.extend({
  type: z.literal("evaluation"),
  criteria: z.array(evaluationCriterionSchema),
  options: z.array(evaluationOptionSchema),
  plannedScoreCells: z.array(evaluationScoreCellSchema).optional(),
  decisionOutputKey: z.string().optional(),
  scoreScale: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
  tiePolicy: z.enum(["manual_decision", "highest_confidence", "first_ranked"]).optional(),
});

export const evidenceBlockSchema = graphBlockBaseSchema.extend({
  type: z.literal("evidence"),
  claim: z.string(),
  stance: z.enum(["supports", "refutes", "mixed", "context"]).optional(),
  importance: z.string().optional(),
  sources: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      ref: z.string().optional(),
      sourceKind: z
        .enum(["doc", "url", "paper", "log", "metric", "interview", "observation"])
        .optional(),
      retrievedAt: isoDateTimeSchema.optional(),
      confidence: z.enum(["low", "medium", "high"]).optional(),
      relevance: z.enum(["low", "medium", "high"]).optional(),
      supportsCriteria: z.array(z.string()).optional(),
    }),
  ),
});

export const graphBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  checklistBlockSchema,
  questionBlockSchema,
  approvalBlockSchema,
  prototypeBlockSchema,
  artifactBlockSchema,
  graphBlockRefSchema,
  evaluationBlockSchema,
  evidenceBlockSchema,
]);

export const graphKnownNodeTypeSchema = z.enum([
  "task",
  "phase",
  "decision",
  "question",
  "review",
  "research",
  "hypothesis",
  "experiment",
  "result",
  "option",
  "gate",
  "artifact",
  "section",
]);

export const graphNodeSchema = z.object({
  id: z.string(),
  type: z.union([graphKnownNodeTypeSchema, z.string().regex(/^x-[a-z0-9._-]+$/)]),
  title: z.string(),
  summary: z.string().optional(),
  blocks: z.array(graphBlockSchema),
  owner: graphOwnerSchema.optional(),
  assignment: graphAssignmentSchema.optional(),
  lifecycleStatus: graphLifecycleStatusSchema.optional(),
  reviewStatus: graphReviewStatusSchema.optional(),
  joinPolicy: z.enum(["all_incoming", "any_incoming", "quorum", "manual"]).optional(),
  joinEdgeKinds: z
    .array(
      z.enum([
        "sequence",
        "dependency",
        "conditional",
        "fallback",
        "unblocks",
      ]),
    )
    .optional(),
  quorum: z.number().int().positive().optional(),
  layout: z
    .object({
      order: z.number().optional(),
      group: z.string().optional(),
      lane: z.string().optional(),
      collapsed: z.boolean().optional(),
    })
    .optional(),
  projection: z
    .object({
      preferredView: z
        .enum(["outline", "graph", "interview", "checklist", "prototype", "table"])
        .optional(),
      displayOrder: z.number().optional(),
      displayLabel: z.string().optional(),
      collapsedSummary: z.string().optional(),
      blockOrder: z.array(z.string()).optional(),
      hiddenByDefault: z.boolean().optional(),
    })
    .optional(),
  tags: z.array(z.string()).optional(),
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: z.enum([
    "sequence",
    "dependency",
    "conditional",
    "fallback",
    "reference",
    "blocks",
    "unblocks",
    "loop",
    "rollback",
  ]),
  label: z.string().optional(),
  condition: graphConditionSchema.optional(),
  owner: graphOwnerSchema.optional(),
  assignment: graphAssignmentSchema.optional(),
  display: z
    .object({
      role: z
        .enum(["primary", "alternate", "rollback", "reference", "hidden"])
        .optional(),
      label: z.string().optional(),
      branchOrder: z.number().optional(),
      criticalPath: z.boolean().optional(),
      hiddenByDefault: z.boolean().optional(),
    })
    .optional(),
  loopPolicy: z
    .object({
      maxIterations: z.number().int().positive().optional(),
      exitCondition: graphConditionSchema.optional(),
    })
    .optional(),
  priority: z.number().optional(),
});

export const graphContractSchema = z.object({
  inputs: z.array(graphOutputDefinitionSchema).optional(),
  outputs: z.array(graphOutputDefinitionSchema).optional(),
});

export const graphGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["phase", "lane", "system", "role", "risk", "custom"]).optional(),
  order: z.number().optional(),
});

export const graphProjectionSchema = z.object({
  defaultView: z
    .enum(["outline", "graph", "interview", "checklist", "prototype", "table"])
    .optional(),
  traversal: z
    .enum(["primary_path", "topological", "manual_order", "active_path"])
    .default("primary_path"),
  defaultDepth: z.number().int().nonnegative().optional(),
  groups: z.array(graphGroupSchema).optional(),
});

export const planGraphSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string().optional(),
  summary: z.string().optional(),
  entryNodeIds: z.array(z.string()).default([]),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema).default([]),
  contract: graphContractSchema.optional(),
  projection: graphProjectionSchema.optional(),
  assignment: graphAssignmentSchema.optional(),
  lifecycleStatus: graphLifecycleStatusSchema.optional(),
  reviewStatus: graphReviewStatusSchema.optional(),
});

export const graphRuntimeValueSchema = z.object({
  target: graphTargetSchema,
  key: z.string(),
  value: jsonValueSchema,
  updatedAt: isoDateTimeSchema.optional(),
});

export const graphLoopRuntimeSchema = z.object({
  edgeId: z.string().optional(),
  nodeId: z.string().optional(),
  count: z.number().int().nonnegative(),
  latestResult: z.string().optional(),
  exitReason: z.string().optional(),
});

export const graphApprovalRuntimeSchema = z.object({
  target: graphTargetSchema,
  approver: graphOwnerSchema,
  decision: z.enum(["approved", "rejected", "revoked"]),
  reason: z.string().optional(),
  decidedAt: isoDateTimeSchema.optional(),
});

export const graphGateRuntimeSchema = z.object({
  target: graphTargetSchema,
  passed: z.boolean(),
  failedItemIds: z.array(z.string()).optional(),
  blockerReason: z.string().optional(),
  evaluatedAt: isoDateTimeSchema.optional(),
});

export const graphRuntimeStateSchema = z.object({
  values: z.array(graphRuntimeValueSchema).default([]),
  activeNodeIds: z.array(z.string()).default([]),
  activeEdgeIds: z.array(z.string()).default([]),
  completedNodeIds: z.array(z.string()).default([]),
  satisfiedEdgeIds: z.array(z.string()).default([]),
  skippedNodeIds: z.array(z.string()).default([]),
  blockedNodeIds: z.array(z.string()).default([]),
  visitedNodeIds: z.array(z.string()).default([]),
  selectedPath: z.array(z.string()).optional(),
  loopIterations: z.array(graphLoopRuntimeSchema).default([]),
  approvals: z.array(graphApprovalRuntimeSchema).default([]),
  gates: z.array(graphGateRuntimeSchema).default([]),
});

export const graphPrototypeTabSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  summary: z.string().optional(),
});

export const graphPrototypePieceSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  kind: z.string().optional(),
  target: graphTargetSchema.optional(),
});

export const graphPrototypeSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  tabs: z.array(graphPrototypeTabSchema).default([]),
  pieces: z.array(graphPrototypePieceSchema).default([]),
  state: z.record(z.string(), jsonValueSchema).optional(),
});

export const graphPlanDraftSchema = z.object({
  title: z.string(),
  goal: z.string(),
  summary: z.string().optional(),
  rootGraphId: z.string(),
  graphs: z.array(planGraphSchema),
  prototypes: z.array(graphPrototypeSchema).optional(),
  lifecycleStatus: graphLifecycleStatusSchema.optional(),
  reviewStatus: graphReviewStatusSchema.optional(),
});

export const graphChangeSummarySchema = z.object({
  summary: z.string(),
  affectedTargets: z.array(graphTargetSchema).default([]),
});

export const graphFeedbackIntentSchema = z.enum([
  "revise",
  "simplify",
  "make_more_radical",
  "make_more_conservative",
  "reassess_risk",
  "verify_against_code",
  "rename",
  "question",
]);

export const graphFeedbackDispositionSchema = z.enum([
  "open",
  "answered",
  "incorporated_in_revision",
  "rejected",
  "needs_user_clarification",
]);

export const graphPlanEventSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("graph.feedback"),
    sessionId: z.string().optional(),
    revision: z.number().int().positive(),
    actor: graphOwnerSchema.optional(),
    target: graphTargetSchema,
    intent: graphFeedbackIntentSchema.optional(),
    message: z.string(),
    createdAt: isoDateTimeSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("graph.reply"),
    sessionId: z.string().optional(),
    revision: z.number().int().positive(),
    actor: graphOwnerSchema.optional(),
    replyToEventId: z.string(),
    target: graphTargetSchema,
    body: z.string(),
    disposition: graphFeedbackDispositionSchema.optional(),
    createdAt: isoDateTimeSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("graph.runtime_value"),
    sessionId: z.string().optional(),
    revision: z.number().int().positive(),
    value: graphRuntimeValueSchema,
    createdAt: isoDateTimeSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("graph.revision"),
    sessionId: z.string().optional(),
    revision: z.number().int().positive(),
    fromRevision: z.number().int().positive(),
    toRevision: z.number().int().positive(),
    target: graphTargetSchema.optional(),
    changes: z.array(graphChangeSummarySchema),
    incorporatedFeedbackIds: z.array(z.string()).optional(),
    createdAt: isoDateTimeSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal("graph.approval"),
    sessionId: z.string().optional(),
    revision: z.number().int().positive(),
    approval: graphApprovalRuntimeSchema,
    createdAt: isoDateTimeSchema,
  }),
]);

export const graphPlanSessionSchema = z.object({
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
  plan: graphPlanDraftSchema,
  runtime: graphRuntimeStateSchema.optional(),
  events: z.array(graphPlanEventSchema).default([]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type GraphTarget = z.infer<typeof graphTargetSchema>;
export type GraphKnownNodeType = z.infer<typeof graphKnownNodeTypeSchema>;
export type GraphStatus = z.infer<typeof graphStatusSchema>;
export type GraphLifecycleStatus = z.infer<typeof graphLifecycleStatusSchema>;
export type GraphReviewStatus = z.infer<typeof graphReviewStatusSchema>;
export type GraphOwner = z.infer<typeof graphOwnerSchema>;
export type GraphAssignment = z.infer<typeof graphAssignmentSchema>;
export type GraphOutputDefinition = z.infer<typeof graphOutputDefinitionSchema>;
export type GraphExpressionSource = z.infer<typeof graphExpressionSourceSchema>;
export type GraphBlock = z.infer<typeof graphBlockSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphContract = z.infer<typeof graphContractSchema>;
export type GraphGroup = z.infer<typeof graphGroupSchema>;
export type GraphProjection = z.infer<typeof graphProjectionSchema>;
export type GraphRuntimeValue = z.infer<typeof graphRuntimeValueSchema>;
export type GraphLoopRuntime = z.infer<typeof graphLoopRuntimeSchema>;
export type GraphApprovalRuntime = z.infer<typeof graphApprovalRuntimeSchema>;
export type GraphGateRuntime = z.infer<typeof graphGateRuntimeSchema>;
export type GraphRuntimeState = z.infer<typeof graphRuntimeStateSchema>;
export type GraphPrototypeTab = z.infer<typeof graphPrototypeTabSchema>;
export type GraphPrototypePiece = z.infer<typeof graphPrototypePieceSchema>;
export type GraphPrototype = z.infer<typeof graphPrototypeSchema>;
export type GraphChangeSummary = z.infer<typeof graphChangeSummarySchema>;
export type GraphFeedbackIntent = z.infer<typeof graphFeedbackIntentSchema>;
export type GraphFeedbackDisposition = z.infer<typeof graphFeedbackDispositionSchema>;
export type GraphPlanEvent = z.infer<typeof graphPlanEventSchema>;
export type GraphPlanSession = z.infer<typeof graphPlanSessionSchema>;
export type PlanGraph = z.infer<typeof planGraphSchema>;
export type GraphPlanDraft = z.infer<typeof graphPlanDraftSchema>;
