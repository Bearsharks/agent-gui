# Development Guide

이 문서는 Agent GUI를 로컬에서 실행하고, fixture session을 만들고, MCP 기반 feedback/revision loop를 확인하는 개발 가이드입니다.

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

## Verification Commands

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

## MCP Flow

1. 에이전트가 `create_graph_plan_session`으로 graph plan session을 만듭니다.
2. 사용자가 브라우저에서 graph, node, edge, iframe에 피드백을 남깁니다.
3. 사용자가 `pnpm planctl notify <sessionId>`로 에이전트 확인이 필요하다고 표시합니다.
4. 에이전트가 `list_plan_events`로 피드백을 읽습니다.
5. 에이전트가 `post_agent_reply`로 답변하거나 `mutate_graph_plan` / `replace_graph_plan`으로 새 revision을 만듭니다.
6. 브라우저가 최신 status, revision, change summary, target thread를 반영합니다.
7. 사용자가 현재 revision을 승인합니다.

## GraphPlanIframe

Node iframe entry는 local HTTP preview를 가리킵니다.

```ts
type GraphPlanIframe = {
  id: string;
  description: string;
  url: string;
  entryPath?: string;
};
```

iframe URL은 기본적으로 다음만 허용합니다.

- `http://localhost:<port>/...`
- `http://127.0.0.1:<port>/...`

`entryPath`는 URL만으로 preview source를 역추적하기 어려울 때 사용합니다. 기타 시나리오 설명, 상태 의미, 검토 기준은 `description` 또는 iframe HTML 안에 둡니다.
