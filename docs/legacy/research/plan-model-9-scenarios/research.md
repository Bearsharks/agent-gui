# 9 Scenario Plan Model Research

## Goal

Agent GUI의 브라우저 리뷰 루프에 맞는 더 단순한 plan model을 새로 설계한다. 목표는 실행 엔진이 아니라 사용자가 계획을 이해하고, 정확한 대상에 피드백을 남기고, 에이전트 답변과 revision을 비교한 뒤 승인할 수 있는 모델이다.

## Assumptions

- 현재 구현의 핵심 가치는 `PlanSession`, targeted feedback, agent reply, revision, approval loop이다.
- 먼저 모델을 정의하고, 각 루프의 서브에이전트는 해당 모델을 사용해 9개 시나리오별 그래프 산출물을 만든다.
- 이 연구의 산출물은 즉시 구현 가능한 TypeScript schema 초안이 아니라, 현재 step 중심 model을 대체하거나 병행할 graph/block model의 제품/도메인 구조다.
- 우선순위가 낮은 tutoring, document generation, broad collaboration, data analysis 시나리오는 모델을 복잡하게 만들기 위한 독립 요구사항으로 취급하지 않는다.

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

## Loop Summaries

### Experiment Workflow

각 루프는 같은 9개 시나리오를 대상으로 한다.

1. 현재 candidate model을 서브에이전트에게 제공한다.
2. 서브에이전트는 담당 시나리오를 graph로 표현하고, feedback target과 schema gap을 보고한다.
3. 메인 에이전트는 결과를 종합해 모델을 수정한다.
4. 다음 루프는 수정된 모델로 다시 같은 검증을 반복한다.

모델 배정:

- Loop 1: `gpt-5.5`
- Loop 2: `gpt-5.4`
- Loop 3: `gpt-5.3` 계열. 현재 tool에서 정확한 `gpt-5.3` override가 노출되지 않으면 `gpt-5.3-codex`를 사용한다.

### Candidate Model V0

V0는 기존 `PlanDraft.steps` 중심 구조를 일반화해 `Graph`, `Node`, `Edge`, `Block`을 1급 객체로 둔다.

```ts
type PlanDocument = {
  id: string;
  title: string;
  goal: string;
  rootGraphId: string;
  graphs: PlanGraph[];
  currentRevision: number;
};

type PlanGraph = {
  id: string;
  title: string;
  purpose?: string;
  nodes: PlanNode[];
  edges: PlanEdge[];
  entryNodeIds: string[];
  exitNodeIds?: string[];
};

type PlanNode = {
  id: string;
  kind:
    | "phase"
    | "task"
    | "decision"
    | "gate"
    | "review"
    | "research"
    | "option"
    | "hypothesis"
    | "migration"
    | "artifact"
    | "note";
  title: string;
  summary?: string;
  blocks: PlanBlock[];
  status?: "open" | "needs_revision" | "accepted" | "blocked" | "complete";
  metadata?: Record<string, unknown>;
};

type PlanEdge = {
  id: string;
  from: string;
  to: string;
  kind:
    | "sequence"
    | "conditional"
    | "dependency"
    | "parallel"
    | "merge"
    | "loop"
    | "gate"
    | "rollback"
    | "reference";
  label?: string;
  condition?: EdgeCondition;
  sourceBlockId?: string;
  metadata?: Record<string, unknown>;
};

type EdgeCondition = {
  label: string;
  source?: {
    graphId?: string;
    nodeId: string;
    blockId?: string;
    outputKey?: string;
  };
  operator?: "equals" | "not_equals" | "exists" | "contains" | "all_checked" | "any_checked";
  value?: unknown;
};
```

V0 block set:

- `text`: 설명, 배경, scope, rationale.
- `graph`: 하위 graph reference. 이 block으로 fractal structure를 만든다.
- `checklist`: gate, readiness, verification criteria.
- `prototype`: URL tab, prototype piece, artifact linkage.
- `question`: 사용자 선택/답변 수집. output을 edge condition이 참조한다.
- `decision`: 선택지, selected option, rationale.
- `evidence`: research source, finding, confidence.
- `risk`: risk, severity, mitigation.
- `verification`: test/check command, expected signal.
- `artifact`: file, URL, code reference, generated output.
- `changelog`: revision delta와 review response.

