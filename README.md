# Agent GUI

Agent GUI는 에이전트가 만든 graph plan을 브라우저에서 리뷰하고, 사용자의 피드백과 에이전트의 답변/수정 revision을 MCP tool로 주고받는 POC입니다.

핵심 질문은 간단합니다.

- 채팅 안에서 긴 계획을 주고받는 것보다, 브라우저 화면에서 graph 흐름을 검토하는 편이 더 명확한가?
- 사용자가 graph, node, edge, iframe 같은 명확한 target에 피드백을 남길 수 있는가?
- 에이전트가 MCP tool로 그 피드백을 정확히 읽고, 답변하거나 targeted revision을 만들 수 있는가?
- revision, 변경 요약, 승인 상태가 화면에서 추적 가능한가?

이 POC는 자동 작업 실행기나 PM 도구가 아닙니다. 먼저 검증하려는 것은 graph/html 기반 계획 리뷰 루프 자체의 가치입니다.

## What It Contains

현재 구현은 하나의 로컬 서버가 웹 UI와 MCP 역할을 함께 맡습니다.

```txt
apps/server            단일 로컬 서버, API, SSE, MCP stdio/http route, planctl
apps/review-web        브라우저 graph plan review UI
packages/plan-schema   GraphPlanDocument, GraphPlanTarget, PlanSession, PlanEvent schema
packages/design-system POC용 디자인 시스템 컴포넌트와 토큰
fixtures/review-target-app
                       실제 리뷰 대상처럼 쓰는 작은 fixture app
docs/prototypes        node iframe preview용 로컬 HTML fixture
```

주요 문서:

- [prd.md](docs/prd.md): 제품 의도와 범위
- [architecture.md](docs/architecture.md): 단일 서버 구조와 모듈 경계
- [acceptance.md](docs/acceptance.md): 완료 조건과 E2E 시나리오
- [handoff.md](docs/handoff.md): 최근 검증 상태와 세션 기록
- [graph-plan-overview.md](docs/graph-plan-overview.md): 그래프 기반 플랜 목표와 모델 설명
- [graph-plan-todo.md](docs/graph-plan-todo.md): 그래프 기반 플랜 구현 투두리스트
- [graph_html_mcp_interview_summary.md](graph_html_mcp_interview_summary.md): graph/html 중심 MCP 모델과 UI 방향

## Current Model

Agent GUI의 현재 session payload는 `GraphPlanDocument`입니다.

- Document는 top-level `graphs[]`와 `rootGraphId`를 갖습니다.
- Graph는 `nodes[]`와 graph-level `edges[]`를 갖습니다.
- Node는 선택/리뷰 단위이며 하위 graph와 iframe entry를 가질 수 있습니다.
- Edge는 flow, dependency, conditional, loop 같은 graph 흐름을 표현합니다.
- iframe HTML은 node 상세 화면, 프로토타입, before/after 비교, 리뷰 질문 같은 구체 표현을 담당합니다.

Node iframe entry:

```ts
type GraphPlanIframe = {
  id: string;
  description: string;
  url: string;
};
```

iframe URL은 기본적으로 다음만 허용합니다.

- `http://localhost:<port>/...`
- `http://127.0.0.1:<port>/...`

## Review UI

Review UI는 다음 형상을 기준으로 합니다.

```txt
Header
Left Graph View
Right Detail Panel
```

- Header: title, goal, status, revision, validation, approval action
- Left Graph View: root graph와 모든 하위 graph를 함께 보여주는 전체 graph view
- Right Detail Panel: 선택한 node 정보, iframe tabs, active sandbox iframe preview, feedback composer

iframe tab 선택 상태에서 feedback을 남기면 target은 iframe entry입니다.

```ts
{
  type: "iframe";
  graphId: string;
  nodeId: string;
  iframeId: string;
}
```

## Run Locally

```bash
pnpm install
pnpm dev
```

서버는 기본적으로 `http://localhost:8787`에서 실행됩니다.

새 fixture session을 만들려면:

```bash
curl -s -X POST http://localhost:8787/api/fixture-session
```

응답의 `url`을 열면 review UI를 볼 수 있습니다.

자주 쓰는 검증 명령:

```bash
pnpm typecheck
pnpm build
pnpm --filter @agent-gui/plan-schema test
pnpm --dir apps/server test
pnpm planctl notify <sessionId>
```

## MCP Tools

Codex에 등록된 MCP server는 graph plan workflow를 위한 tool을 제공합니다.

- `create_graph_plan_session`
- `get_graph_plan_session`
- `list_plan_events`
- `post_agent_reply`
- `mutate_graph_plan`
- `replace_graph_plan`
- `normalize_graph_plan`
- `validate_graph_plan`
- `mark_plan_approved`

기본 흐름:

1. 에이전트가 `create_graph_plan_session`으로 graph plan session을 만듭니다.
2. 사용자가 브라우저에서 graph, node, edge, iframe, block 등에 피드백을 남깁니다.
3. 사용자가 `pnpm planctl notify <sessionId>`로 에이전트 확인이 필요하다고 표시합니다.
4. 에이전트가 `list_plan_events`로 피드백을 읽습니다.
5. 에이전트가 `post_agent_reply`로 답변하거나 `mutate_graph_plan` / `replace_graph_plan`으로 새 revision을 만듭니다.
6. 브라우저가 최신 status, revision, change summary, target thread를 반영합니다.
7. 사용자가 현재 revision을 승인합니다.

## What To Inspect

POC의 가치를 보려면 코드보다 먼저 실제 루프를 봐야 합니다.

1. **Graph view가 긴 계획을 읽기 쉽게 만드는지**
   - 전체 graph와 하위 graph의 관계가 한 화면에서 파악되는지
   - edge label과 conditional/loop 흐름이 판단에 도움이 되는지
   - 선택한 node가 전체 흐름에서 어디인지 명확한지

2. **Node detail과 iframe이 판단을 돕는지**
   - node title/summary/status가 충분한 맥락을 주는지
   - iframe tabs가 node의 상세 진입점으로 이해되는지
   - sandbox iframe preview가 UX/상태/비교 판단을 구체화하는지

3. **피드백 target이 명확한지**
   - graph, node, edge, iframe feedback이 구분되는지
   - event timeline에서 어떤 target에 대한 피드백인지 추적 가능한지
   - MCP `list_plan_events` 결과만 보고 에이전트가 다음 행동을 결정할 수 있는지

4. **Revision이 충분히 설명되는지**
   - revision 번호가 증가하는지
   - change summary가 실제 의사결정에 충분한지
   - targeted mutation이 전체 plan 재작성보다 명확한지

5. **세션 격리가 믿을 만한지**
   - session A/B의 events, revision, graph/iframe state가 섞이지 않는지
   - API와 브라우저 화면이 같은 session boundary를 지키는지

## Completion Signal

이 POC가 가치 있다고 볼 수 있는 신호:

- 사용자가 피드백 위치를 설명하는 시간이 줄어듭니다.
- 에이전트가 피드백을 놓치거나 잘못 해석하는 일이 줄어듭니다.
- revision마다 무엇이 바뀌었는지 채팅보다 빨리 이해됩니다.
- UX 관련 계획은 iframe preview가 있을 때 논의가 더 구체적입니다.
- 사용자가 최종 승인 전에 graph flow와 상세 HTML을 함께 확인합니다.
