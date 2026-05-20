# Agent GUI

Agent GUI는 에이전트가 만든 작업 계획을 브라우저에서 리뷰하고, 사용자의 피드백과 에이전트의 답변/수정 revision을 MCP tool로 주고받는 POC입니다.


## What It Contains

현재 구현은 하나의 로컬 서버가 웹 UI와 MCP 역할을 함께 맡습니다.

```txt
apps/server            단일 로컬 서버, API, SSE, MCP stdio/http route, planctl
apps/review-web        브라우저 plan review UI
apps/prototype-runtime prototype iframe preview runtime
packages/plan-schema   PlanSession, PlanEvent, prototype schema
packages/design-system POC용 디자인 시스템 컴포넌트와 토큰
fixtures/review-target-app
                       실제 리뷰 대상처럼 쓰는 작은 fixture app
```

주요 문서:

- [prd.md](prd.md): 제품 의도와 범위
- [architecture.md](architecture.md): 단일 서버 구조와 모듈 경계
- [acceptance.md](acceptance.md): 완료 조건과 E2E 시나리오
- [handoff.md](handoff.md): 최근 검증 상태와 세션 기록

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

최근 검증에서 다음이 확인됐습니다.

- MCP-created session을 브라우저에서 열 수 있음
- plan/step/prototype piece feedback 저장
- `planctl notify` 후 `needs_agent` 상태 반영
- MCP event 조회, agent reply, targeted revision update
- revision 2의 change summary와 prototype piece change 표시
- 브라우저 approval 후 `approved` 상태와 approval event 저장
- 별도 control session으로 session isolation 확인

주의할 점:

- Browser Use 플러그인의 Node REPL `js` tool이 현재 세션에 노출되지 않아, 엄밀한 in-app Browser Use 검증은 아직 별도 세션에서 재시도해야 합니다.
- 실제 화면 E2E는 사용 가능한 `agent-browser` CLI로 수행했습니다.
- persistence는 POC용 file-backed store입니다.