V0 target model:

```ts
type PlanTarget =
  | { type: "plan"; id?: string }
  | { type: "graph"; id: string }
  | { type: "node"; id: string; graphId?: string }
  | { type: "block"; id: string; nodeId: string; graphId?: string }
  | { type: "edge"; id: string; graphId?: string }
  | { type: "prototype_piece"; id: string; prototypeId: string };
```

### Loop 1 Findings

Status: complete.

Input model: V0.

Findings:

- V0 can express all 9 scenarios at graph shape level: linear chains, phase containers, prototype loops, conditional branches, gates, review loops, fan-out/fan-in, option comparison, hypothesis loops, and migration rollback paths.
- The main weakness is target precision. Nested/fractal graphs make plain IDs ambiguous, and feedback/revision history needs path-aware targets like `graphId + nodeId + blockId`.
- Every block variant needs required common fields: `id`, `type`, `title?`, `summary?`, `status?`, `links?`, `metadata?`.
- Edge semantics need more than `kind`. `merge` must distinguish alternate branch convergence from parallel fan-in; gates and fan-in need `joinPolicy: "all" | "any" | "manual"`.
- Conditions should stay review-oriented, but the source reference must be structured, not a string path. Conditions need to point at decision option IDs, checklist item IDs, and test outcomes.
- `DecisionBlock` and `option` nodes overlap. The better rule is: use `DecisionBlock` for compact inline choices; use `option` nodes plus an `OptionSetBlock` or `ComparisonBlock` when each option has substantial evidence/risk/prototype content.
- Prototype data can be represented as a `PrototypeBlock`, but it needs enough structure to replace or reference current top-level `plan.prototypes`: URL tabs, pieces, code refs, piece links, and prototype revision identity.
- Review/revision loop history should stay in events, but graph/block model needs `ChangeLogBlock` and revision metadata so the UI can show what changed on targeted graph elements.
- Scenario-specific additions that are useful but should not dominate the core model: comparison table rows, hypothesis lifecycle/result, migration plan details, evidence provenance, and checklist evidence links.

### Candidate Model V1

V1 keeps the V0 primitives and tightens identity, references, and typed block payloads.

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
  nodes: PlanNode[];
  edges: PlanEdge[];
  entryNodeIds: string[];
  exitNodeIds?: string[];
  layout?: GraphLayout;
  status?: ReviewStatus;
  revisionMeta?: RevisionMeta;
};

type GraphLayout = {
  mode: "linear" | "dag" | "swimlane" | "tree" | "freeform";
  order?: string[];
  groups?: Array<{ id: string; title: string; nodeIds: string[] }>;
};

type PlanNode = {
  id: string;
  kind:
    | "phase"
    | "task"
    | "decision"
    | "gate"
    | "review"
    | "research"
    | "option"
    | "hypothesis"
    | "migration"
    | "artifact"
    | "note";
  title: string;
  summary?: string;
  blocks: PlanBlock[];
  status?: ReviewStatus;
  links?: PlanLink[];
  revisionMeta?: RevisionMeta;
  metadata?: Record<string, unknown>;
};

type PlanEdge = {
  id: string;
  from: string;
  to: string;
  kind:
    | "sequence"
    | "conditional"
    | "dependency"
    | "parallel"
    | "merge"
    | "loop"
    | "gate"
    | "rollback"
    | "reference";
  label?: string;
  condition?: EdgeCondition;
  joinPolicy?: "all" | "any" | "manual";
  branchState?: "candidate" | "selected" | "rejected" | "inactive";
  source?: PlanPointer;
  status?: ReviewStatus;
  revisionMeta?: RevisionMeta;
  metadata?: Record<string, unknown>;
};

