# Agent GUI

Agent GUI는 에이전트가 만든 작업 계획을 브라우저에서 리뷰하고, 사용자의 피드백과 에이전트의 답변/수정 revision을 MCP tool로 주고받는 POC입니다.


## What It Contains

현재 구현은 하나의 로컬 서버가 웹 UI와 MCP 역할을 함께 맡습니다.

```txt
apps/server            단일 로컬 서버, API, SSE, MCP stdio/http route, planctl
apps/review-web        브라우저 plan review UI
packages/plan-schema   PlanSession, PlanEvent, prototype schema
packages/design-system POC용 디자인 시스템 컴포넌트와 토큰
fixtures/review-target-app
                       실제 리뷰 대상처럼 쓰는 작은 fixture app
```

주요 문서:

- [prd.md](docs/prd.md): 제품 의도와 범위
- [architecture.md](docs/architecture.md): 단일 서버 구조와 모듈 경계
- [acceptance.md](docs/acceptance.md): 완료 조건과 E2E 시나리오
- [handoff.md](docs/handoff.md): 최근 검증 상태와 세션 기록
- [graph-plan-overview.md](docs/graph-plan-overview.md): 그래프 기반 플랜 목표와 모델 설명
- [graph-plan-todo.md](docs/graph-plan-todo.md): 그래프 기반 플랜 구현 투두리스트

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
pnpm planctl notify <sessionId>
```

## MCP Flow

Codex에 등록된 MCP server는 다음 tool을 제공합니다.

- `create_plan_session`
- `get_plan_session`
- `list_plan_events`
- `post_agent_reply`
- `update_plan_revision`
- `mark_plan_approved`

기본 흐름:

1. 에이전트가 `create_plan_session`으로 plan session을 만듭니다.
2. 사용자가 브라우저에서 plan, step, prototype, prototype piece에 피드백을 남깁니다.
3. 사용자가 `pnpm planctl notify <sessionId>`로 에이전트 확인이 필요하다고 표시합니다.
4. 에이전트가 `list_plan_events`로 피드백을 읽습니다.
5. 에이전트가 `post_agent_reply`로 답변하거나 `update_plan_revision`으로 새 revision을 만듭니다.
6. 브라우저가 최신 status, revision, change summary, thread를 반영합니다.
7. 사용자가 현재 revision을 승인합니다.

## What To Inspect For POC Value

POC의 가치를 보려면 코드보다 먼저 실제 루프를 봐야 합니다.

1. **Review UI가 긴 계획을 읽기 쉽게 만드는지**
   - title/goal/status/revision이 바로 보이는지
   - step list와 selected step detail이 채팅보다 판단하기 쉬운지
   - risk, verification, file context가 step 단위로 충분히 보이는지

2. **피드백 target이 명확한지**
   - plan feedback과 step feedback이 구분되는지
   - prototype feedback과 prototype piece feedback이 실제로 다른 의도를 담을 수 있는지
   - event timeline에서 어떤 target에 대한 피드백인지 추적 가능한지

3. **에이전트 응답 루프가 덜 헷갈리는지**
   - `list_plan_events` 결과만 보고 에이전트가 다음 행동을 결정할 수 있는지
   - `post_agent_reply`가 원래 feedback thread 아래에 붙는지
   - 이전 feedback revision이 보존되는지

4. **Revision이 사용자에게 충분히 설명되는지**
   - revision 번호가 증가하는지
   - change summary가 실제 의사결정에 충분한지
   - targeted update가 전체 plan 재작성보다 명확한지

5. **Prototype playground가 텍스트 계획을 보완하는지**
   - iframe preview가 UX step/decision을 이해하는 데 도움이 되는지
   - prototype piece mapping이 사용자가 판단할 만큼 명확한지
   - prototype piece feedback이 plan thread와 함께 추적되는지

6. **세션 격리가 믿을 만한지**
   - session A/B의 events, revision, prototype state가 섞이지 않는지
   - API와 브라우저 화면이 같은 session boundary를 지키는지

## Current POC Status

Step-based POC에서는 다음이 확인됐습니다.

- MCP-created session을 브라우저에서 열 수 있음
- plan/step/prototype piece feedback 저장
- `planctl notify` 후 `needs_agent` 상태 반영
- MCP event 조회, agent reply, targeted revision update
- revision 2의 change summary와 prototype piece change 표시
- 브라우저 approval 후 `approved` 상태와 approval event 저장
- 별도 control session으로 session isolation 확인

남은 validation gap:

- Browser Use 플러그인의 Node REPL `js` tool이 현재 세션에 노출되지 않아, 엄밀한 in-app Browser Use 검증은 아직 별도 세션에서 재시도해야 합니다.
- 실제 화면 E2E는 사용 가능한 `agent-browser` CLI로 수행했습니다.
- persistence는 POC용 file-backed store입니다.

## Current Implementation Direction

현재 다음 구현 방향은 graph-based plan을 실제 Plan GUI session payload로 연결하는 것입니다. 기존 Browser Use 재검증은 step-based POC의 validation gap이며, 주 구현 트랙은 아닙니다.

최신 source of truth:

- [graph-plan-overview.md](docs/graph-plan-overview.md)
- [graph-plan-todo.md](docs/graph-plan-todo.md)

바로 다음 작업은 graph plan validator issue taxonomy 정리, graph target을 포함한 `PlanTarget`/event schema 확장, `create_plan_session`의 graph payload 수용, graph fixture session route, read-only graph overview UI입니다.

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