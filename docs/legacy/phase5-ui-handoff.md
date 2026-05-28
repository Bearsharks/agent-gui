# Phase 5 UI Handoff

## 목표

다음 작업의 목표는 기존 step-based Review UI를 제거하고, graph-only session을 읽는 read-only Graph Review UI로 교체하는 것이다.

현재 product/source of truth:

- plan payload: `GraphPlanDocument`
- session payload: `PlanSession.graphPlan`
- feedback/reply target: `GraphPlanTarget`
- validation: `GraphPlanValidationSummary`
- mutation/revision: graph API와 MCP의 `replace_graph_plan`, `mutate_graph_plan`

UI는 plan editor가 아니다. MVP UI는 사용자가 graph plan을 읽고, graph target에 feedback을 남기고, validation issue와 revision history를 확인하는 review workspace다.

상세 UI 설계는 [graph-review-ui-design.md](graph-review-ui-design.md)를 따른다.

## 현재 상태 요약

Phase 1-4는 구현되어 있다.

완료된 것:

- Graph validator issue taxonomy 추가
- Graph-only session/event/mutation contract 추가
- HTTP API graph-only 전환
- File-backed store graph-only 전환
- Graph mutation helper 추가
- MCP tool graph-only 전환
- Fixture session graph fixture 기반 전환

아직 완료되지 않은 것:

- `apps/review-web`는 여전히 step-based UI를 사용한다.
- 전체 `pnpm typecheck`는 `apps/review-web` 때문에 실패한다.
- server와 plan-schema는 typecheck/build/test가 통과한다.

## 현재 검증 상태

통과한 검증:

```bash
pnpm --filter @agent-gui/plan-schema test
pnpm --dir apps/server typecheck
pnpm --dir apps/server build
pnpm --dir apps/server test
```

HTTP API smoke test 통과:

- graph fixture session 생성
- graph-only session 조회
- graph validation
- graph mutation
- revision 증가 확인

MCP HTTP smoke test 통과:

- `/mcp/tools`가 graph-only tool 8개 반환
- `get_graph_plan_session`
- `validate_graph_plan`
- `mutate_graph_plan`

Codex MCP tool 직접 호출 확인:

- `validate_graph_plan` 호출 성공
- `errorCount: 0`
- `publishReady: true`

Phase 5 UI E2E 수동 검증 추가 확인:

- `agent-browser`로 graph fixture session을 열어 React Flow graph pane 렌더링 확인
- review bundle criterion item 선택 시 URL이 `item=crit-context`를 보존하는지 확인
- feedback composer가 `block_item` target으로 user feedback event를 저장하는지 MCP `list_plan_events`로 확인
- MCP `post_agent_reply`가 같은 `block_item` target thread에 agent reply를 저장하는지 확인
- MCP `mutate_graph_plan`으로 targeted node field revision을 만들고 revision 2, `publishReady: true`, `0` validation issue 확인
- 브라우저 timeline에 user feedback, agent reply, agent revision, approval event가 graph breadcrumb와 함께 표시되는지 확인
- 브라우저 approval 후 session status가 `approved`가 되고 approval event가 timeline에 표시되는지 확인

전체 workspace 검증 상태:

```bash
pnpm typecheck
```

Phase 5 UI 전환 후에는 `pnpm typecheck`가 통과한다. 기존 실패 원인이었던 `PlanDraft`, `PlanTarget`, `PlanPrototype`, `session.plan.steps`, `StepList`, `StepDetail` active path는 제거됐다.

## 현재 사용 가능한 Graph API

HTTP API:

```txt
POST /api/fixture-session
POST /api/sessions
GET  /api/sessions/:sessionId
GET  /api/sessions/:sessionId/events
POST /api/graph-plan/validate
POST /api/sessions/:sessionId/feedback
POST /api/sessions/:sessionId/agent-replies
PUT  /api/sessions/:sessionId/graph-plan
POST /api/sessions/:sessionId/graph-plan/mutations
POST /api/sessions/:sessionId/approve
```

Important response shape:

```ts
type PlanSession = {
  id: string;
  status: "draft" | "needs_agent" | "agent_replied" | "revision_ready" | "approved" | "rejected";
  revision: number;
  graphPlan: GraphPlanDocument;
  validation: GraphPlanValidationSummary;
  events: PlanEvent[];
  createdAt: string;
  updatedAt: string;
};
```

There is no active `session.plan`.

## 현재 사용 가능한 MCP Tools

Codex MCP namespace에서도 graph-only tool이 확인됐다.

