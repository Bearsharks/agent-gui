import { z } from "zod";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const graphPlanReviewStatusSchema = z.enum([
  "open",
  "needs_revision",
  "accepted",
  "blocked",
  "complete",
  "rejected",
]);

export const graphPlanPointerSchema = z.object({
  graphId: z.string().optional(),
  nodeId: z.string().optional(),
  blockId: z.string().optional(),
  itemId: z.string().optional(),
  outputKey: z.string().optional(),
});

export type GraphPlanPointer = z.infer<typeof graphPlanPointerSchema>;

export const graphPlanOutputDefinitionSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  valueType: z.enum(["string", "number", "boolean", "single_choice", "multi_choice", "object", "array"]),
  required: z.boolean().optional(),
  allowedValues: z.array(jsonValueSchema).optional(),
  producedBy: graphPlanPointerSchema.optional(),
});

export type GraphPlanOutputDefinition = z.infer<typeof graphPlanOutputDefinitionSchema>;

export const graphPlanEvidenceRefSchema = z.union([
  z.string(),
  z.object({
    graphId: z.string(),
    nodeId: z.string().optional(),
    blockId: z.string(),
    itemId: z.string(),
  }),
]);

export const graphPlanTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan") }),
  z.object({ type: z.literal("graph"), graphId: z.string() }),
  z.object({ type: z.literal("node"), graphId: z.string(), nodeId: z.string() }),
  z.object({ type: z.literal("block"), graphId: z.string(), nodeId: z.string(), blockId: z.string() }),
  z.object({
    type: z.literal("artifact_range"),
    graphId: z.string(),
    nodeId: z.string(),
    blockId: z.string(),
    artifactId: z.string(),
    path: z.string().optional(),
    lineStart: z.number().int().positive().optional(),
    lineEnd: z.number().int().positive().optional(),
    charStart: z.number().int().nonnegative().optional(),
    charEnd: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("block_item"),
    graphId: z.string(),
    nodeId: z.string(),
    blockId: z.string(),
    itemId: z.string(),
    itemType: z
      .enum([
        "task",
        "check",
        "criterion",
        "option",
        "evidence",
        "finding",
        "verification",
        "hypothesis",
        "experiment",
        "score",
        "risk",
        "artifact",
        "change",
        "migration_step",
      ])
      .optional(),
  }),
  z.object({ type: z.literal("edge"), graphId: z.string(), edgeId: z.string() }),
  z.object({
    type: z.literal("prototype_tab"),
    graphId: z.string(),
    nodeId: z.string(),
    blockId: z.string(),
    prototypeId: z.string(),
    tabId: z.string(),
  }),
]);

export type GraphPlanTarget = z.infer<typeof graphPlanTargetSchema>;

const graphPlanContractBindingSchema = z.object({
  key: z.string(),
  source: graphPlanPointerSchema.optional(),
  target: graphPlanTargetSchema.optional(),
  targetPointer: graphPlanPointerSchema.optional(),
});

export const graphPlanRevisionMetaSchema = z.object({
  stableId: z.string().optional(),
  createdAtRevision: z.number().int().positive().optional(),
  updatedAtRevision: z.number().int().positive().optional(),
  supersedes: z.array(graphPlanTargetSchema).optional(),
  changeSummary: z.array(z.string()).optional(),
});

export const graphPlanLinkSchema = z.object({
  target: graphPlanTargetSchema,
  purpose: z.enum([
    "explains",
    "validates",
    "alternative",
    "final_candidate",
    "depends_on",
    "mitigates",
    "produces",
    "tests_interaction",
    "shows_state",
    "implements_option",
  ]),
});

const graphPlanConditionPredicateSchema = z
  .object({
    label: z.string().optional(),
    source: graphPlanPointerSchema,
    operator: z.enum([
      "equals",
      "not_equals",
      "exists",
      "contains",
      "greater_than",
      "greater_than_or_equal",
      "less_than",
      "less_than_or_equal",
      "all_checked",
      "any_checked",
      "passed",
      "failed",
    ]),
    value: jsonValueSchema.optional(),
  })
  .superRefine((condition, ctx) => {
    const requiresValue =
      condition.operator === "equals" ||
      condition.operator === "not_equals" ||
      condition.operator === "contains" ||
      condition.operator === "greater_than" ||
      condition.operator === "greater_than_or_equal" ||
      condition.operator === "less_than" ||
      condition.operator === "less_than_or_equal";
    if (requiresValue && condition.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${condition.operator} conditions require value.`,
        path: ["value"],
      });
    }
    if (!requiresValue && condition.value !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${condition.operator} conditions must not include value.`,
        path: ["value"],
      });
    }
  });

