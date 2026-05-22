# 그래프 전용 Plan GUI 구현 계획

## 목표

기존 step-based Plan GUI 계약을 제거하고, 그래프 전용 모델로 대체한다.
세션, 검증, HTTP API, MCP 도구, 피드백 target, 이후 Review UI 렌더링의 단일 source of truth는 `GraphPlanDocument`다.

이 계획은 step-based POC를 호환 계층으로 유지하지 않는다.

## 구현 순서

1. Graph validator issue taxonomy 정리
2. Graph-only contract 정의
3. HTTP API 생성 및 교체
4. MCP 도구 변경
5. Review UI 교체

앞의 네 단계는 contract와 mutation 표면을 안정화하는 작업이다. UI 작업은 API와 MCP 동작이 안정된 뒤 시작한다.

최상위 graph API 설계는 [docs/graph-api-design.md](docs/graph-api-design.md)를 따른다. 이 문서는 단순 CRUD가 아니라 revisioned graph document, target-based atomic mutation, subgraph operation, validation summary, review event를 중심으로 API를 정의한다.
Graph validator issue taxonomy는 [docs/graph-validator-taxonomy.md](docs/graph-validator-taxonomy.md)를 따른다. 이 문서는 validator issue를 API, MCP, UI, 테스트가 공유하는 오류 계약으로 정의한다.
Graph MCP 설계는 [docs/graph-mcp-design.md](docs/graph-mcp-design.md)를 따른다. 이 문서는 graph-only MCP tool set, tool contract, error handling, 검증 시나리오를 정의한다.
Graph Review UI 설계는 [docs/graph-review-ui-design.md](docs/graph-review-ui-design.md)를 따른다. 이 문서는 read-only graph review workspace, component 책임, URL state, validation 표시 정책을 정의한다.

## 서브에이전트 병렬 실행 전략

서브에이전트는 작업 범위가 명확하고 파일 소유권이 겹치지 않을 때만 사용한다. 메인 에이전트는 통합, 최종 schema 판단, 패키지 간 일관성을 책임진다.

### 병렬 Track A: Validator Taxonomy

소유 범위:

- `packages/plan-schema/src/graphPlanSemanticValidator.ts`
- `packages/plan-schema/src/` 아래 새 taxonomy 파일
- graph validator 테스트와 fixture

책임:

- 현재 validator issue code 전체를 목록화한다.
- typed issue code와 category를 정의한다.
- validation summary 생성을 추가한다.
- adversarial fixture의 expected code를 taxonomy 기준에 맞춘다.

이 track은 기존 `GraphPlanDocument`와 `GraphPlanTarget`만 의존하므로 contract 설계와 병렬로 진행할 수 있다.

### 병렬 Track B: Graph-Only Contract

소유 범위:

- `packages/plan-schema/src/index.ts`
- `packages/plan-schema/src/` 아래 graph session, event, mutation contract 파일

책임:

- `PlanDraft` 기반 session contract를 `GraphPlanDocument` 기반으로 교체한다.
- `PlanTarget`을 `GraphPlanTarget`으로 교체한다.
- session, event, change summary, mutation, validation API schema를 정의한다.
- step-based export를 제거하거나 내부 격리해 app code가 실수로 의존하지 못하게 한다.

이 track은 server나 UI 파일을 직접 수정하지 않는다.

### 병렬 Track C: HTTP API And Store

소유 범위:

- `apps/server/src/store/fileStore.ts`
- `apps/server/src/http/api.ts`
- `apps/server/src/domain/samplePlan.ts`
- 필요 시 server 테스트

책임:

- session store를 graph-only session으로 전환한다.
- create, get, validate, replace, mutate graph API를 추가한다.
- fixture session 생성을 graph fixture 기반으로 교체한다.
- 모든 graph mutation이 validation을 실행하고 revision metadata를 기록하게 한다.

이 track은 contract 형태가 합의된 뒤 시작한다. contract 담당자가 stub type을 먼저 제공하면 draft type 기준으로 병렬 구현할 수 있다.

### 병렬 Track D: MCP Tools

소유 범위:

- `apps/server/src/mcp/stdioServer.ts`
- `apps/server/src/mcp/httpTools.ts`

책임:

- `PlanDraft` 기반 tool schema를 `GraphPlanDocument` 기반 schema로 교체한다.
- `replace_graph_plan`, `mutate_graph_plan`, `validate_graph_plan`을 추가한다.
- tool description이 graph, node, block, edge, prototype piece, artifact range target을 사용하도록 수정한다.

이 track은 store API의 method 이름이 안정된 뒤 시작한다.

### 병렬 Track E: Review UI

소유 범위:

- `apps/review-web/src/app/`
- `apps/review-web/src/api/client.ts`
- `apps/review-web/src/styles.css`

책임:

- `StepList`와 `StepDetail`을 제거한다.
- graph overview, node detail, block renderer, validation panel, graph target breadcrumb, graph feedback center를 추가한다.
- 새 API contract의 graph-only session을 렌더링한다.

이 track은 HTTP API가 graph-only session을 반환한 뒤 시작한다.

