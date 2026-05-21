# Graph Plan Model Research

## Current Goal

Generalize Agent GUI's plan representation from a step-centered plan into a graph-centered, fractal structure that can express linear plans, phase plans, decision branches, interviews, gates, prototype reviews, debugging loops, research plans, release plans, document plans, and data analysis plans.

## Experimental Workflow

1. Draft a graph/node/edge/block model in `packages/plan-schema/src/graph.ts` and document the model in `docs/graph-plan-model.md`.
2. Run subagents in parallel against representative scenario families.
3. Ask each subagent to express its scenarios as example graphs and identify model gaps.
4. Review all examples, improve the model, and record findings.
5. Repeat for three loops.

## Loop 1

### Starting Model

- Root plan as `GraphPlanDraft`.
- Reusable `PlanGraph` objects for fractal subgraphs.
- `GraphNode` as a semantic container.
- Block union: text, checklist, question, prototype, artifact, graph, evaluation, evidence.
- Edge union: sequence, dependency, conditional, fallback, reference, contains, blocks, unblocks, loop, rollback.
- Conditions attached to edges and referencing block outputs.

### Subagent Assignments

- Agent A: linear implementation, phase subgraphs, migration, release/rollback.
- Agent B: decision branching, requirements interview, tutoring/learning, checklist gate.
- Agent C: research fan-out/fan-in, debugging loop, data analysis, evidence recommendation.
- Agent D: prototype review, option comparison, collaboration/role assignment, document generation.

### Findings

- The base graph/node/block/edge model covers all assigned scenarios, including one extra document-generation scenario beyond the original 15.
- The strongest repeated issue was mixing plan definition with runtime state. Answers, selected options, gate results, checked checklist items, active paths, and completed nodes should not be stored as static plan definition.
- Checklist gates need a canonical output so edge conditions can route on gate results without ambiguous `all_true` semantics.
- Option routing was duplicated between `question.options.nextNodeId` and conditional edges. Routing should be canonical on edges.
- Subgraph references need graph-level input/output contracts and referential integrity validation.
- Fan-in needs explicit join semantics rather than relying on multiple incoming dependency edges.
- Approval should be a first-class block, not only a question or condition operator.
- Feedback targets need to address sub-block pieces such as checklist items, question options, evidence sources, evaluation criteria/options, and prototype pieces.
- Collaboration needs stronger assignment metadata than a single owner.
- Artifact and evidence blocks need richer metadata for review reliability.
- Node type should be open, with UI-recognized presets, rather than a closed enum.

### Improvements

- Added `GraphLifecycleStatus` and `GraphReviewStatus` instead of relying on one overloaded status enum.
- Added `GraphRuntimeState` and `GraphRuntimeValue` to separate actual answers/results from plan definition.
- Added `outputDefinitions` to blocks.
- Added `approval` block.
- Added `checklist.outputKey`, defaulting to `gate_passed`.
- Added condition operators `gate_passed`, `gate_failed`, `selected`, and `score_at_least`, plus compound `all`/`any`/`not`.
- Removed canonical routing from question options by documenting that edges own routing.
- Made `node.type` open string.
- Added `GraphContract` for graph inputs and outputs.
- Added node `joinPolicy` and edge `loopPolicy`.
- Added `GraphAssignment` with owners, reviewers, approvers, and due date.
- Expanded `GraphTarget` to item, option, criterion, source, and prototype piece addresses.
- Enriched artifact, evidence, prototype piece, and evaluation metadata.

## Loop 2

### Findings

- All 15 scenarios remained expressible after Loop 1 changes.
- The remaining weakness moved from structural expressiveness to runtime/event/UI semantics.
- `question.options.nextNodeId`, `checklistItem.checked`, and evaluation selection/rank fields still leaked runtime concerns into the static plan.
- Runtime state needed active/satisfied edges, skipped/blocked nodes, selected paths, loop iteration state, approval state, and gate state.
- Graph block references needed parent-child input/output bindings, not just `graphId`.
- `GraphTarget` was too loose and too shallow for precise feedback. It needed condition, output, state, artifact, score-cell, source, span, and file-range targeting.
- Existing step-centered `PlanEvent`, `prototypeChanges`, and session schemas still cannot carry graph-native feedback or revision targets.
- Readable UI projection needed graph-level groups/lanes, edge display roles, collapsed summaries, traversal rules, and preferred views.

### Improvements

