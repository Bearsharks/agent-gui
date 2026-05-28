# Graph Block Plan Model

Status: V5 draft after additional fractal scenario review.

## Intent

Agent GUI should not assume every plan is a linear list of steps. The plan model should represent reviewable agent intent as a graph. A graph contains typed nodes and edges. A node is composed from blocks. A block can reference another graph, so plans can be fractal.

The model is review-oriented, not an execution engine. Its primary jobs are:

- make plan structure understandable in the browser;
- let users leave feedback on the right target;
- let agents reply, revise, and explain changes;
- preserve feedback and revision history as plans change.

## Priority Scenarios

1. Linear / phase implementation plan
2. Prototype review plan
3. Decision branching plan
4. Checklist / gate plan
5. Review / revision loop
6. Research fan-out / fan-in plan
7. Option comparison / selection plan
8. Debugging / hypothesis loop
9. Migration plan

## Current Candidate

The recommended model is V5. V5 keeps the V2/V3 simplification: graph structure is minimal, node kinds are coarse, edge kinds are structural, and scenario-specific meaning mostly lives in blocks. V5 adds explicit fractal ownership, active branch traceability, prototype target mapping, fan-in contracts, and revision target mappings.

## Core Model

```ts
type ReviewStatus =
  | "open"
  | "needs_revision"
  | "accepted"
  | "blocked"
  | "complete"
  | "rejected";

type RevisionMeta = {
  stableId?: string;
  createdAtRevision?: number;
  updatedAtRevision?: number;
  supersedes?: PlanTarget[];
  changeSummary?: string[];
};

type PlanDocument = {
  schemaVersion: "graph-plan/v1";
  id: string;
  title: string;
  goal: string;
  summary?: string;
  rootGraphId: string;
  graphs: PlanGraph[];
  currentRevision: number;
  revisionMeta?: RevisionMeta;
};

type PlanGraph = {
  id: string;
  title: string;
  purpose?: string;
  owner?: PlanPointer;
  nodes: PlanNode[];
  edges: PlanEdge[];
  layout?: GraphLayout;
  status?: ReviewStatus;
  revisionMeta?: RevisionMeta;
};

type GraphLayout = {
  mode: "linear" | "dag" | "swimlane" | "tree" | "freeform";
  order?: string[];
  groups?: Array<{
    id: string;
    title: string;
    nodeIds: string[];
    role?: "phase" | "branch_set" | "fan_out" | "fan_in" | "migration_stage";
  }>;
};

type NodeKind =
  | "section"
  | "action"
  | "decision"
  | "checkpoint"
  | "review"
  | "artifact"
  | "note";

type PlanNode = {
  id: string;
  kind: NodeKind;
  title: string;
  summary?: string;
  blocks: PlanBlock[];
  ownedGraphIds?: string[];
  status?: ReviewStatus;
  links?: PlanLink[];
  revisionMeta?: RevisionMeta;
  metadata?: Record<string, unknown>;
};

type EdgeKind =
  | "sequence"
  | "conditional"
  | "dependency"
  | "loop"
  | "reference"
  | "rollback";

type PlanEdge = {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  condition?: EdgeCondition;
  source?: PlanPointer;
  status?: ReviewStatus;
  revisionMeta?: RevisionMeta;
  metadata?: Record<string, unknown>;
};
```

## Pointers And Targets

Pointers are internal references used by conditions, links, and block payloads. Targets are feedback/revision anchors.

```ts
type PlanPointer = {
  graphId?: string;
  nodeId?: string;
  blockId?: string;
  itemId?: string;
  outputKey?: string;
};

type PlanTarget =
  | { type: "plan" }
  | { type: "graph"; graphId: string }
  | { type: "node"; graphId: string; nodeId: string }
  | { type: "block"; graphId: string; nodeId: string; blockId: string }
  | {
      type: "block_item";
      graphId: string;
      nodeId: string;
      blockId: string;
      itemId: string;
      itemType?: "task" | "check" | "criterion" | "option" | "evidence" | "finding" | "verification" | "hypothesis" | "migration_step";
    }
  | { type: "edge"; graphId: string; edgeId: string }
  | { type: "prototype_piece"; graphId: string; nodeId: string; blockId: string; prototypeId: string; pieceId: string };

type PlanLink = {
  target: PlanTarget;
  purpose:
    | "explains"
    | "validates"
    | "alternative"
    | "final_candidate"
    | "depends_on"
    | "mitigates"
    | "produces"
    | "tests_interaction"
    | "shows_state"
    | "implements_option";
};

type EdgeCondition = {
  label: string;
  source?: PlanPointer;
  operator?: "equals" | "not_equals" | "exists" | "contains" | "all_checked" | "any_checked" | "passed" | "failed";
  value?: unknown;
};
```