## Phase 1: Graph Validator Issue Taxonomy 정리

### 범위

validator, API, MCP, UI가 공유할 안정적인 issue 언어를 만든다.
상세 목적, 소비자별 책임, category/code 체계, issue 예시는 [docs/graph-validator-taxonomy.md](docs/graph-validator-taxonomy.md)를 source of truth로 둔다.

추가 또는 정식화할 항목:

- `GraphPlanIssueCode`
- `GraphPlanIssueCategory`
- `GraphPlanValidationIssue`
- `GraphPlanValidationSummary`
- `GraphPlanValidationMode`

권장 issue 형태:

```ts
type GraphPlanValidationIssue = {
  severity: "error" | "warning";
  code: GraphPlanIssueCode;
  category: GraphPlanIssueCategory;
  message: string;
  path: string;
  target?: GraphPlanTarget;
  pointer?: GraphPlanPointer;
};
```

권장 category:

- `identity`
- `reference`
- `target`
- `graph_contract`
- `condition`
- `runtime`
- `artifact`
- `revision_lineage`
- `authoring_quality`

### 완료 조건

- `docs/graph-validator-taxonomy.md`의 category와 code가 실제 TypeScript 타입과 일치한다.
- 현재 validator issue code가 모두 typed taxonomy에 포함된다.
- `validateGraphPlan(...)`이 issue count와 `publishReady`를 포함한 summary를 반환한다.
- positive graph fixture는 error 0개를 반환한다.
- adversarial fixture는 기대한 issue code를 반환한다.
- validator 호출부가 raw `code: string`에 의존하지 않는다.
- API와 MCP가 validation summary를 그대로 반환할 수 있는 형태로 issue shape가 고정된다.

### 검증 방법

실행:

```bash
pnpm typecheck
pnpm build
```

package test가 있거나 추가된다면 해당 테스트도 실행한다. 최소한 positive fixture와 adversarial fixture를 확인하는 validator regression test를 추가한다.

## Phase 2: Graph-Only Contract 정의

### 범위

public plan contract를 graph-only session과 event schema로 교체한다.

contract 방향:

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

event는 `GraphPlanTarget`을 사용한다.

- `user.feedback`
- `agent.reply`
- `agent.revision`
- `user.approval`

mutation contract:

- `ReplaceGraphPlanInput`
- `GraphPlanMutationInput`
- `GraphPlanMutationOperation`
- `GraphPlanMutationResult`
- `GraphPlanChangeSummary`

### 완료 조건

- public contract에서 `PlanSession.plan`이 사라진다.
- public session schema가 `graphPlan`을 사용한다.
- public event schema가 `GraphPlanTarget`을 사용한다.
- top-level prototype schema는 active session contract에서 제거된다. prototype review는 graph `prototype` block과 `prototype_piece` target으로 통합된다.
- 기존 `session.plan.steps` 사용은 TypeScript가 잡아낸다.

### 검증 방법

실행:

```bash
pnpm typecheck
```

이 phase에서는 contract가 먼저 바뀌면서 server/UI compile failure가 날 수 있다. 단, 그 실패는 알려진 migration site만 가리켜야 하며 최종 상태에서는 모두 해결되어야 한다.

## Phase 3: HTTP API 생성 및 교체

### 범위

`PlanDraft` 기반 API를 graph-only API로 교체한다.
상세 API 설계와 operation taxonomy는 [docs/graph-api-design.md](docs/graph-api-design.md)를 source of truth로 둔다.

MVP route:

```txt
POST /api/sessions
GET  /api/sessions/:sessionId
GET  /api/sessions/:sessionId/events

PUT  /api/sessions/:sessionId/graph-plan
POST /api/sessions/:sessionId/graph-plan/mutations
POST /api/graph-plan/validate

POST /api/sessions/:sessionId/feedback
POST /api/sessions/:sessionId/agent-replies
POST /api/sessions/:sessionId/approval
```

MVP mutation operation:

- `replace_document`
- `update_node_fields`
- `update_block_fields`
- `replace_block`
- `append_block`
- `add_node`
- `add_edge`
- `remove_node`
- `remove_edge`
- `rewire_edge`
- `add_subgraph`
- `attach_graph_ref`

모든 mutation request는 `baseRevision`을 요구한다.
여러 operation은 `POST /api/sessions/:sessionId/graph-plan/mutations`에서 atomic transaction으로 적용한다.

모든 mutation response는 다음을 반환한다.

- updated session
- validation summary
- revision event

### 완료 조건

- `POST /api/sessions`가 `GraphPlanDocument`를 받는다.
- `GET /api/sessions/:sessionId`가 graph-only session shape를 반환한다.
- `PUT /api/sessions/:sessionId/graph-plan`이 전체 교체를 수행한다.
- `POST /api/sessions/:sessionId/graph-plan/mutations`가 여러 operation을 atomic하게 적용한다.
- atomic mutation 실패 시 partial session이 저장되지 않는다.
- mutation operation semantics가 `docs/graph-api-design.md`의 MVP operation set과 일치한다.
- node 삭제, edge 삭제, subgraph 추가처럼 부작용이 큰 operation은 명시적 policy 또는 보수적 기본값을 가진다.
- create, replace, mutate 경로가 모두 validation을 실행한다.
- `POST /api/graph-plan/validate`는 session 저장 없이 검증만 수행한다.
- fixture session route는 graph session만 생성한다.

