# 그래프/블록 기반 Plan Model 최종 보고서

## 요약

현재 Agent GUI의 plan review 구조는 `step` 중심이다. 하지만 실제 계획은 항상 선형 단계 목록으로 표현되지 않는다. 이번 연구의 목표는 9개 우선순위 시나리오를 포괄할 수 있는 더 일반적인 plan model을 설계하는 것이었다.

최종 결론은 다음과 같다.

- Plan은 선형 step list가 아니라 **review 가능한 graph document**로 본다.
- Graph는 node와 edge로 구성된다.
- Node는 고정된 step이 아니라 여러 block을 담는 container다.
- Block이 실제 의미를 대부분 가진다.
- Block은 다른 graph를 참조할 수 있으므로 plan은 fractal 구조가 된다.
- Feedback target은 graph, node, block, block item, edge, prototype piece까지 정확히 가리킬 수 있어야 한다.
- 실제 feedback/reply/revision/approval history는 graph 안에 복제하지 않고 session event가 canonical source로 유지한다.

최종 모델은 추가 fractal loop 이후 `V5`로 갱신했다. V5는 V2/V3의 단순한 구조를 유지하면서, fractal ownership과 cross-graph traceability를 schema에 더 명시적으로 반영한 모델이다.

## 연구 대상 시나리오

이번 모델은 아래 9개 시나리오만 우선 고려했다.

1. Linear / phase implementation plan
2. Prototype review plan
3. Decision branching plan
4. Checklist / gate plan
5. Review / revision loop
6. Research fan-out / fan-in plan
7. Option comparison / selection plan
8. Debugging / hypothesis loop
9. Migration plan

튜터링, 문서 생성, 광범위한 협업 워크플로우, 데이터 분석 등은 모델을 복잡하게 만들기 위한 독립 요구사항으로 취급하지 않았다.

## 실험 방식

3개 루프를 실행했다.

- Loop 1: `gpt-5.5`
- Loop 2: `gpt-5.4`
- Loop 3: `gpt-5.3-codex`

각 루프에서 서브에이전트에게 현재 candidate model을 주고 9개 시나리오를 나누어 표현하게 했다. 이후 메인 에이전트가 결과를 검토해 모델을 개선했다.

## 모델 개선 이력

### V0

V0는 기존 `PlanDraft.steps` 구조를 일반화해 다음 4개 primitive를 도입했다.

- `Graph`
- `Node`
- `Edge`
- `Block`

V0는 9개 시나리오를 graph shape 수준에서는 모두 표현할 수 있었다. 하지만 nested graph 구조에서 target ID가 모호해졌고, block마다 안정적인 ID와 공통 필드가 필요하다는 문제가 드러났다.

### V1

V1은 V0에 다음을 추가했다.

- path-aware target
- block 공통 필드
- revision metadata
- edge join/branch semantics
- 더 구체적인 typed block set

V1은 표현력은 충분했지만 너무 workflow-engine에 가까워졌다. 같은 의미가 node kind, block type, edge kind에 중복되는 문제가 있었다.

예를 들어 gate는 다음 여러 방식으로 표현될 수 있었다.

- `node.kind = "gate"`
- `edge.kind = "gate"`
- `checklist` block
- `verification` block
- edge condition

이 중복은 authoring과 UI rendering을 어렵게 만든다.

### V2

V2는 모델을 줄였다.

Node kind는 coarse container로 축소했다.

```ts
type NodeKind =
  | "section"
  | "action"
  | "decision"
  | "checkpoint"
  | "review"
  | "artifact"
  | "note";
```

Edge kind도 구조적 관계만 남겼다.

```ts
type EdgeKind =
  | "sequence"
  | "conditional"
  | "dependency"
  | "loop"
  | "reference"
  | "rollback";
```

도메인 의미는 대부분 block으로 이동했다.

### V3

Loop 3 검증 결과, V2는 9개 시나리오를 모두 충분히 표현했다. 따라서 V3에서는 구조를 더 확장하지 않고 다음 traceability 규칙만 추가했다.

- checkpoint outcome
- review trace
- evidence refs
- prototype piece traceability
- investigation block 필수 필드 convention
- migration rollback scope convention
- `choice_set`과 `conditional edge`의 사용 기준

### V4

V4는 별도 줄글 scenario corpus를 기준으로 fractal depth 1 이상을 요구하는 9개 시나리오를 다시 검증한 결과다. 핵심 개선은 다음이다.

- `graph_ref.relationship` enum화
- `PlanNode.ownedGraphIds`
- typed evidence refs
- `ChangeLogEntry.previousTargets`
- option downstream graph linkage
- experiment procedure graph linkage
- migration compatibility/rollback 보강

### V5

V5는 추가 검증에서 남은 target precision 문제를 줄였다.

- `Graph.owner`
- `graph_ref.ownership`
- `prototypePiece.primaryTarget`
- `comparison.options[].downstreamGraphId`
- `changelog.entries[].mappings[]`
- `synthesis.joinPolicy`, `sourceBranchRefs`, `conclusionEvidenceRefs`
- `checkpoint_outcome` block
- `migration.compatibility.items[]`, `migration.rollbackPlans[]`

## 최종 모델

### PlanDocument

Plan 전체를 나타내는 root object다.

```ts
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
```

### PlanGraph

Plan의 구조 단위다. root graph가 있고, block을 통해 child graph를 참조할 수 있다.