## Blocks

Every block has a common base. Blocks can expose item IDs so users can leave feedback on the exact checklist item, option, evidence item, verification check, or migration step.

```ts
type BlockBase = {
  id: string;
  type: string;
  title?: string;
  summary?: string;
  status?: ReviewStatus;
  links?: PlanLink[];
  revisionMeta?: RevisionMeta;
  metadata?: Record<string, unknown>;
};

type PlanBlock =
  | TextBlock
  | GraphRefBlock
  | TaskListBlock
  | ChecklistBlock
  | CriteriaBlock
  | ReviewBundleBlock
  | PrototypeBlock
  | ChoiceSetBlock
  | ComparisonBlock
  | EvidenceBlock
  | SynthesisBlock
  | RiskBlock
  | VerificationBlock
  | ArtifactBlock
  | ChangeLogBlock
  | InvestigationBlock
  | MigrationBlock;
```

Essential block responsibilities:

- `text`: explanatory content.
- `graph_ref`: reference to a child graph by `graphId`; child graphs stay top-level and targetable. Use `relationship` to describe whether the child graph decomposes the node, explains an option, shows prototype state flow, describes revision work, captures evidence branch detail, defines experiment procedure, or describes migration cutover detail. Use `ownership` to distinguish owned child graphs from contextual references.
- `task_list`: ordered or grouped work items.
- `checklist`: gate/readiness items with required flags and evidence links.
- `criteria`: pass/fail or quality criteria reusable by checkpoints, choices, and reviews.
- `review_bundle`: review prompt, linked targets, acceptance criteria, optional prototype reference.
- `prototype`: URL tabs, prototype pieces, code refs, prototype revision/hash.
- `choice_set`: compact decision options with candidate/selected/rejected state and rationale.
- `comparison`: criteria matrix for substantial option evaluation.
- `evidence`: sources, claims, confidence, provenance.
- `synthesis`: fan-in summary, findings, conclusion, unresolved questions.
- `risk`: severity, mitigation, linked evidence/verification.
- `verification`: checks, expected signal, actual outcome.
- `artifact`: file, URL, generated output, code reference.
- `changelog`: revision delta with changed targets.
- `investigation`: hypotheses, experiments, observations, outcomes.
- `migration`: from/to versions, affected surfaces, compatibility strategy, cutover, rollback, acceptance checks.

## V3 Traceability Conventions

V3 does not add more structural primitives. It tightens the fields that make review, revision, and audit behavior reliable.

## V5 Fractal Conventions

V5 adds conventions and schema fields for prose scenarios where a node contains or owns a child graph.

- Use `PlanNode.ownedGraphIds` when a child graph is part of the node's decomposition.
- Use a `graph_ref` block to make the child graph visible in node content.
- Use `graph_ref.relationship` to explain the child graph's role.
- Use `graph_ref.ownership = "owned"` for canonical child graphs and `Graph.owner` as the reverse pointer.
- Use typed evidence refs `{ graphId, nodeId?, blockId, itemId }` when synthesis cites evidence across graph boundaries.
- Use `changelog.entries[].mappings[]` when a revision changes target identity, especially rename/split/merge/move cases.
- Use `choice_set.selectedOptionId` as the canonical active branch source. Option `status` and `activation` should agree with it.
- Use `choice_set.options[].downstreamGraphId` or `comparison.options[].downstreamGraphId` when a selected option activates a child graph.
- Use `investigation.experiments[].procedureGraphId` when an experiment is expanded as a child graph.
- Use `prototypePiece.primaryTarget` as the canonical target validated by a prototype piece. Use `validates` only for additional related targets.
- Use `synthesis.joinPolicy`, `sourceBranchRefs`, and `conclusionEvidenceRefs` when a fan-in conclusion depends on required branches.
- Use `checkpoint_outcome` when a checkpoint result needs its own feedback target or provenance.
- Use `migration.compatibility.items[]` and `migration.rollbackPlans[]` when compatibility/rollback details need item-level feedback.