type PlanPointer = {
  graphId?: string;
  nodeId?: string;
  blockId?: string;
  itemId?: string;
  outputKey?: string;
};

type EdgeCondition = {
  label: string;
  source?: PlanPointer;
  operator?: "equals" | "not_equals" | "exists" | "contains" | "all_checked" | "any_checked" | "confirmed" | "failed";
  value?: unknown;
};

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
```

V1 targets are path-aware:

```ts
type PlanTarget =
  | { type: "plan" }
  | { type: "graph"; graphId: string }
  | { type: "node"; graphId: string; nodeId: string }
  | { type: "block"; graphId: string; nodeId: string; blockId: string }
  | { type: "block_item"; graphId: string; nodeId: string; blockId: string; itemId: string }
  | { type: "edge"; graphId: string; edgeId: string }
  | { type: "prototype_piece"; graphId: string; nodeId: string; blockId: string; prototypeId: string; pieceId: string };
```

V1 block common shape:

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
```

V1 block set:

- `text`: markdown/plain descriptive content.
- `graph`: `{ graphId }` reference only; graphs remain top-level addressable objects.
- `checklist`: item IDs, required/optional, status, evidence links.
- `prototype`: URL tabs, pieces, code refs, prototype revision/hash, links to graph targets.
- `question`: prompt, choices, outputs that conditional edges can reference.
- `decision`: compact options, selected option, rationale, rejected rationale.
- `comparison`: criteria matrix for option comparison/selection.
- `evidence`: sources, claims, confidence, provenance.
- `risk`: severity, mitigation, linked verification/evidence.
- `verification`: checks, command/manual signal, expected result, outcome.
- `artifact`: file/URL/generated output/code reference.
- `changelog`: from/to revision and changed targets.
- `hypothesis`: hypothesis lifecycle, experiment, result, evidence links.
- `migration`: from/to version, affected artifacts, compatibility strategy, rollback plan, acceptance checks.

Loop 1 improvement:

V1 moves target precision, revision identity, join semantics, and typed payloads into the core model while preserving the original idea that `Graph`, `Node`, `Edge`, and `Block` are the only structural primitives.

### Loop 2 Findings

Status: complete.

Input model: V1.

Findings:

- V1 is expressive enough for all 9 priority scenarios.
- The recurring issue is semantic duplication:
  - `gate` can be a node kind, edge kind, checklist block, verification block, or condition.
  - `decision` can be a node, block, option nodes, comparison block, conditional edge state, or branch state.
  - `review` can be a node/loop in the graph, but the actual product already has event/revision history as canonical review state.
  - `hypothesis` and `migration` appear both as node kind and block type.
- The graph should describe plan structure, while events remain the source of truth for actual feedback/revision history.
- Edge kinds should be less workflow-engine-like. Reviewers generally care about what is being decided or checked, not a full executable control-flow graph.
- Common authoring/review patterns need canonical shapes:
  - ordered phase plan;
  - prototype review bundle;
  - choice/option set;
  - gate/checkpoint;
  - synthesis/fan-in;
  - investigation/hypothesis loop;
  - migration/cutover checkpoint.
- `block_item` is technically enough, but users and UI will benefit from typed item categories such as checklist item, option, criterion, evidence item, verification check, prototype piece.

### Candidate Model V2

V2 keeps graph structure but narrows the core. Most semantics live in blocks; node kind is a coarse presentation hint. Edge kinds are structural, not domain-specific.

```ts
type NodeKind =
  | "section"
  | "action"
  | "decision"
  | "checkpoint"
  | "review"
  | "artifact"
  | "note";

type EdgeKind =
  | "sequence"
  | "conditional"
  | "dependency"
  | "loop"
  | "reference"
  | "rollback";
```

Removed or demoted from core:

- `edge.kind = "gate"`: gate is modeled as a `checkpoint` node with checklist/verification/criteria blocks.
- `edge.kind = "merge"` and `edge.kind = "parallel"`: fan-out/fan-in are represented by multiple edges plus `layout.groups`, `joinPolicy`, and a `synthesis` block/node.
- `edge.branchState`: branch state belongs to option/choice/hypothesis/checkpoint items, not the connector.
- Highly specific node kinds such as `hypothesis`, `migration`, `option`, and `research`: these become blocks or item types inside a node. A node can still use `metadata.domain` for display badges.

V2 canonical patterns:

1. Ordered phase plan
   - `Graph.layout.mode = "linear"`
   - `Graph.layout.order = nodeIds`
   - phase nodes use `kind: "section"`
   - work items usually live in `checklist` or `task_list` blocks unless each item needs its own feedback surface.

2. Prototype review plan
   - one `review` node
   - `review_bundle` block contains prototype reference, review questions, acceptance criteria, and linked targets.
   - `prototype` block remains a lower-level artifact block for URL tabs/pieces when the prototype itself is the focus.

3. Decision branching plan
   - compact choices use `choice_set` block.
   - heavyweight alternatives use separate nodes connected by `conditional` edges.
   - selected/rejected/candidate state is stored on choice/option items.

4. Checklist / gate plan
   - `checkpoint` node with `criteria`, `checklist`, `verification`, and `risk` blocks.
   - outgoing `conditional` edges can reference checkpoint result.

5. Review / revision loop
   - graph uses `review` or `checkpoint` nodes only to mark where review occurs.
   - session events remain canonical for actual feedback, replies, revisions, and approvals.
   - `changelog` block summarizes revisions but does not replace events.

6. Research fan-out / fan-in
   - branch nodes contain `evidence` and `finding` items.
   - synthesis node/block summarizes branch outputs.
   - layout groups can visually mark fan-out branches.

7. Option comparison / selection
   - `choice_set` or `comparison` block owns criteria, candidates, scores, selected option, and rejected rationale.
   - option nodes are reserved for alternatives with substantial internal subgraphs.

8. Debugging / hypothesis loop
   - `investigation` block owns hypotheses, experiments, observations, outcomes.
   - loop edges represent structural retry, not every test iteration.

9. Migration plan
   - `migration` block owns from/to versions, affected surfaces, compatibility strategy, cutover, rollback, and checkpoints.
   - `checkpoint` nodes mark cutover readiness and post-migration acceptance.

V2 essential block types:

- `text`
- `graph_ref`
- `task_list`
- `checklist`
- `criteria`
- `review_bundle`
- `prototype`
- `choice_set`
- `comparison`
- `evidence`
- `synthesis`
- `risk`
- `verification`
- `artifact`
- `changelog`
- `investigation`
- `migration`

V2 improvement:

V2 is less expressive as a workflow engine but better as a review model. It keeps graph/block flexibility while giving authors canonical shapes for the 9 priority scenarios.

### Loop 3 Findings

Status: complete.

Input model: V2.

Findings:

- V2 cleanly represents all 9 priority scenarios.
- No structural redesign is needed for V3.
- Remaining issues are authoring conventions and small traceability fields:
  - Linear/phase plans need a clear convention: phase is a `section` or `action` node in a linear graph, not a separate primitive.
  - Prototype pieces need stable IDs and structural back-reference metadata so comments remain traceable to the graph/node/block context.
  - Decision branching needs a rule: use `choice_set` when choices do not produce distinct downstream work; use `conditional` edges only when branches have distinct downstream nodes.
  - Checkpoints need queryable outcome fields instead of requiring the UI to infer pass/fail entirely from events/checklist state.
  - Review/revision content should link to triggering event IDs and track whether requested changes are open, addressed, or deferred.
  - Evidence items need stable IDs, and synthesis entries should reference evidence IDs for auditability.
  - Investigation blocks should make hypothesis, experiment, result, next action, and exit condition explicit.
  - Migration phases should declare rollback scope (`step`, `phase`, or `global`) and verification gate.

### Candidate Model V3

V3 is V2 plus the following clarifications:

- `checkpoint` nodes may include `metadata.outcome`:

```ts
type CheckpointOutcome = {
  result: "pending" | "passed" | "failed" | "waived";
  decidedAt?: string;
  decidedBy?: "user" | "agent" | "system";
  failedCriteriaIds?: string[];
  sourceEventIds?: string[];
};
```

- Review and changelog blocks can link to event threads:

```ts
type ReviewResolution = "open" | "addressed" | "deferred" | "rejected";

type ReviewTrace = {
  sourceEventIds: string[];
  resolution?: ReviewResolution;
  changedTargets?: PlanTarget[];
};
```

- Evidence blocks expose stable evidence item IDs, and synthesis entries reference them:

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

- Prototype pieces require stable IDs and should include graph context when they are intended as feedback anchors.

- Investigation blocks should use explicit fields for:
  - `hypotheses`
  - `experiments`
  - `observations`
  - `outcomes`
  - `nextAction`
  - `exitCondition`

- Migration blocks should use explicit fields for:
  - `fromVersion`
  - `toVersion`
  - `affectedSurfaces`
  - `compatibilityStrategy`
  - `rollbackScope`
  - `rollbackPlan`
  - `verificationGate`

Final V3 recommendation:

Use V2 as the structural model and add V3 traceability conventions. Do not add more graph primitives until implementation pressure proves they are necessary.

## Final Recommendation

The recommended model is documented in `graph-block-plan-model.md`.

The core decision is to treat Agent GUI plans as reviewable graph documents:

- `PlanDocument` owns top-level graphs and revision identity.
- `Graph` owns nodes, edges, and layout.
- `Node` is a coarse container: `section`, `action`, `decision`, `checkpoint`, `review`, `artifact`, or `note`.
- `Block` carries most domain meaning.
- `Edge` carries structural relationships only.
- `PlanTarget` is path-aware so feedback and revisions can reliably address graph, node, block, block item, edge, and prototype piece.
- Session events remain the source of truth for actual feedback/reply/revision/approval history.

This covers the 9 priority scenarios without optimizing for lower-priority scenarios.

## Additional Fractal Loops

사용자 피드백에 따라 모델을 곧바로 scenario instance로 검증하지 않고, 별도 줄글 corpus를 만들었다.

- Scenario corpus: `fractal-scenarios.md`
- Zod model: `packages/plan-schema/src/graphPlan.ts`

각 scenario는 최소 depth 1 이상의 fractal structure를 요구한다.

### Loop 4 Findings

Status: complete.

Input model: V3 Zod schema plus prose fractal scenarios.

Findings:

- 9개 fractal scenario는 모두 V3 구조로 표현 가능하다.
- 다만 몇몇 관계가 convention에 의존했다.
- `graph_ref.relationship`이 자유 문자열이면 하위 graph가 어떤 의미로 연결되는지 UI가 안정적으로 해석하기 어렵다.
- Node가 소유한 child graph와 단순 reference graph가 구분되지 않았다.
- Cross-graph evidence refs가 문자열이면 evidence item ID 충돌 가능성이 있다.
- `changelog`는 changed target만 표현하고 previous target을 직접 표현하지 않아 old/new target mapping이 약했다.
- `investigation.experiments[].procedure`는 문자열이라 하위 experiment graph와 직접 연결되지 않았다.
- `choice_set.options[].downstreamTarget`은 선택된 option일 때만 활성화되는 branch인지 명확하지 않았다.
- Prototype piece mapping은 `context`와 `links`로 나뉘어 있어 canonical field가 필요했다.

### Candidate Model V4

V4는 V3 구조를 유지하면서 fractal 검증에서 드러난 traceability gap을 schema에 반영했다.

Schema changes:

- `graph_ref.relationship`을 enum으로 제한:
  - `decomposes_node`
  - `phase_detail`
  - `option_detail`
  - `prototype_state_flow`
  - `revision_work`
  - `evidence_branch`
  - `experiment_procedure`
  - `cutover_detail`
  - `related_context`
