# Browser-Based Plan Review UI Architecture

## 1. Architecture Summary

POC는 단일 로컬 서버로 시작한다. 하나의 서버 프로세스가 MCP endpoint, web/API endpoint, session store, realtime update stream, review web app을 책임진다.

기술 선택의 핵심은 Vite HMR을 제품 데이터 동기화 수단으로 사용하지 않는 것이다. Plan JSON과 prototype URL tab metadata는 session-scoped canonical data로 취급한다. 최신성은 서버의 session event stream과 API refetch로 보장한다.

Vite는 review web app의 개발/빌드 도구로 사용한다. Prototype iframe은 별도 runtime이 아니라 사용자가 제공한 외부 URL을 직접 띄운다.

현재 구현 로드맵은 step-based `PlanDraft` POC를 graph-based `GraphPlanDocument` 세션으로 확장하는 것이다. 기존 linear session은 compatibility baseline으로 유지하고, graph session은 같은 서버/store/MCP/realtime 경계를 통과해야 한다.

## 2. Recommended Stack

Runtime:

- Node.js
- TypeScript

Single Local Server:

- Hono
- MCP SDK
- Server-Sent Events
- Zod
- File-backed JSON/JSONL for POC
- SQLite as the likely next persistence layer

Review Web App:

- React
- Vite
- TypeScript
- TanStack Query
- Zustand optional
- React Router
- Project design-system tokens/components

Prototype URL iframe:

- Plan-linked URL tabs
- sandboxed iframe in review-web
- external app owns its internal UI
- fallback action to open selected URL in a new window

Shared Packages:

- `packages/plan-schema`
- `packages/design-system`

## 3. Current Graph Plan Direction

Graph plan integration의 source of truth는 `docs/graph-plan-overview.md`와 `docs/graph-plan-todo.md`이다.

핵심 설계 방향:

- `PlanDraft`와 `GraphPlanDocument`는 같은 session infrastructure를 공유한다.
- session payload는 linear plan과 graph plan을 구분할 수 있어야 한다.
- graph session은 validator summary를 API/MCP 응답에 포함한다.
- feedback target은 기존 `plan`, `step`, `prototype`에서 `graph`, `node`, `block`, `edge`, `prototype_piece`, `artifact_range`까지 확장된다.
- target resolver는 event 저장, reply thread 연결, revision summary, UI breadcrumb가 같은 의미를 쓰도록 서버 domain 경계에 둔다.
- validator는 schema parse 이후 semantic validation을 실행하고, UI가 표시할 수 있는 stable issue code를 반환한다.

초기 payload 형태는 다음 둘 중 하나로 결정해야 한다.

```txt
Option A: compatible optional fields
PlanSession
  plan?: PlanDraft
  graphPlan?: GraphPlanDocument
  validatorSummary?: GraphPlanValidationSummary
```

```txt
Option B: discriminated payload
PlanSession
  payload:
    type: "linear" | "graph"
    plan?: PlanDraft
    graphPlan?: GraphPlanDocument
    validatorSummary?: GraphPlanValidationSummary
```

M1에서는 선택지를 문서화한 뒤 하나로 고정한다. 이후 MCP와 HTTP API는 선택된 payload shape만 소비한다.

## 4. Runtime Shape

```txt
Single Local Server :8787
  /sessions/:sessionId
    review web app

  /api/sessions/:sessionId
    latest PlanSession JSON, including graphPlan and validatorSummary for graph sessions

  /api/sessions/:sessionId/feedback
    user feedback write

  /api/sessions/:sessionId/approve
    approval write

  /events/sessions/:sessionId
    SSE stream for plan/prototype updates

  /mcp
    MCP tool endpoint
```

Graph plan MVP에서 추가되는 route/API surface:

```txt
  /api/graph-fixture-session
    creates a representative graph plan fixture session

  /api/sessions/:sessionId/graph-targets/:targetId
    optional target resolver/debug endpoint if needed during UI development
```

## 5. Repository Structure

```txt
agent-gui
  apps/
    server/
      src/
        main.ts
        http/
          routes.sessions.ts
          routes.events.ts
          routes.assets.ts
        mcp/
          tools.ts
          createPlanSession.ts
          getPlanSession.ts
          listPlanEvents.ts
          postAgentReply.ts
          updatePlanRevision.ts
          markPlanApproved.ts
        realtime/
          sessionStream.ts
        store/
          sessionStore.ts
          eventStore.ts
          prototypeStore.ts
          persistence.ts
        domain/
          planTypes.ts
          planSession.ts
          revisions.ts
          feedback.ts

    review-web/
      src/
        app/
          SessionReviewPage.tsx
        components/
          PlanHeader.tsx
          PlanOutline.tsx
          StepDetail.tsx
          FeedbackThread.tsx
          ActivityTimeline.tsx
          PrototypePanel.tsx
        api/
          client.ts
          sessionEvents.ts
        state/
          sessionQuery.ts

  packages/
    plan-schema/
      src/index.ts
      src/graphPlan.ts
      src/graphPlanSemanticValidator.ts
      src/graphPlanFixtures.ts
    design-system/
      src/index.ts

  fixtures/
    review-target-app/
      package.json
      src/
        App.tsx
        ux/
          ReviewSurface.tsx

  data/
    sessions/
      plan_123/
        session.json
        events.jsonl
        prototypes are stored as metadata inside session.json
```