```txt
create_graph_plan_session
get_graph_plan_session
list_plan_events
post_agent_reply
replace_graph_plan
mutate_graph_plan
validate_graph_plan
mark_plan_approved
```

UI 작업 중 MCP를 직접 사용할 필요는 없지만, event/revision contract를 이해하는 데 중요하다.

## 주요 코드 위치

Graph contract:

- `packages/plan-schema/src/graphPlan.ts`
- `packages/plan-schema/src/graphPlanValidation.ts`
- `packages/plan-schema/src/graphPlanSession.ts`
- `packages/plan-schema/src/graphPlanFixtures.ts`

Server/API:

- `apps/server/src/http/api.ts`
- `apps/server/src/store/fileStore.ts`
- `apps/server/src/domain/graphPlanMutations.ts`
- `apps/server/src/domain/samplePlan.ts`

MCP:

- `apps/server/src/mcp/stdioServer.ts`
- `apps/server/src/mcp/httpTools.ts`

Current UI files to replace or heavily rewrite:

- `apps/review-web/src/app/SessionReviewPage.tsx`
- `apps/review-web/src/app/StepList.tsx`
- `apps/review-web/src/app/StepDetail.tsx`
- `apps/review-web/src/app/FeedbackCenter.tsx`
- `apps/review-web/src/app/PrototypePlayground.tsx`
- `apps/review-web/src/app/EventTimeline.tsx`
- `apps/review-web/src/app/ChangeSummary.tsx`
- `apps/review-web/src/api/client.ts`
- `apps/review-web/src/styles.css`

## UI 작업 목표

Phase 5의 최소 목표:

1. Review UI가 graph-only session을 fetch하고 렌더링한다.
2. `session.plan.steps` 사용이 사라진다.
3. `StepList`와 `StepDetail` active path가 제거된다.
4. root graph와 selected node detail이 보인다.
5. selected node의 block list가 보인다.
6. validation summary와 issue list가 보인다.
7. feedback composer가 `GraphPlanTarget`을 전송한다.
8. event timeline이 graph target breadcrumb를 표시한다.
9. `apps/review-web` typecheck가 통과한다.
10. 가능하면 전체 `pnpm typecheck`가 통과한다.

## Phase 5 작업 순서

Phase 5는 컴포넌트부터 만들지 않고, graph navigation architecture를 먼저 고정한 뒤 UI를 얹는다. 목표는 flat graph viewer가 아니라 프랙탈 graph plan을 drilldown하며 검토하는 read-only review workspace다.

### 0. 기술 스택 및 아키텍처 정의

현재 stack:

- React 19
- Vite 8
- TypeScript 6
- `@agent-gui/plan-schema`
- `@agent-gui/design-system`

Data source:

- `GET /api/sessions/:sessionId`
- `PlanSession.graphPlan`
- `PlanSession.validation`
- `PlanSession.events`

UI architecture:

- editor가 아닌 read-only review workspace다.
- user-side graph mutation UI를 만들지 않는다.
- graph mutation과 revision은 API/MCP로 들어온 결과를 읽고 표시한다.
- arbitrary graph layout engine이나 full canvas editor는 Phase 5 범위가 아니다.

State architecture:

- server state: `PlanSession`
- navigation state: current graph, selected node, selected block, selected edge, selected prototype piece
- derived state: selected `GraphPlanTarget`, target breadcrumb, issue badges, graph/node/block/edge lookup map

URL architecture:

```txt
?graph=
?node=
?block=
?edge=
?piece=
```

Component boundary:

- graph traversal/indexing은 React component 밖 pure utility로 둔다.
- selection to target 변환과 breadcrumb 생성도 pure utility로 둔다.
- React components는 rendering, selection, feedback submission만 담당한다.

### 1. Fractal Graph Navigation Model 확정

- root graph 진입 규칙을 정한다.
- child graph drilldown 규칙을 정한다.
- parent graph drillup 규칙을 정한다.
- `ownedGraphIds`, `graph_ref`, graph `owner` 관계를 어떻게 navigation에 쓸지 정한다.
- parent context summary를 어디에 표시할지 정한다.
- current graph scope와 selected target을 분리한다.

### 2. Graph Index / Resolver Layer 구현

- `GraphPlanDocument`에서 graph/node/block/edge lookup map을 만든다.
- graph parent/child 관계를 계산한다.
- node 또는 block이 drillable한지 판정한다.
- validation issue를 graph element별로 group한다.
- URL query를 selection state로 복원한다.
- selection state 변경을 URL query에 반영한다.