- Removed option-level routing from `questionOption`; conditional/fallback edges are now the canonical routing mechanism.
- Removed `checked` from checklist items and removed runtime selection/rank from evaluation options.
- Added richer `GraphRuntimeState`, including active/satisfied edges, skipped/blocked nodes, selected path, loop iterations, approval state, and gate state.
- Added graph block `inputBindings` and `outputBindings`.
- Expanded `GraphTarget` with target kind, condition, output/state, artifact, score cell, evidence/prototype, and text/file range fields.
- Added graph-native event schemas for feedback, runtime value updates, revisions, and approvals.
- Added graph projection metadata: graph groups, traversal mode, node projection hints, and edge display roles.
- Removed `contains` as an edge kind; graph blocks are the canonical subgraph containment mechanism.
- Added artifact lineage metadata and evidence stance/importance.

## Loop 3

### Findings

- Final scenario audit marked all 15 original scenarios as pass.
- Remaining risks are now implementation-facing rather than concept-facing: referential integrity, graph-native session/event migration, event sourcing rules, and real UI readability.
- Schema quality audit found over-permissive `GraphTarget`, ambiguous condition shape, broad `unknown` values, plain string timestamps, fully open node types, and inconsistent revision event fields.
- `blocks` / `unblocks` edge semantics still need product/runtime clarification.

### Improvements

- Added reusable `jsonValueSchema` and replaced key runtime/config values that were previously `unknown`.
- Added `isoDateTimeSchema` and applied it to graph event/runtime timestamps and due dates.
- Added validation to `GraphTarget` for required fields by target kind and invalid text/file ranges.
- Added validation to `GraphCondition` so a condition uses exactly one evaluation mode.
- Constrained custom node types to `x-*` while preserving known node type presets.
- Added canonical `revision` to `graph.revision` events.

## 최종 리포트

### 핵심 결론

그래프 중심 모델은 원래 검토한 15개 plan 시나리오를 모두 표현할 수 있는 수준까지 도달했습니다. 현재 모델의 중심은 `GraphPlanDraft -> PlanGraph -> GraphNode -> GraphBlock`이고, 조건/순서/의존성/롤백/루프는 `GraphEdge`가 담당합니다. 노드 안에 `graph` block을 둘 수 있어서 phase, branch, loop, appendix 같은 프랙탈 구조도 표현됩니다.

### Loop 1 개선사항

- step 중심 모델을 graph/node/edge/block 모델로 일반화했습니다.
- block 타입으로 text, checklist, question, prototype, artifact, graph, evaluation, evidence를 정의했습니다.
- 조건 분기는 edge condition으로 표현하도록 했습니다.
- 15개 시나리오를 예시 그래프로 대입해 본 결과, 구조 표현은 가능했지만 runtime state와 plan definition이 섞이는 문제가 컸습니다.
- 이에 따라 lifecycle/review status 분리, runtime state 분리, graph contract, approval block, checklist gate output, join/loop policy, 세밀한 feedback target을 추가했습니다.

### Loop 2 개선사항

- 남은 문제는 구조 표현보다 리뷰/이벤트/UI projection 쪽이었습니다.
- `question.options.nextNodeId`, checklist checked state, evaluation selected/rank처럼 runtime 성격의 필드를 static plan에서 제거했습니다.
- graph block의 parent-child input/output binding을 추가했습니다.
- `GraphRuntimeState`를 확장해 active/satisfied edges, skipped/blocked nodes, selected path, loop iterations, approvals, gates를 담게 했습니다.
- `GraphTarget`을 확장해 condition, output/state, artifact, score cell, evidence source, prototype piece, file/text range를 겨냥할 수 있게 했습니다.
- graph-native event 초안과 projection metadata를 추가했습니다.

### Loop 3 개선사항

- 최종 검토에서 15개 시나리오는 모두 pass로 판단됐습니다.
- 마지막으로 schema 안정성 문제를 정리했습니다.
- JSON 저장 안정성을 위해 `jsonValueSchema`를 추가했습니다.
- timestamp는 ISO datetime으로 제한했습니다.
- `GraphTarget`은 target kind별 필수 필드와 range 검증을 추가했습니다.
- `GraphCondition`은 operator/expression/all/any/not 중 하나의 평가 방식만 쓰도록 검증했습니다.
- node type은 known preset 또는 `x-*` custom type만 허용하도록 좁혔습니다.
- graph revision event에 canonical `revision` 필드를 추가했습니다.

### 더 반복하면 좋아질까?

개념 모델 자체는 3루프로 충분히 수렴했습니다. 루프를 더 돌리면 큰 구조가 바뀌기보다는 검증기, fixture, UI projection 규칙, MCP/event migration 같은 구현 세부가 좋아질 가능성이 큽니다.

다음에 더 좋은 모델을 만들기 위한 최선의 작업은 추가 브레인스토밍이 아니라 실제 fixture와 validation입니다. 15개 시나리오별 작은 graph fixture를 만들고, referential integrity validator와 review UI projection을 붙여 보면 남은 결함이 훨씬 구체적으로 드러날 것입니다.

## Loop 4

### Setup