- `PlanNode.ownedGraphIds` 추가. Node가 어떤 child graph를 소유하는지 명시한다.
- Evidence reference는 문자열 또는 `{ graphId, nodeId?, blockId, itemId }` 형태를 허용한다.
- `EvidenceItem.sourcePointer` 추가.
- `SynthesisEntry.evidenceRefs`는 typed evidence refs를 받을 수 있다.
- `ChangeLogEntry.previousTargets` 추가.
- `choice_set.options[]`에 `downstreamGraphId`와 `activation` 추가.
- `comparison`에 `selectedOptionId`, `recommendationRationale`, score item ID 추가.
- `prototypePiece.validates` 추가.
- `review_bundle.prototypeRef.target` 추가.
- `investigation.experiments[]`에 `procedureGraphId`와 `procedureTarget` 추가.
- `block_item.itemType`에 `experiment`, `score` 추가.
- `migration.compatibility`와 `rollbackTargets` 추가.

Loop 4 conclusion:

V4는 graph model을 workflow engine으로 확장하지 않고, fractal ownership과 cross-graph traceability를 명시하는 방향으로 개선했다.

### Loop 5 Findings

Status: complete.

Input model: V4 Zod schema plus prose fractal scenarios.

Findings:

- V4는 9개 fractal scenario의 대부분을 표현하지만, target precision이 중요한 몇 지점은 여전히 convention에 의존했다.
- Branch activation에서 `selectedOptionId`, option `status`, `activation`, `downstreamTarget`, `downstreamGraphId`가 서로 불일치할 수 있다.
- Prototype piece mapping에서 `context`, `links`, `validates`가 모두 optional이거나 역할이 겹쳐 primary validated target이 명확하지 않았다.
- Child graph ownership은 `ownedGraphIds`와 `graph_ref`가 동시에 존재해 drift 가능성이 있었다.
- Changelog의 `previousTargets[]`와 `changedTargets[]`는 old/new mapping을 pair로 표현하지 못했다.
- Synthesis는 finding별 evidence ref는 가능하지만, final conclusion 자체의 evidence ref와 fan-in join policy가 부족했다.
- Checkpoint outcome은 metadata convention에 가까워 outcome provenance를 targetable하게 표현하기 어려웠다.
- Comparison option row에 child graph/branch link가 없어 option comparison scenario에서 selected row와 implementation subgraph 연결이 약했다.
- Migration compatibility/rollback detail이 문자열 중심이라 세부 항목에 feedback을 남기기 어렵다.

### Candidate Model V5

V5는 V4를 baseline으로 유지하면서 Loop 5에서 발견한 target precision gap을 줄였다.

Schema changes:

- `Graph.owner` 추가. Child graph가 어느 graph/node/block/item에 소속되는지 역참조할 수 있다.
- `graph_ref.ownership` 추가. `owned`와 `referenced`를 구분한다.
- `prototypePiece.primaryTarget`을 required field로 추가. `validates`는 추가 target list로 둔다.
- `choice_set.options[]`의 branch fields는 유지하되, authoring rule상 `selectedOptionId`가 canonical active branch source가 된다.
- `comparison.options[]`에 `downstreamTarget`, `downstreamGraphId`, `activation` 추가.
- `comparison`에 `selectedOptionId`, `recommendationRationale`, score item ID 추가.
- `changelog.entries[].mappings[]` 추가. 각 mapping은 `changeKind`, `sourceEventIds`, `previousTargets`, `newTargets`를 가진다.
- `changelog.entries[].sourceEventIds` 추가.
- `synthesis`에 `sourceBranchRefs`, `joinPolicy`, `conclusionEvidenceRefs` 추가.
- `checkpoint_outcome` block 추가. Gate 결과와 determining refs를 targetable block으로 표현할 수 있다.
- `migration.compatibility.items[]` 추가. read/write/legacy session policy를 targetable item으로 표현한다.
- `migration.rollbackPlans[]` 추가. rollback plan을 scope/target별 item으로 표현한다.

Loop 5 conclusion:

V5는 fractal scenario corpus를 기준으로 남아 있던 구조적 blocker를 대부분 제거한다. 남은 영역은 schema보다 authoring validation 문제다. 예를 들어 `selectedOptionId`가 가리키는 option이 실제로 `status: "selected"`인지, `ownedGraphIds`와 `graph_ref.ownership = "owned"`가 일치하는지는 별도 semantic validator에서 확인하는 편이 맞다.

## Semantic Validator And Fixture Pass

Loop 5 이후에는 추가 모델 루프보다 semantic validator와 대표 fixture가 더 높은 신호를 준다고 판단했다.

Added files:

- `packages/plan-schema/src/graphPlanSemanticValidator.ts`
- `packages/plan-schema/src/graphPlanFixtures.ts`

Validator responsibilities:

- root graph existence
- graph/node/block/edge duplicate detection
- target resolution for graph, node, block, block item, edge, prototype piece
- pointer resolution
- graph ownership consistency between `Graph.owner`, `PlanNode.ownedGraphIds`, and owned `graph_ref`
- selected option consistency in `choice_set`
- downstream graph/target existence for `choice_set` and `comparison`
- prototype piece `primaryTarget` and `validates` target resolution
- typed evidence ref resolution across graphs
- synthesis source/evidence refs
- changelog old/new target mappings
- investigation hypothesis/experiment/procedure graph consistency
- migration rollback target resolution

Representative fixtures:

1. Linear / phase implementation plan with an owned implementation child graph.
2. Prototype review plan with a prototype state child graph and target-aware prototype piece.
3. Decision branching plan with a selected adapter branch child graph.

Validation result:

- `pnpm --filter @agent-gui/plan-schema typecheck` passed.
- Runtime fixture import passed and loaded 3 fixtures.

## Loop 6 Parallel Authoring Test

Status: complete.

Input:

- V5 Zod model
- Semantic validator
- 3 passing fixtures
- Prose fractal scenario corpus

Method:

6개 서브에이전트를 병렬 실행했다. 각 에이전트는 더 복잡한 depth 2급 scenario를 `GraphPlanDocument` 형태로 설계하고, validator-sensitive reference와 schema/validator friction을 보고했다.

Assigned complex scenarios:

1. Multi-phase migration: root migration phases -> cutover child graph -> rollback drill child graph.
2. Prototype review: prototype interaction-state child graph -> nested failure-state debugging graph.
3. Research fan-out/fan-in: each research branch owns a child graph; synthesis cites all branches.
4. Option comparison: heavyweight options own child graphs; selected option owns implementation child graph; changelog maps old option target to new branch.
5. Debugging loop: two hypotheses; each experiment owns procedure child graph; one procedure owns nested prototype inspection graph.
6. Review/revision loop: one feedback event splits a block target into two new block targets in different child graphs and updates prototype piece mappings.

Loop 6 findings:

- V5 can express all 6 complex authoring scenarios without requiring new core primitives.
- Depth 2 fractal ownership works with `Graph.owner`, `PlanNode.ownedGraphIds`, and owned `graph_ref`.
- `prototypePiece.primaryTarget` makes prototype target mapping much clearer.
- `changelog.entries[].mappings[]` handles split/replace target lineage better than loose previous/changed arrays.
- `synthesis.joinPolicy = "all"` plus typed evidence refs expresses all-branch fan-in cleanly.
- Remaining frictions were mostly validator coverage:
  - `migration.steps[].verificationRefs` were plain strings.
  - `graph_ref.relationship` lacked rollback/debug-specific values.
  - validator checked graph owner graph/node but not exact owner block.
  - validator checked target existence but not `block_item.itemType` consistency.
  - validator did not check whether `joinPolicy: "all"` cites evidence from every source branch.
  - validator did not check split/merge mapping cardinality.
  - edge condition `outputKey` remains a convention; validator only checks pointer existence.

Changes applied after Loop 6:

- Added `risk`, `artifact`, and `change` to `block_item.itemType`.
- Added `rollback_drill` and `debug_detail` to `graph_ref.relationship`.
- Added `status` and `rationale` to `comparison.options[]`.
- Added `migration.steps[].verificationTargets[]` for targetable verification references.
- Validator now checks exact owned graph owner block id.
- Validator now checks `block_item.itemType` consistency.
- Validator now checks `synthesis.joinPolicy = "all"` has evidence from each graph source branch.
- Validator now warns on suspicious split/merge target mapping cardinality.
- Validator now resolves `migration.steps[].verificationTargets[]`.

Validation result:

- `pnpm --filter @agent-gui/plan-schema typecheck` passed.
- Runtime fixture import passed and loaded 3 fixtures.

Loop 6 conclusion:

The model is stable enough to move from research to implementation planning. Further model loops are less valuable than using the validator against real converted sessions and UI fixtures. The next useful work is a real adapter from current `PlanDraft` to `GraphPlanDocument`, plus a first graph-aware review UI projection.

## Loop 7 Adversarial Validator Test

Status: complete.

Goal:

모델 primitive를 더 늘리는 대신, 현재 semantic validator가 잘못 작성된 graph plan을 실제로 잡는지 확인했다. 이번 루프의 입력은 정상 fixture가 아니라 "Zod schema는 통과하지만 의미적으로 깨진 문서"다.

Added file:

- `packages/plan-schema/src/graphPlanAdversarialFixtures.ts`

Method:

공통 base graph를 만든 뒤, 각 fixture가 하나 이상의 semantic breakage를 주입한다. 각 fixture는 `expectedIssueCodes`를 선언하며, `validateAdversarialGraphPlanFixtures()`는 validator 결과에 해당 issue code가 없으면 throw한다. 이 파일은 import 시점에도 검증을 실행하므로, future validator regression이 즉시 드러난다.

Adversarial fixtures:

1. Missing root graph: `missing_root_graph`
2. Broken edge target: `missing_edge_to`
3. Owned child graph owner mismatch: `graph_ref_owner_mismatch`
4. Choice selected option missing: `missing_selected_option`
5. Comparison score broken refs: `missing_score_option`, `missing_score_criterion`, `missing_evidence_ref`
6. Fan-in synthesis missing branch evidence: `synthesis_missing_branch_evidence`
7. Changelog split bad cardinality and missing target: `split_mapping_new_count`, `missing_target_block`
8. Investigation experiment broken procedure: `missing_experiment_hypothesis`, `missing_experiment_procedure_graph`, `missing_target_graph`
9. Migration verification target missing: `missing_target_block_item`
10. Prototype piece primary target missing: `missing_target_block`
11. Target item type mismatch plus untyped evidence ref: `target_block_item_type_mismatch`, `untyped_evidence_ref`

Validation result:

- `pnpm --filter @agent-gui/plan-schema typecheck` passed.
- Runtime adversarial fixture import passed and loaded 11 fixtures.

Findings:

- Current semantic validator catches the highest-risk reference integrity failures across graph topology, fractal ownership, branch activation, comparison scoring, fan-in synthesis, revision lineage, debugging experiments, migration gates, and prototype piece targets.
- The split/merge validator is intentionally warning-level because old targets may be legitimately deleted after revision. This should become stricter only when runtime lineage storage exists.
- Untyped evidence refs remain warning-level because old data or external source ids may be unavoidable during migration.
- The remaining blind spots are semantic, not structural:
  - `edge.condition.source.outputKey` is still not checked against a known output contract for each block type.
  - `sourceEventIds` are opaque strings and cannot be validated without session event storage.
  - Option-owned graphs are represented indirectly through branch nodes and `downstreamGraphId`; the option item itself still cannot own a child graph.
  - Validator does not yet enforce reachability, cycle policy, or branch exhaustiveness.

Loop 7 conclusion:

Adversarial generation confirmed that V5 plus validator is useful as a publish-time integrity gate, not just a type definition. The next high-value validator work is adding strictness profiles: authoring mode should allow warnings and partial graphs, while publish mode should fail on unresolved lineage, untyped evidence refs, branch exhaustiveness gaps, and unknown condition output contracts.