```ts
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
```

### PlanNode

Node는 semantic container다. Step처럼 고정된 작업 단위가 아니라 block 조합을 담는다.

```ts
type PlanNode = {
  id: string;
  kind: NodeKind;
  title: string;
  summary?: string;
  blocks: PlanBlock[];
  status?: ReviewStatus;
  links?: PlanLink[];
  revisionMeta?: RevisionMeta;
  metadata?: Record<string, unknown>;
};
```

### PlanEdge

Edge는 node 간 구조적 관계를 나타낸다. 조건 분기는 `conditional` edge로 표현한다.

```ts
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

### PlanBlock

Block은 node 내부의 실제 내용 단위다. 최종 block set은 다음과 같다.

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

## Target Model

Feedback target은 path-aware여야 한다.

```ts
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
```

이 구조가 중요한 이유는 graph가 fractal 구조이기 때문이다. 단순히 `nodeId`나 `blockId`만 저장하면 nested graph에서 target이 모호해질 수 있다.

## 9개 시나리오별 표현 방식

### 1. Linear / Phase Implementation Plan

`Graph.layout.mode = "linear"`와 `layout.order`를 사용한다. Phase는 별도 primitive가 아니라 `section` node로 표현한다.

작은 작업은 `task_list`에 넣고, 자체 feedback surface나 subgraph가 필요한 작업만 별도 node로 승격한다.

### 2. Prototype Review Plan

`review` node에 `review_bundle`과 `prototype` block을 둔다.

Prototype piece feedback은 `prototype_piece` target을 사용한다. 이 target은 `graphId`, `nodeId`, `blockId`, `prototypeId`, `pieceId`를 모두 포함해야 한다.

### 3. Decision Branching Plan

간단한 선택은 `choice_set` block으로 표현한다.

실제로 downstream work가 갈라질 때만 `conditional` edge를 사용한다.

즉:

- 선택지만 다르면 `choice_set`
- 이후 작업 경로가 달라지면 `conditional edge`

### 4. Checklist / Gate Plan

Gate는 edge가 아니라 `checkpoint` node로 표현한다.

`checkpoint` node는 보통 다음 block을 가진다.

- `criteria`
- `checklist`
- `verification`
- `risk`

Pass/fail 결과는 `metadata.outcome`으로 query 가능하게 둔다.

### 5. Review / Revision Loop

Graph는 review가 발생하는 지점을 표현할 뿐이다.

실제 feedback, agent reply, revision, approval history는 session event가 canonical source다. Graph 안의 `changelog` block은 요약 역할만 한다.

### 6. Research Fan-Out / Fan-In Plan

Fan-out branch는 여러 action node와 layout group으로 표현한다.

Fan-in은 `synthesis` block 또는 synthesis 역할의 node로 표현한다. `synthesis` entry는 evidence item ID를 참조해야 한다.

### 7. Option Comparison / Selection Plan

간단한 선택은 `choice_set`을 사용한다.

기준별 비교가 필요하면 `comparison` block을 사용한다.

최종 추천과 rationale은 `synthesis`에 둔다.

### 8. Debugging / Hypothesis Loop

Debugging은 `investigation` block으로 표현한다.

`investigation` block은 다음을 명시해야 한다.

- hypotheses
- experiments
- observations
- outcomes
- nextAction
- exitCondition

`loop` edge는 전체 retry path만 표현하고, 모든 실험 iteration을 edge로 만들지는 않는다.

### 9. Migration Plan

Migration은 `migration` block과 `checkpoint` node 조합으로 표현한다.

`migration` block은 다음을 명시해야 한다.

- fromVersion
- toVersion
- affectedSurfaces
- compatibilityStrategy
- rollbackScope
- rollbackPlan
- verificationGate

Rollback은 `rollback` edge로 표현하되, scope가 `step`, `phase`, `global` 중 무엇인지 명시한다.

## 최종 판단

최종 모델은 step 중심 구조보다 더 넓은 사용 시나리오를 흡수할 수 있다. 동시에 모든 것을 workflow engine으로 만들지는 않는다.

중요한 설계 판단은 다음이다.

- Graph는 구조를 표현한다.
- Node는 coarse container다.
- Block이 의미를 담는다.
- Edge는 구조적 관계만 표현한다.
- Review history는 session event가 담당한다.
- Feedback target은 path-aware여야 한다.
- Fractal ownership은 `Graph.owner`, `PlanNode.ownedGraphIds`, `graph_ref.ownership`으로 명시한다.
- Prototype piece는 `primaryTarget`을 가져야 한다.
- Revision target 변화는 changelog mapping으로 old/new target을 pair로 표현한다.

이 모델을 적용하면 기존 step 기반 plan은 linear graph의 한 projection으로 유지할 수 있고, prototype review, branching, checklist gate, research fan-in, debugging loop, migration plan도 같은 primitive 위에서 표현할 수 있다.

## 다음 단계 제안

1. `packages/plan-schema`에 V3 schema를 experimental namespace로 추가한다.
2. 기존 `PlanDraft.steps`를 graph document로 변환하는 adapter를 만든다.
3. Review UI에서 우선 `linear`, `review_bundle`, `checkpoint`, `choice_set`, `prototype_piece` target만 렌더링한다.
4. MCP tool의 `PlanTarget`을 path-aware target으로 확장한다.
5. 기존 fixture session과 새 graph session이 동시에 열리는지 검증한다.