### 검증 방법

실행:

```bash
pnpm typecheck
pnpm build
```

수동 API 검증:

```bash
pnpm dev
curl -s -X POST http://localhost:8787/api/fixture-session
curl -s http://localhost:8787/api/sessions/<sessionId>
```

응답에 `graphPlan`, `validation`이 있고 `plan.steps`가 없는지 확인한다.

## Phase 4: MCP 도구 변경

### 범위

동일한 graph-only workflow를 MCP로 노출한다.
MCP tool은 [docs/graph-api-design.md](docs/graph-api-design.md)의 HTTP API와 같은 graph contract, mutation operation, validation summary를 사용한다.
상세 tool set, tool contract, error handling, 검증 시나리오는 [docs/graph-mcp-design.md](docs/graph-mcp-design.md)를 source of truth로 둔다.

도구:

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

기존 tool 이름을 유지할 수는 있지만, description과 schema는 graph-only여야 한다. 어떤 tool description도 `PlanDraft`, `step`, `phase`를 primary model로 언급하면 안 된다.

### 완료 조건

- `docs/graph-mcp-design.md`의 tool contract와 실제 MCP schema가 일치한다.
- MCP create tool이 `GraphPlanDocument`를 받는다.
- MCP session read가 graph-only session contract를 반환한다.
- MCP reply와 revision tool이 `GraphPlanTarget`을 받는다.
- MCP mutation tool이 atomic graph operation을 지원한다.
- MCP validation tool이 taxonomy summary를 반환한다.
- tool description이 agent에게 graph, node, block, edge, prototype piece, artifact range target 사용을 안내한다.
- MCP error가 `base_revision_mismatch`, `validation_blocked`, `target_not_found`처럼 agent가 복구 가능한 code와 context를 제공한다.

### 검증 방법

실행:

```bash
pnpm typecheck
pnpm build
```

이후 fresh Codex session에서 등록된 MCP server로 검증하거나, 가능하면 server의 MCP HTTP route로 다음을 확인한다.

- graph plan session 생성
- event 조회
- graph plan validation
- block 하나 mutate
- 전체 graph plan replace
- block 또는 node target에 agent reply 작성

## Phase 5: Review UI 교체

### 범위

step-based UI를 read-only graph review UI로 교체한다.
상세 layout, component 책임, URL state, validation issue 표시 정책은 [docs/graph-review-ui-design.md](docs/graph-review-ui-design.md)를 source of truth로 둔다.

제거 또는 교체 대상:

- `StepList.tsx`
- `StepDetail.tsx`
- step 기반 feedback target state
- step 기반 prototype target label

추가 대상:

- `GraphOverview`
- `GraphNodeList`
- `NodeDetail`
- `BlockRenderer`
- `GraphTargetBreadcrumb`
- `GraphFeedbackCenter`
- `ValidationPanel`
- `GraphPrototypePanel`

### 완료 조건

- `docs/graph-review-ui-design.md`의 component 책임과 실제 UI 구조가 일치한다.
- UI가 root graph title, goal, revision, status, validation summary를 렌더링한다.
- 사용자가 graph node를 선택하고 block을 확인할 수 있다.
- edge와 branch condition이 사람이 읽을 수 있는 형태로 보인다.
- 사용자가 가능한 경우 graph, node, block, edge, prototype piece, artifact range에 피드백을 남길 수 있다.
- event timeline이 graph target breadcrumb를 표시한다.
- validation issue가 category와 target 기준으로 표시된다.
- selected graph/node/block/piece state가 URL에 반영된다.
- UI 코드가 `session.plan.steps`를 읽지 않는다.

### 검증 방법

실행:

```bash
pnpm typecheck
pnpm build
pnpm dev
```

수동 브라우저 검증:

- graph fixture session을 생성한다.
- review URL을 연다.
- graph overview와 node detail이 렌더링되는지 확인한다.
- node 또는 block에 feedback을 남긴다.
- event timeline이 올바른 graph target을 표시하는지 확인한다.
- API 또는 MCP로 graph mutation을 적용한다.
- revision과 validation summary가 갱신되는지 확인한다.

## 최종 Acceptance Criteria

- 저장소가 step-based POC를 active session model로 노출하지 않는다.
- `GraphPlanDocument`가 session API와 MCP tool에서 유일한 active plan payload다.
- validator issue는 typed code와 category를 사용한다.
- 전체 graph replacement와 atomic partial mutation이 모두 동작한다.
- feedback과 reply가 graph target에 붙는다.
- graph 생성, 교체, mutation 뒤 validation이 실행된다.
- graph fixture session을 생성하고 review할 수 있다.
- `pnpm typecheck`와 `pnpm build`가 통과한다.
