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

전체 workspace 검증 상태:

```bash
pnpm typecheck
```

현재 실패한다. 실패 원인은 `apps/review-web`가 아직 `PlanDraft`, `PlanTarget`, `PlanPrototype`, `session.plan.steps`, `StepList`, `StepDetail`에 의존하기 때문이다. 이것은 Phase 5의 정상적인 작업 대상이다.

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

## 권장 UI 구조

새 컴포넌트 후보:

```txt
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

MVP는 canvas graph editor가 아니다. node card/list 기반의 read-only overview로 충분하다.

추천 화면 배치:

```txt
Header
  title / goal / status / revision / validation summary

Left
  graph selector / node list

Center
  selected graph overview / selected node detail / block renderer

Right
  target breadcrumb / feedback composer / validation panel / event timeline
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