### 3. GraphPlanTarget / Breadcrumb Resolver 구현

- selection state를 `GraphPlanTarget`으로 변환한다.
- `GraphPlanTarget`을 사람이 읽는 breadcrumb로 변환한다.
- validation issue target 또는 pointer를 selection state로 변환한다.
- event target을 breadcrumb로 표시한다.

지원 target:

- `plan`
- `graph`
- `node`
- `block`
- `block_item`
- `edge`
- `prototype_piece`
- `artifact_range`

### 4. Step-Based UI Active Path 제거

- `session.plan.steps` 사용을 제거한다.
- `StepList`, `StepDetail` active path를 제거한다.
- `PlanTarget`, `PlanPrototype`, `PrototypeTab`, top-level prototype 의존을 제거한다.
- `SessionReviewPage`를 `session.graphPlan` 기준으로 재작성한다.
- `session.plan` fallback을 만들지 않는다.

### 5. Graph Review Shell 구성

화면 shell:

```txt
Header
  title / goal / status / revision / validation summary

Left
  graph tree / graph breadcrumb / current graph node list

Center
  current graph overview / selected node detail / block renderer / edge condition summary

Right
  selected target breadcrumb / feedback composer / validation panel / target thread / prototype piece panel

Secondary
  event timeline / revision summary
```

### 6. Drilldown Graph Explorer 구현

- root graph overview를 표시한다.
- current graph의 node/edge만 표시한다.
- subgraph를 가진 node를 drillable하게 표시한다.
- `graph_ref` block에서 child graph 진입 action을 제공한다.
- parent graph로 돌아가는 action을 제공한다.
- child graph 안에서도 parent context summary를 유지한다.
- drillup 후 이전 entry node 또는 `graph_ref` block을 강조한다.

### 7. Node Detail 구현

- node title/kind/status/summary를 표시한다.
- input/output contract를 요약한다.
- linked targets를 표시한다.
- owned subgraphs를 표시한다.
- incoming/outgoing edge를 요약한다.
- node-level validation issue badge를 표시한다.
- node 선택 시 feedback target이 node target이 되게 한다.

### 8. Block Renderer 구현

공통 block shell:

- title
- type
- status
- selected state
- validation issue badge
- feedback target action

지원 renderer:

- `text`
- `task_list`
- `checklist`
- `criteria`
- `risk`
- `verification`
- `artifact`
- `prototype`
- `graph_ref`
- `choice_set`
- `changelog`

지원하지 않는 block type은 fallback renderer로 `type`, `id`, `title`, `summary`, compact JSON disclosure를 표시한다.

### 9. Validation Panel 연결

- `errorCount`, `warningCount`, `publishReady`를 표시한다.
- issue category/code/message/path를 표시한다.
- issue target breadcrumb를 표시한다.
- issue 클릭 시 가능한 경우 해당 graph scope와 element로 이동한다.
- graph/node/block/edge badge와 issue list를 연결한다.

### 10. Graph Feedback Center 전환

- composer가 selected `GraphPlanTarget`으로 feedback을 전송한다.
- node/block target을 우선 지원한다.
- edge/prototype_piece/artifact_range target으로 확장한다.
- target breadcrumb를 composer 위에 항상 표시한다.
- feedback 제출 후 session을 refresh한다.

### 11. Event Timeline / Revision Summary 전환

- event별 graph target breadcrumb를 표시한다.
- user feedback, agent reply, agent revision, user approval을 구분한다.
- revision summary는 structure/content/validation change를 분리해 표시한다.
- 이전 revision의 feedback thread가 보존되는지 확인한다.

### 12. 검증

검증 명령:

```bash
pnpm --dir apps/review-web typecheck
pnpm --dir apps/review-web build
pnpm typecheck
```

수동 검증:

1. fixture session을 생성한다.
2. review URL을 연다.
3. root graph가 표시되는지 확인한다.
4. child graph drilldown/drillup을 확인한다.
5. node detail과 block renderer를 확인한다.
6. node 또는 block feedback을 작성한다.
7. validation issue jump를 확인한다.
8. event timeline target breadcrumb를 확인한다.
9. prototype piece target을 확인한다.
10. revision summary가 structure/content/validation change를 구분하는지 확인한다.

## 권장 컴포넌트 구조

새 컴포넌트 후보:

```txt
GraphReviewShell
GraphNavigator
GraphOverview
GraphNodeList
NodeDetail
BlockRenderer
GraphTargetBreadcrumb
GraphFeedbackCenter
ValidationPanel
GraphPrototypePanel
RevisionSummary
```