export type GraphPlanCondition =
  | {
      label?: string;
      source: GraphPlanPointer;
      operator:
        | "equals"
        | "not_equals"
        | "exists"
        | "contains"
        | "greater_than"
        | "greater_than_or_equal"
        | "less_than"
        | "less_than_or_equal"
        | "all_checked"
        | "any_checked"
        | "passed"
        | "failed";
      value?: unknown;
    }
  | { label?: string; all: GraphPlanCondition[] }
  | { label?: string; any: GraphPlanCondition[] }
  | { label?: string; not: GraphPlanCondition };

export const graphPlanConditionSchema: z.ZodType<GraphPlanCondition> = z.lazy(() =>
  z.union([
    graphPlanConditionPredicateSchema,
    z.object({ label: z.string().optional(), all: z.array(graphPlanConditionSchema).min(1) }).strict(),
    z.object({ label: z.string().optional(), any: z.array(graphPlanConditionSchema).min(1) }).strict(),
    z.object({ label: z.string().optional(), not: graphPlanConditionSchema }).strict(),
  ]),
);

const baseBlockSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  summary: z.string().optional(),
  status: graphPlanReviewStatusSchema.optional(),
  links: z.array(graphPlanLinkSchema).optional(),
  outputDefinitions: z.array(graphPlanOutputDefinitionSchema).optional(),
  revisionMeta: graphPlanRevisionMetaSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const checklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  required: z.boolean().default(true),
  status: z.enum(["unchecked", "checked", "blocked", "waived"]).default("unchecked"),
  evidenceRefs: z.array(graphPlanEvidenceRefSchema).optional(),
  owner: z.string().optional(),
});

const criterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  required: z.boolean().default(true),
  status: z.enum(["pending", "passed", "failed", "waived"]).default("pending"),
  evidenceRefs: z.array(graphPlanEvidenceRefSchema).optional(),
});

const evidenceItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  claim: z.string(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  sourcePointer: graphPlanPointerSchema.optional(),
});

const synthesisEntrySchema = z.object({
  id: z.string(),
  finding: z.string(),
  evidenceRefs: z.array(graphPlanEvidenceRefSchema).default([]),
});

const targetMappingSchema = z.object({
  id: z.string(),
  changeKind: z.enum(["rename", "split", "merge", "move", "replace", "delete", "create"]),
  sourceEventIds: z.array(z.string()).optional(),
  previousTargets: z.array(graphPlanTargetSchema).default([]),
  newTargets: z.array(graphPlanTargetSchema).default([]),
});

const reviewTraceSchema = z.object({
  sourceEventIds: z.array(z.string()),
  resolution: z.enum(["open", "addressed", "deferred", "rejected"]).optional(),
  changedTargets: z.array(graphPlanTargetSchema).optional(),
});

const prototypeUrlSchema = z.string().url().refine(
  (value) => {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  },
  { message: "Prototype URL must be https or local http." },
);

const prototypeTabSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: prototypeUrlSchema,
  summary: z.string().optional(),
  context: graphPlanPointerSchema.optional(),
  relatedTargets: z
    .array(
      z.object({
        target: graphPlanTargetSchema,
        purpose: z.enum(["explains", "validates", "tests_interaction", "shows_state"]),
        note: z.string().optional(),
      }),
    )
    .default([]),
});