## 6. Module Boundaries

### 6.1 Domain

The domain layer owns:

- `PlanSession`
- `PlanDraft`
- `PlanEvent`
- `PlanPrototype`
- revision rules
- feedback disposition rules
- session status transitions
- graph target resolution and breadcrumb labels
- graph validator invocation and issue summary creation

### 6.2 Store

The store layer owns persistence interfaces.

POC storage:

```txt
data/sessions/:sessionId/session.json
data/sessions/:sessionId/events.jsonl
data/sessions/:sessionId/session.json
```

The store should be interface-driven so JSON/JSONL can later be replaced by SQLite.

Graph plan payloads are larger than linear plans, so revision history storage needs an explicit decision before SQLite migration. For the POC, each revision may still write the full latest session JSON, but graph revision events should include enough target and change summary metadata for the UI timeline without diffing old payloads.

### 6.3 MCP

The MCP layer exposes agent tools:

- `create_plan_session`
- `get_plan_session`
- `list_plan_events`
- `post_agent_reply`
- `update_plan_revision`
- `mark_plan_approved`

MCP tools must call the same domain services as the web API. They must not directly mutate files or database rows.

`update_plan_revision` remains the single revision update tool. It accepts an optional `target` so the agent can focus the requested change on a specific step, prototype, graph node, block, edge, prototype piece, or artifact range while still storing a full plan revision.

For graph sessions:

- `create_plan_session` accepts either a linear plan payload or graph plan payload.
- `get_plan_session` returns graph plan payload plus validator summary.
- `list_plan_events` returns graph target data and a human-readable breadcrumb.
- `post_agent_reply` resolves graph targets before attaching replies to feedback threads.
- `mark_plan_approved` records the approved graph plan revision.

### 6.4 HTTP

The HTTP layer serves:

- session review pages
- session JSON APIs
- feedback APIs
- approval APIs
- review web routes
- static or Vite-powered frontend assets

### 6.5 Realtime

Start with SSE.

Events:

- `session.updated`
- `event.created`
- `revision.created`
- `prototype.updated`
- `validator.updated`

WebSocket can be added later if bidirectional realtime collaboration becomes necessary.

### 6.6 Prototype URL Preview

Prototype preview is rendered by the review web app as a URL-tab iframe viewer.

Responsibilities:

- read `PlanPrototype.id`, `title`, `links`, and `tabs` from the current `PlanSession`
- show prototype identity and linked step/decision/phase badges outside the iframe
- render tab buttons for external URLs
- set iframe `src` to the selected tab URL
- treat the iframe contents as owned by the external app
- provide a timeout warning and open-in-new-window action for blocked or unavailable URLs

The review web app must not execute or inspect prototype app internals.

## 7. Data Flow

### 7.1 Plan Update From Agent

```txt
Agent
  -> MCP update_plan_revision
  -> PlanSessionService
  -> Store writes session.json and events.jsonl
  -> Realtime emits revision.created/session.updated
  -> Review web app refetches latest PlanSession
  -> Prototype panel updates if referenced step/prototype changed
```

### 7.2 User Feedback From Browser

```txt
User
  -> Review web app feedback form
  -> HTTP feedback API
  -> PlanSessionService
  -> Store appends user.feedback event
  -> Realtime emits event.created/session.updated
  -> Review web app updates timeline and target thread
```

### 7.3 Prototype URL Tab Update

```txt
Agent or user action
  -> MCP/API writes full PlanDraft revision
  -> Store persists prototype id/title/links/tabs inside session.json
  -> Realtime emits prototype.updated
  -> Review web app refetches session
  -> Prototype panel updates URL tabs
  -> linked step/decision panels update prototype references
```

### 7.4 Feedback-Driven Prototype Revision

```txt
User leaves feedback on linked step/prototype
  -> user.feedback event stores target
  -> Agent reads feedback through MCP
  -> Agent revises PlanDraft and linked PlanPrototype
  -> AgentRevisionEvent stores plan changeSummary and prototypeChanges
  -> Review UI shows plan changes and prototype changes separately
  -> Prototype iframe renders the selected external URL
```

