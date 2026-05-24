# Agent GUI

Agent GUI는 에이전트가 만든 graph plan을 브라우저에서 리뷰하고, 사용자의 피드백과 에이전트의 답변/수정 revision을 MCP tool로 주고받는 POC입니다.

현재 제품 모델은 graph와 node iframe 중심입니다.

- Graph는 작업의 흐름, 의존성, 분기, 반복, 하위 흐름을 표현합니다.
- Node는 사람이 선택하고 검토하는 판단 단위입니다.
- Node의 `iframes[]`는 에이전트가 직접 구성한 HTML 상세 화면의 진입점입니다.
- 상세 체크리스트, before/after 비교, 프로토타입 상태, 리뷰 질문은 React UI가 구조화해서 해석하지 않고 iframe HTML이 담당합니다.
- Feedback/reply/revision target은 `GraphPlanTarget`으로 저장합니다.

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

## MCP Flow

Codex에 등록된 MCP server는 다음 tool을 제공합니다.

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
6. 브라우저가 최신 status, revision, change summary, thread를 반영합니다.
7. 사용자가 현재 revision을 승인합니다.

## Current Graph/HTML Model

`GraphPlanDocument`는 top-level `graphs[]`를 갖고, 각 graph는 `nodes[]`와 graph-level `edges[]`를 갖습니다.

Node는 하위 graph id와 iframe entry를 가질 수 있습니다.

```ts
type GraphPlanNode = {
  id: string;
  kind: string;
  title: string;
  summary?: string;
  blocks: GraphPlanBlock[];
  ownedGraphIds?: string[];
  iframes?: {
    id: string;
    description: string;
    url: string;
  }[];
};
```

iframe URL은 기본적으로 다음만 허용합니다.

- `http://localhost:<port>/...`
- `http://127.0.0.1:<port>/...`

같은 node 안에서 `iframes[].id`는 유일해야 합니다.

## Review UI Shape

Review UI는 현재 다음 구조를 기준으로 합니다.

```txt
Header
Left Graph View
Right Detail Panel
```

- Header는 title, goal, status, revision, validation, approval action을 보여줍니다.
- Left Graph View는 root graph와 모든 하위 graph를 함께 보여줍니다.
- Right Detail Panel은 현재 선택한 node 정보, iframe tabs, active sandbox iframe preview, feedback composer를 보여줍니다.
- iframe tab 선택 상태에서 feedback을 남기면 target은 `{ type: "iframe", graphId, nodeId, iframeId }`입니다.

## What To Inspect For POC Value

POC의 가치를 보려면 코드보다 먼저 실제 루프를 봐야 합니다.

1. **Review UI가 긴 계획을 읽기 쉽게 만드는지**
   - title/goal/status/revision이 바로 보이는지
   - 전체 graph와 하위 graph의 관계가 한 화면에서 파악되는지
   - 선택한 node의 목적과 연결된 iframe 상세 화면이 판단하기 쉬운지

2. **피드백 target이 명확한지**
   - graph, node, edge, iframe feedback이 구분되는지
   - iframe tab feedback이 node 전체 피드백과 구분되는지
   - event timeline에서 어떤 target에 대한 피드백인지 추적 가능한지

3. **에이전트 응답 루프가 덜 헷갈리는지**
   - `list_plan_events` 결과만 보고 에이전트가 다음 행동을 결정할 수 있는지
   - `post_agent_reply`가 원래 feedback thread 아래에 붙는지
   - feedback history가 보존되는지

4. **Revision이 사용자에게 충분히 설명되는지**
   - revision 번호가 증가하는지
   - change summary가 실제 의사결정에 충분한지
   - targeted mutation이 전체 plan 재작성보다 명확한지

5. **iframe HTML이 텍스트 계획을 보완하는지**
   - iframe preview가 node 판단에 도움이 되는지
   - 여러 iframe tab이 같은 node의 상세 진입점으로 이해되는지
   - iframe feedback이 plan thread와 함께 추적되는지

6. **세션 격리가 믿을 만한지**
   - session A/B의 events, revision, graph/iframe state가 섞이지 않는지
   - API와 브라우저 화면이 같은 session boundary를 지키는지

# 행동지침

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

# 구현 시 필수 준수사항

Clean Code Rules for Preventing God Files

## Core Principle

Split code by responsibility, not by convenience.

A file must have one clear reason to exist and one clear reason to change.

## File Design Rules

- Each file must have a single responsibility.
- Do not mix business logic, UI, API calls, data access, state management, and configuration in one file.
- Do not keep appending new features to an existing file just because it is convenient.
- When a file starts growing too large, split it by responsibility immediately.
- Prefer small, focused modules over large multi-purpose files.
- File names must clearly describe their role.
- Avoid vague file names such as `utils.ts`, `helpers.ts`, `common.ts`, or `misc.ts`.
- Shared constants, types, utilities, services, hooks, components, and configuration must live in separate dedicated files.
- Keep dependency direction clear and avoid circular dependencies.
- Prioritize clear responsibility boundaries over premature abstraction.
- Do not create abstractions only to remove small amounts of duplication.
- Before modifying a file, ask: “Does this change belong to this file’s responsibility?”
- Large changes must be implemented through multiple focused files, not one large file.
- Code must remain easy to test; isolate external dependencies behind clear boundaries.

## Size Limits

- A file over 300 lines must be reviewed for possible separation.
- A file must not exceed 500 lines unless there is a strong architectural reason.
- A function should do one thing and should not exceed 50 lines.
- A component, class, or module should stay focused on a single role.

## Forbidden

- Do not create god files.
- Do not create files that contain multiple unrelated responsibilities.
- Do not turn an existing file into a dumping ground for new logic.
- Do not place unrelated helper functions into the same file.
- Do not hide architectural problems behind generic utility files.

## Required Behavior

When implementing or modifying code:

1. Identify the responsibility of the target file.
2. Check whether the new logic belongs there.
3. If the logic has a different responsibility, create or update a dedicated file.
4. Keep each file focused, readable, and replaceable.
5. Prefer explicit structure over convenient accumulation.

## Final Rule

If a file is becoming difficult to summarize in one sentence, split it.