export const graphPlanBlockSchema = z.discriminatedUnion("type", [
  baseBlockSchema.extend({ type: z.literal("text"), body: z.string() }),
  baseBlockSchema.extend({
    type: z.literal("graph_ref"),
    graphId: z.string(),
    relationship: z
      .enum([
        "decomposes_node",
        "phase_detail",
        "option_detail",
        "prototype_state_flow",
        "revision_work",
        "evidence_branch",
        "experiment_procedure",
        "cutover_detail",
        "rollback_drill",
        "debug_detail",
        "related_context",
      ])
      .default("decomposes_node"),
    ownership: z.enum(["owned", "referenced"]).default("owned"),
    inputBindings: z.array(graphPlanContractBindingSchema).optional(),
    outputBindings: z.array(graphPlanContractBindingSchema).optional(),
  }),
  baseBlockSchema.extend({
    type: z.literal("task_list"),
    items: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        status: graphPlanReviewStatusSchema.optional(),
        target: graphPlanTargetSchema.optional(),
      }),
    ),
  }),
  baseBlockSchema.extend({ type: z.literal("checklist"), items: z.array(checklistItemSchema) }),
  baseBlockSchema.extend({ type: z.literal("criteria"), criteria: z.array(criterionSchema) }),
  baseBlockSchema.extend({
    type: z.literal("review_bundle"),
    prompt: z.string(),
    linkedTargets: z.array(graphPlanTargetSchema).default([]),
    acceptanceCriteria: z.array(criterionSchema).default([]),
    reviewTrace: reviewTraceSchema.optional(),
    prototypeRef: z
      .object({
        prototypeId: z.string(),
        blockId: z.string().optional(),
        target: graphPlanTargetSchema.optional(),
      })
      .optional(),
  }),
  baseBlockSchema.extend({
    type: z.literal("prototype"),
    prototypeId: z.string(),
    revision: z.number().int().positive().optional(),
    contentHash: z.string().optional(),
    tabs: z.array(prototypeTabSchema).default([]),
  }),
  baseBlockSchema.extend({
    type: z.literal("choice_set"),
    question: z.string(),
    selectedOptionId: z.string().optional(),
    options: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        summary: z.string().optional(),
        status: z.enum(["candidate", "selected", "rejected", "deferred"]).default("candidate"),
        rationale: z.string().optional(),
        downstreamTarget: graphPlanTargetSchema.optional(),
        downstreamGraphId: z.string().optional(),
        activation: z.enum(["selected", "candidate", "always", "manual"]).default("selected"),
      }),
    ),
  }),
  baseBlockSchema.extend({
    type: z.literal("comparison"),
    criteria: z.array(criterionSchema),
    options: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        status: z.enum(["candidate", "selected", "rejected", "deferred"]).optional(),
        rationale: z.string().optional(),
        downstreamTarget: graphPlanTargetSchema.optional(),
        downstreamGraphId: z.string().optional(),
        activation: z.enum(["selected", "candidate", "always", "manual"]).default("selected"),
      }),
    ),
    scores: z
      .array(
        z.object({
          id: z.string().optional(),
          optionId: z.string(),
          criterionId: z.string(),
          rating: z.enum(["low", "medium", "high"]).optional(),
          note: z.string().optional(),
          evidenceRefs: z.array(graphPlanEvidenceRefSchema).optional(),
        }),
      )
      .default([]),
    selectedOptionId: z.string().optional(),
    recommendation: z.string().optional(),
    recommendationRationale: z.string().optional(),
  }),
  baseBlockSchema.extend({ type: z.literal("evidence"), items: z.array(evidenceItemSchema) }),
  baseBlockSchema.extend({
    type: z.literal("synthesis"),
    entries: z.array(synthesisEntrySchema),
    sourceBranchRefs: z.array(graphPlanTargetSchema).optional(),
    joinPolicy: z.enum(["all", "any", "manual"]).default("manual"),
    conclusion: z.string().optional(),
    conclusionEvidenceRefs: z.array(graphPlanEvidenceRefSchema).optional(),
    unresolvedQuestions: z.array(z.string()).optional(),
  }),
  baseBlockSchema.extend({
    type: z.literal("risk"),
    risks: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        severity: z.enum(["low", "medium", "high"]),
        mitigation: z.string().optional(),
        evidenceRefs: z.array(graphPlanEvidenceRefSchema).optional(),
      }),
    ),
  }),
  baseBlockSchema.extend({
    type: z.literal("verification"),
    checks: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        mode: z.enum(["manual", "command", "test", "metric"]).default("manual"),
        expected: z.string().optional(),
        outcome: z.enum(["pending", "passed", "failed", "waived"]).default("pending"),
      }),
    ),
  }),
  baseBlockSchema.extend({
    type: z.literal("checkpoint_outcome"),
    result: z.enum(["pending", "passed", "failed", "waived"]),
    determiningRefs: z.array(graphPlanTargetSchema).default([]),
    decidedAt: z.string().optional(),
    decidedBy: z.enum(["user", "agent", "system"]).optional(),
    sourceEventIds: z.array(z.string()).optional(),
  }),
  baseBlockSchema.extend({
    type: z.literal("artifact"),
    artifacts: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["file", "url", "code_ref", "generated_output"]),
        title: z.string(),
        ref: z.string(),
      }),
    ),
  }),
  baseBlockSchema.extend({
    type: z.literal("changelog"),
    fromRevision: z.number().int().positive(),
    toRevision: z.number().int().positive(),
    entries: z.array(
      z.object({
        id: z.string(),
        summary: z.string(),
        previousTargets: z.array(graphPlanTargetSchema).optional(),
        changedTargets: z.array(graphPlanTargetSchema),
        mappings: z.array(targetMappingSchema).optional(),
        sourceEventIds: z.array(z.string()).optional(),
      }),
    ),
    reviewTrace: reviewTraceSchema.optional(),
  }),
  baseBlockSchema.extend({
    type: z.literal("investigation"),
    hypotheses: z.array(
      z.object({
        id: z.string(),
        statement: z.string(),
        status: z.enum(["open", "testing", "confirmed", "falsified", "superseded"]).default("open"),
        evidenceRefs: z.array(graphPlanEvidenceRefSchema).optional(),
      }),
    ),
    experiments: z.array(
      z.object({
        id: z.string(),
        hypothesisId: z.string(),
        procedure: z.string(),
        procedureGraphId: z.string().optional(),
        procedureTarget: graphPlanTargetSchema.optional(),
        result: z.enum(["pending", "supports", "refutes", "inconclusive"]).default("pending"),
        artifactRefs: z.array(z.string()).optional(),
      }),
    ),
    observations: z.array(z.object({ id: z.string(), note: z.string(), evidenceRefs: z.array(graphPlanEvidenceRefSchema).optional() })),
    outcomes: z.array(z.object({ id: z.string(), summary: z.string(), nextAction: z.string().optional() })).default([]),
    exitCondition: z.string(),
  }),
  baseBlockSchema.extend({
    type: z.literal("migration"),
    fromVersion: z.string(),
    toVersion: z.string(),
    affectedSurfaces: z.array(z.string()),
    compatibilityStrategy: z.string(),
    compatibility: z
      .object({
        readCompatibility: z.string().optional(),
        writeCompatibility: z.string().optional(),
        legacySessionPolicy: z.string().optional(),
        items: z
          .array(
            z.object({
              id: z.string(),
              kind: z.enum(["read", "write", "legacy_session", "interop"]),
              policy: z.string(),
              status: z.enum(["pending", "active", "passed", "failed", "retired"]).default("pending"),
            }),
          )
          .optional(),
      })
      .optional(),
    rollbackScope: z.enum(["step", "phase", "global"]),
    rollbackTargets: z.array(graphPlanTargetSchema).optional(),
    rollbackPlan: z.string(),
    rollbackPlans: z
      .array(
        z.object({
          id: z.string(),
          scope: z.enum(["step", "phase", "global"]),
          plan: z.string(),
          targets: z.array(graphPlanTargetSchema).default([]),
        }),
      )
      .optional(),
    verificationGate: z.string(),
    steps: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        rollbackScope: z.enum(["step", "phase", "global"]).optional(),
        verificationRefs: z.array(z.string()).optional(),
        verificationTargets: z.array(graphPlanTargetSchema).optional(),
      }),
    ),
  }),
]);