MVP는 canvas graph editor가 아니다. node card/list 기반의 read-only overview로 시작하되, 프랙탈 graph plan 탐색을 위해 graph breadcrumb, graph tree, drilldown/drillup, parent context summary를 제공해야 한다.

추천 화면 배치:

```txt
Header
  title / goal / status / revision / validation summary

Left
  graph tree / graph breadcrumb / current graph node list

Center
  current graph overview / selected node detail / block renderer / edge condition summary

Right
  target breadcrumb / feedback composer / validation panel / target thread / prototype piece panel

Secondary
  event timeline / revision summary
```

## Target 선택 정책

MVP에서는 단순한 선택 정책을 쓴다.

- graph 선택: `{ type: "graph", graphId }`
- node 선택: `{ type: "node", graphId, nodeId }`
- block 선택: `{ type: "block", graphId, nodeId, blockId }`
- edge 선택: `{ type: "edge", graphId, edgeId }`
- prototype piece 선택: `{ type: "prototype_piece", graphId, nodeId, blockId, prototypeId, pieceId }`

초기 feedback composer는 selected node 또는 selected block target만 지원해도 된다. 다만 type은 반드시 `GraphPlanTarget`이어야 한다.

## Block Rendering MVP

우선 지원할 block:

- `text`
- `task_list`
- `checklist`
- `criteria`
- `risk`
- `verification`
- `artifact`
- `prototype`
- `graph_ref`
- `choice_set`
- `changelog`

지원하지 않는 block은 fallback renderer로 `type`, `id`, `title`, `summary`와 compact JSON을 표시한다.

## Validation UI 정책

`session.validation`을 기준으로 표시한다.

표시해야 할 정보:

- `errorCount`
- `warningCount`
- `publishReady`
- issue category
- issue code
- issue message
- target breadcrumb 또는 path

Issue에 `target`이 있으면 해당 graph element로 이동할 수 있게 만드는 것이 좋다. MVP에서는 클릭 시 target을 selected target으로 설정하는 정도면 충분하다.

## Event/Revision 표시 변경점

기존 revision event의 `changeSummary`는 `string[]`였다.

현재는:

```ts
changeSummary: {
  structure: string[];
  content: string[];
  validation: string[];
}
```

따라서 `ChangeSummary.tsx`와 `EventTimeline.tsx`는 이 구조를 기준으로 수정해야 한다.

기존 `prototypeChanges`는 active contract에 없다. prototype 관련 정보는 graph `prototype` block과 `prototype_piece` target에서 읽어야 한다.

## API Client 변경점

`apps/review-web/src/api/client.ts`는 다음 타입을 써야 한다.

- `PlanSession`
- `GraphPlanTarget`

`PlanTarget`은 더 이상 public export가 아니다.

Feedback request:

```ts
postFeedback(sessionId: string, target: GraphPlanTarget, message: string)
```

## 주의사항

- step-based compatibility를 만들지 않는다.
- `PlanDraft`, `PlanTarget`, `PlanPrototype`, `PrototypeTab` 타입을 되살리지 않는다.
- `session.plan` fallback을 만들지 않는다.
- UI가 graph mutation API를 직접 구현할 필요는 없다. Phase 5 MVP는 review/read/feedback 중심이다.
- 기존 CSS와 design-system은 재사용하되, step 중심 class naming은 정리한다.

## 추천 검증 순서

1. `pnpm --dir apps/review-web typecheck`
2. `pnpm --dir apps/review-web build`
3. `pnpm typecheck`
4. `pnpm dev`
5. `POST /api/fixture-session`
6. 반환된 URL 열기
7. root graph, node list, node detail 확인
8. node 또는 block feedback 작성
9. event timeline target 표시 확인
10. validation panel 확인

## 현재 브랜치/작업 상태 메모

현재 브랜치에서 Phase 3/4 변경은 아직 커밋되지 않은 상태일 수 있다.
UI 작업을 시작하기 전에 `git status --short`로 확인한다.

Phase 3/4 변경 파일:

- `apps/server/src/domain/graphPlanMutations.ts`
- `apps/server/src/domain/samplePlan.ts`
- `apps/server/src/http/api.ts`
- `apps/server/src/mcp/httpTools.ts`
- `apps/server/src/mcp/stdioServer.ts`
- `apps/server/src/store/fileStore.ts`
- `packages/plan-schema/src/index.ts`

이미 이전 커밋에는 Phase 1/2와 설계 문서가 들어갔다.