### Checkpoint Outcome

Checkpoint nodes should expose a queryable outcome in `metadata.outcome` when a gate has been evaluated.

```ts
type CheckpointOutcome = {
  result: "pending" | "passed" | "failed" | "waived";
  decidedAt?: string;
  decidedBy?: "user" | "agent" | "system";
  failedCriteriaIds?: string[];
  sourceEventIds?: string[];
};
```

### Review Trace

Review-oriented blocks such as `review_bundle` and `changelog` should link back to the session events that caused or resolved the change.

```ts
type ReviewResolution = "open" | "addressed" | "deferred" | "rejected";

type ReviewTrace = {
  sourceEventIds: string[];
  resolution?: ReviewResolution;
  changedTargets?: PlanTarget[];
};
```

### Evidence And Synthesis

Evidence items must have stable IDs. Synthesis entries should cite evidence item IDs so conclusions are auditable.

```ts
type EvidenceItem = {
  id: string;
  source: string;
  claim: string;
  confidence?: "low" | "medium" | "high";
};

type SynthesisEntry = {
  id: string;
  finding: string;
  evidenceRefs: string[];
};
```

### Prototype Piece Traceability

Prototype pieces must have stable IDs within their prototype. When a piece is a feedback anchor, the `prototype_piece` target must include `graphId`, `nodeId`, and `blockId` so the UI can show the plan context next to the prototype context.

### Investigation Shape

`investigation` blocks should make these fields explicit:

- `hypotheses`
- `experiments`
- `observations`
- `outcomes`
- `nextAction`
- `exitCondition`

### Migration Shape

`migration` blocks should make these fields explicit:

- `fromVersion`
- `toVersion`
- `affectedSurfaces`
- `compatibilityStrategy`
- `rollbackScope`: `step`, `phase`, or `global`
- `rollbackPlan`
- `verificationGate`

## Canonical Patterns

### Linear / Phase Implementation

Use `Graph.layout.mode = "linear"` and `layout.order`. Model phases as `section` nodes. Put small tasks in `task_list`; promote a task to a node only when it needs its own blocks, feedback, prototype linkage, or subgraph.

### Prototype Review

Use a `review` node with `review_bundle` and, when needed, `prototype`. Put prototype pieces inside the `prototype` block and target them with `prototype_piece`. Use session events as the source of truth for actual feedback and approval.

### Decision Branching

Use `choice_set` for compact decisions where choices do not create distinct downstream work. Store selected/rejected state on choice items. Add `conditional` edges only when branches have distinct downstream nodes or subgraphs.

### Checklist / Gate

Use a `checkpoint` node with `criteria`, `checklist`, `verification`, and `risk` blocks. Outgoing conditional edges can reference checkpoint outputs.

### Review / Revision Loop

Use `review` or `checkpoint` nodes to mark review points in the intended plan. Do not encode every reply/revision as graph topology. Session events remain canonical; `changelog` summarizes what changed.

### Research Fan-Out / Fan-In

Use layout groups for branches, branch nodes with `evidence` blocks, and a `synthesis` block or node for convergence. A synthesis block should reference branch findings by item ID.

### Option Comparison / Selection

Use `choice_set` for simple choices and `comparison` for criteria matrices. Use separate option subgraphs only when alternatives need substantial independent detail.

### Debugging / Hypothesis Loop

Use an `investigation` block for hypotheses, experiments, observations, and outcomes. Use `loop` edges only for the coarse retry path, not every investigative iteration.

### Migration

Use a `migration` block for migration-specific metadata and `checkpoint` nodes for cutover readiness, rollback readiness, and post-migration acceptance.