- 이전 루프의 서브에이전트를 모두 닫고, 새로운 `gpt-5.4` 서브에이전트 3개로 진행했습니다.
- 목표는 fresh agent가 모델을 처음 보고 잘 쓸 수 있는지, 그리고 DAG/AST/state-machine/BPMN류 대안 모델이 더 나은지 확인하는 것이었습니다.

### Findings

- Fresh agent는 `GraphPlanDraft -> PlanGraph -> GraphNode -> GraphBlock` 구조와 edge 중심 라우팅은 빠르게 이해했습니다.
- 하지만 valid output을 안정적으로 만들기에는 authoring guide가 부족했습니다. 특히 `GraphTarget`, `GraphCondition`, custom node type, projection metadata, `blocks`/`unblocks` 사용 기준이 혼동 지점이었습니다.
- 대안 모델 검토 결과, typed workflow DAG는 실행/검증에 강하고, document AST는 읽기/diff/comment에 강하며, BPMN/state machine은 운영 프로세스에 강했습니다.
- 그래도 Agent GUI의 목표가 “리뷰 가능한 에이전트 계획”이므로 현재 graph/block 모델이 가장 균형 잡힌 기본 모델이라는 판단이 나왔습니다.
- 구현 관점에서는 아직 바로 UI를 교체하기 어렵습니다. graph-native session envelope, MCP/event 계약, validator, fixture, UI projection spec이 먼저 필요합니다.

### Improvements

- `GraphPlanSession`을 추가해 graph-native session envelope를 정의했습니다.
- `graph.feedback`에 actor/intent/sessionId를 추가하고, `graph.reply` 이벤트를 추가해 현재 feedback thread semantics와 맞출 수 있게 했습니다.
- `graph.revision`에 target/sessionId를 추가했습니다.
- `GraphPlanDraft`에 top-level `prototypes` registry를 추가해 prototype block의 `prototypeId` 참조를 받을 수 있게 했습니다.
- `docs/graph-plan-model.md`에 minimum authoring recipe, branching/gate/subgraph recipe, target/condition authoring rules를 추가했습니다.
- `blocks` / `unblocks`는 MVP authoring에서 비권장 advanced feature로 문서화했습니다.

### Judgment

모델 자체를 DAG, AST, BPMN 중 하나로 바꾸는 것은 현재로서는 손해가 큽니다. 대신 현재 모델 위에 stricter profile, validator, fixture, graph-native event/session migration을 얹는 방향이 맞습니다.

## Loop 5

### Setup

- Loop 4 서브에이전트를 모두 닫고, 다시 새로운 `gpt-5.4` 서브에이전트 3개로 진행했습니다.
- fresh-agent authoring 가능성, 대안 모델 교체 필요성, 구현상 다음 단계에 대해 최종 확인했습니다.

### Findings

- Fresh agent usability는 `pass with caveats`로 판단됐습니다. 최소 branching plan은 문서와 schema만 보고 작성 가능하지만, 복잡한 event target, projection, cross-reference는 fixture와 validator 없이는 여전히 흔들릴 수 있습니다.
- 대안 모델 재검토에서도 graph/block 모델을 교체하지 않는 것이 맞다는 결론이 나왔습니다. typed DAG, document AST, BPMN/state-machine은 각각 장점이 있지만 Agent GUI의 혼합 리뷰 surface에는 현재 모델이 더 균형 잡혀 있습니다.
- 모델 작업은 여기서 멈추고 operational hardening으로 넘어가야 한다는 판단이 반복됐습니다.
- 다음 구현 순서는 graph validator, representative fixtures, 그 다음 graph-native session/event/MCP migration입니다.
- 작은 정리 항목으로 `graph.reply` 문서 누락, `PlanEvent`/`GraphPlanEvent` 용어 drift, `artifact_ref` target 필수 필드, evidence `retrievedAt` timestamp 형식이 발견됐습니다.

### Improvements

- `artifact_ref` target은 `artifactRefId`를 필수로 요구하도록 보강했습니다.
- evidence source의 `retrievedAt`을 ISO datetime으로 제한했습니다.
- `docs/graph-plan-model.md`의 graph event 목록에 `graph.reply`를 추가했습니다.
- open question의 `PlanEvent` 표현을 `GraphPlanEvent`로 정정했습니다.

### Final Judgment

5회 루프 기준으로 모델링 탐색은 충분히 수렴했습니다. 추가 루프는 새로운 핵심 구조를 만들 가능성이 낮고, 오히려 validator/fixture/UI projection 구현을 지연시킬 가능성이 큽니다.

다음 단계는 모델 변경이 아니라 검증 가능한 운영화입니다.

1. graph-native validator 구현
2. 대표 scenario fixture 작성
3. fixture 기반 parse/validation 테스트
4. graph-native session/event/MCP v2 경계 정의
5. review UI projection spike