export const graphPlanLayoutSchema = z.object({
  mode: z.enum(["linear", "dag", "swimlane", "tree", "freeform"]),
  order: z.array(z.string()).optional(),
  groups: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        nodeIds: z.array(z.string()),
        role: z.enum(["phase", "branch_set", "fan_out", "fan_in", "migration_stage"]).optional(),
      }),
    )
    .optional(),
});

const checkpointOutcomeSchema = z.object({
  result: z.enum(["pending", "passed", "failed", "waived"]),
  decidedAt: z.string().optional(),
  decidedBy: z.enum(["user", "agent", "system"]).optional(),
  failedCriteriaIds: z.array(z.string()).optional(),
  sourceEventIds: z.array(z.string()).optional(),
});

export const graphPlanNodeSchema = z.object({
  id: z.string(),
  kind: z.union([z.enum(["section", "action", "decision", "checkpoint", "review", "artifact", "note"]), z.string().regex(/^x-[a-z0-9._-]+$/)]),
  title: z.string(),
  summary: z.string().optional(),
  blocks: z.array(graphPlanBlockSchema),
  ownedGraphIds: z.array(z.string()).optional(),
  status: graphPlanReviewStatusSchema.optional(),
  links: z.array(graphPlanLinkSchema).optional(),
  revisionMeta: graphPlanRevisionMetaSchema.optional(),
  metadata: z
    .object({
      outcome: checkpointOutcomeSchema.optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

export const graphPlanEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(["sequence", "conditional", "dependency", "loop", "reference", "rollback"]),
  label: z.string().optional(),
  condition: graphPlanConditionSchema.optional(),
  source: graphPlanPointerSchema.optional(),
  status: graphPlanReviewStatusSchema.optional(),
  revisionMeta: graphPlanRevisionMetaSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const graphPlanGraphSchema = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string().optional(),
  owner: graphPlanPointerSchema.optional(),
  contract: z
    .object({
      inputs: z.array(graphPlanOutputDefinitionSchema).optional(),
      outputs: z.array(graphPlanOutputDefinitionSchema).optional(),
    })
    .optional(),
  nodes: z.array(graphPlanNodeSchema),
  edges: z.array(graphPlanEdgeSchema),
  layout: graphPlanLayoutSchema.optional(),
  status: graphPlanReviewStatusSchema.optional(),
  revisionMeta: graphPlanRevisionMetaSchema.optional(),
});

export const graphPlanDocumentSchema = z.object({
  schemaVersion: z.literal("graph-plan/v1"),
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  summary: z.string().optional(),
  rootGraphId: z.string(),
  graphs: z.array(graphPlanGraphSchema),
  currentRevision: z.number().int().positive(),
  revisionMeta: graphPlanRevisionMetaSchema.optional(),
});

export const graphPlanRuntimeStateSchema = z.object({
  documentId: z.string(),
  revision: z.number().int().positive(),
  blockStatuses: z.record(z.string(), graphPlanReviewStatusSchema).optional(),
  selectedOptions: z.record(z.string(), z.string()).optional(),
  checklistItems: z.record(z.string(), z.enum(["unchecked", "checked", "blocked", "waived"])).optional(),
  criteria: z.record(z.string(), z.enum(["pending", "passed", "failed", "waived"])).optional(),
  verificationOutcomes: z.record(z.string(), z.enum(["pending", "passed", "failed", "waived"])).optional(),
  outputValues: z
    .record(
      z.string(),
      z.object({
        target: graphPlanPointerSchema,
        value: jsonValueSchema,
        updatedAt: z.string().optional(),
        sourceEventIds: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  outputEntries: z
    .array(
      z.object({
        target: graphPlanPointerSchema,
        value: jsonValueSchema,
        updatedAt: z.string().optional(),
        sourceEventIds: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  events: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          id: z.string(),
          type: z.literal("experiment_run"),
          experimentId: z.string(),
          procedureGraphId: z.string().optional(),
          runNumber: z.number().int().positive(),
          result: z.enum(["supports", "refutes", "inconclusive", "passed", "failed"]),
          outputEntries: z
            .array(
              z.object({
                target: graphPlanPointerSchema,
                value: jsonValueSchema,
              }),
            )
            .optional(),
          evidenceTargets: z.array(graphPlanTargetSchema).optional(),
        }),
        z.object({
          id: z.string(),
          type: z.literal("output_value"),
          target: graphPlanPointerSchema,
          value: jsonValueSchema,
          sourceEventIds: z.array(z.string()).optional(),
        }),
        z.object({
          id: z.string(),
          type: z.literal("validator_result"),
          target: graphPlanTargetSchema.optional(),
          status: z.enum(["passed", "failed", "blocked"]),
          issueCount: z.number().int().nonnegative().optional(),
          outputEntries: z
            .array(
              z.object({
                target: graphPlanPointerSchema,
                value: jsonValueSchema,
              }),
            )
            .optional(),
        }),
        z.object({
          id: z.string(),
          type: z.literal("user_decision"),
          target: graphPlanTargetSchema,
          selectedOptionId: z.string().optional(),
          decision: z.string(),
        }),
      ]),
    )
    .optional(),
  checkpointOutcomes: z
    .record(
      z.string(),
      z.object({
        result: z.enum(["pending", "passed", "failed", "waived"]),
        decidedAt: z.string().optional(),
        decidedBy: z.enum(["user", "agent", "system"]).optional(),
        sourceEventIds: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

export type GraphPlanReviewStatus = z.infer<typeof graphPlanReviewStatusSchema>;
export type GraphPlanRevisionMeta = z.infer<typeof graphPlanRevisionMetaSchema>;
export type GraphPlanLink = z.infer<typeof graphPlanLinkSchema>;
export type GraphPlanBlock = z.infer<typeof graphPlanBlockSchema>;
export type GraphPlanLayout = z.infer<typeof graphPlanLayoutSchema>;
export type GraphPlanNode = z.infer<typeof graphPlanNodeSchema>;
export type GraphPlanEdge = z.infer<typeof graphPlanEdgeSchema>;
export type GraphPlanGraph = z.infer<typeof graphPlanGraphSchema>;
export type GraphPlanDocument = z.infer<typeof graphPlanDocumentSchema>;
export type GraphPlanRuntimeState = z.infer<typeof graphPlanRuntimeStateSchema>;