### 7.5 Graph Plan Session Creation

```txt
Agent
  -> MCP create_plan_session with GraphPlanDocument
  -> graphPlanDocumentSchema parse
  -> validateGraphPlanSemantics
  -> PlanSessionService stores graph payload and validator summary
  -> Review web app opens session URL
  -> Graph overview renders root graph and selected node detail
```

### 7.6 Graph Target Feedback

```txt
User
  -> Review web app graph feedback composer
  -> HTTP feedback API with GraphPlanTarget
  -> TargetResolver validates graph/node/block/edge/prototype/artifact target
  -> Store appends user.feedback event with breadcrumb metadata
  -> Realtime emits event.created/session.updated
  -> MCP list_plan_events returns target and breadcrumb for agent action
```

## 8. Iframe Responsibility

The iframe content is owned by the external URL web app.

```txt
Review Web App
  - renders iframe
  - displays prototype id/title and linked plan targets
  - renders URL tabs
  - shows feedback/revision UI

External Prototype App
  - runs on its own localhost or HTTPS URL
  - owns all internal UI and state
  - may be any web app that allows iframe embedding

Single Local Server
  - serves review app
  - stores canonical session/prototype URL metadata
  - emits update events
```

Example iframe:

```tsx
<iframe src={selectedPrototypeTab.url} />
```

## 9. Vite Usage

Vite should be used for:

- local development of the review web app
- middleware mode inside the single local server
- frontend bundling

Vite should not be used as the product-level data synchronization mechanism for plan JSON or prototype URL metadata.

Plan/prototype freshness is handled by:

- session APIs
- SSE event stream
- explicit refetch
- iframe `src` update when a selected tab changes

## 10. Prototype Boundary

Plan GUI does not own prototype internals. It owns only:

- prototype identity (`id`, `title`, `summary`)
- plan-target links (`links`)
- URL tabs (`tabs`)
- iframe shell behavior

## 11. Persistence Strategy

POC:

- `session.json` stores latest `PlanSession` shape or latest `PlanDraft` plus metadata
- `events.jsonl` stores append-only `PlanEvent` rows
- `PlanDraft.prototypes[]` stores prototype ids, plan links, and URL tabs

Later:

- SQLite `sessions` table
- SQLite `events` table
- SQLite `prototype_tabs` or `prototype_artifacts` table if metadata grows
- optional file/blob storage for larger prototype artifacts

## 12. Security and Isolation

POC isolation requirements:

- every read/write is scoped by `sessionId`
- iframe loads external URL content separately from review UI
- review web app does not execute or inspect external prototype code
- external prototype code cannot access Agent GUI session state through normal APIs
- iframe uses sandbox attributes where practical

The POC is local-first and does not attempt full production-grade untrusted code execution isolation.

## 13. Minimal Build Order

1. `packages/plan-schema`
2. `apps/server` with Hono
3. file-backed session/event/prototype stores
4. MCP tools backed by domain services
5. `fixtures/review-target-app`
6. review web session page
7. SSE session event stream
8. prototype URL tab iframe viewer
9. prototype update and immediate iframe `src` refresh
10. complete implementation and local non-registered checks
11. Codex MCP server registration
12. user-requested Codex session restart immediately before real scenario verification
13. registered-MCP fixture project E2E scenario

## 14. MCP Registration Gate

The implemented MCP server cannot be treated as complete until it has been registered with Codex and exercised through the registered tool surface.

Expected flow:

```txt
1. Implement the single local server and MCP endpoint.
2. Finish the implementation and local non-registered checks.
3. Add the MCP server to Codex MCP configuration.
4. Ask the user to restart the Codex session immediately before real scenario verification.
5. After restart, verify that the MCP tools are available.
6. Use the registered MCP tools against fixtures/review-target-app.
7. Complete the plan review, prototype, revision, and approval scenario.
```

This gate exists because a newly implemented local MCP server may not be usable by the current Codex session until it is registered and the session is restarted.

## 15. Fixture Project

The repository must include a fixture project that acts as the realistic target of the plan review flow.

Recommended fixture:

```txt
fixtures/review-target-app
  small React app
  at least one UX surface to improve
  design-system usage
  prototype-worthy interaction
```

The fixture project should not be a static mock only. It should be realistic enough for the agent to inspect the code, create a plan, attach a prototype to a UX-related step, respond to feedback, revise the plan, and reach approval.

## 16. Expansion Path

Initial:

```txt
single local server
review UI local
prototype URL iframe preview
file-backed persistence
```

Later:

```txt
external review web app
local companion server
external prototype URLs loaded in sandboxed iframe
SQLite or server persistence
optional tunnel or local HTTPS
```

The module boundaries above are intended to make that split possible without rewriting the domain model or MCP tools.
