# Browser-Based Plan Review UI Architecture

## 1. Architecture Summary

POC는 단일 로컬 서버로 시작한다. 하나의 서버 프로세스가 MCP endpoint, web/API endpoint, session store, realtime update stream, review web app을 책임진다.

기술 선택의 핵심은 Vite HMR을 제품 데이터 동기화 수단으로 사용하지 않는 것이다. Plan JSON과 prototype URL tab metadata는 session-scoped canonical data로 취급한다. 최신성은 서버의 session event stream과 API refetch로 보장한다.

Vite는 review web app의 개발/빌드 도구로 사용한다. Prototype iframe은 별도 runtime이 아니라 사용자가 제공한 외부 URL을 직접 띄운다.

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

## 3. Runtime Shape

```txt
Single Local Server :8787
  /sessions/:sessionId
    review web app

  /api/sessions/:sessionId
    latest PlanSession JSON

  /api/sessions/:sessionId/feedback
    user feedback write

  /api/sessions/:sessionId/approve
    approval write

  /events/sessions/:sessionId
    SSE stream for plan/prototype updates

  /mcp
    MCP tool endpoint
```

## 4. Repository Structure

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

## 5. Module Boundaries

### 5.1 Domain

The domain layer owns:

- `PlanSession`
- `PlanDraft`
- `PlanEvent`
- `PlanPrototype`
- revision rules
- feedback disposition rules
- session status transitions

### 5.2 Store

The store layer owns persistence interfaces.

POC storage:

```txt
data/sessions/:sessionId/session.json
data/sessions/:sessionId/events.jsonl
data/sessions/:sessionId/session.json
```

The store should be interface-driven so JSON/JSONL can later be replaced by SQLite.

### 5.3 MCP

The MCP layer exposes agent tools:

- `create_plan_session`
- `get_plan_session`
- `list_plan_events`
- `post_agent_reply`
- `update_plan_revision`
- `mark_plan_approved`

MCP tools must call the same domain services as the web API. They must not directly mutate files or database rows.

`update_plan_revision` remains the single revision update tool. It accepts an optional `target` so the agent can focus the requested change on a specific step or prototype while still storing a full PlanDraft revision.

### 5.4 HTTP

The HTTP layer serves:

- session review pages
- session JSON APIs
- feedback APIs
- approval APIs
- review web routes
- static or Vite-powered frontend assets

### 5.5 Realtime

Start with SSE.

Events:

- `session.updated`
- `event.created`
- `revision.created`
- `prototype.updated`

WebSocket can be added later if bidirectional realtime collaboration becomes necessary.

### 5.6 Prototype URL Preview

Prototype preview is rendered by the review web app as a URL-tab iframe viewer.

Responsibilities:

- read `PlanPrototype.id`, `title`, `links`, and `tabs` from the current `PlanSession`
- show prototype identity and linked step/decision/phase badges outside the iframe
- render tab buttons for external URLs
- set iframe `src` to the selected tab URL
- treat the iframe contents as owned by the external app
- provide a timeout warning and open-in-new-window action for blocked or unavailable URLs

The review web app must not execute or inspect prototype app internals.

## 6. Data Flow

### 6.1 Plan Update From Agent

```txt
Agent
  -> MCP update_plan_revision
  -> PlanSessionService
  -> Store writes session.json and events.jsonl
  -> Realtime emits revision.created/session.updated
  -> Review web app refetches latest PlanSession
  -> Prototype panel updates if referenced step/prototype changed
```

### 6.2 User Feedback From Browser

```txt
User
  -> Review web app feedback form
  -> HTTP feedback API
  -> PlanSessionService
  -> Store appends user.feedback event
  -> Realtime emits event.created/session.updated
  -> Review web app updates timeline and target thread
```

### 6.3 Prototype URL Tab Update

```txt
Agent or user action
  -> MCP/API writes full PlanDraft revision
  -> Store persists prototype id/title/links/tabs inside session.json
  -> Realtime emits prototype.updated
  -> Review web app refetches session
  -> Prototype panel updates URL tabs
  -> linked step/decision panels update prototype references
```

### 6.4 Feedback-Driven Prototype Revision

```txt
User leaves feedback on linked step/prototype
  -> user.feedback event stores target
  -> Agent reads feedback through MCP
  -> Agent revises PlanDraft and linked PlanPrototype
  -> AgentRevisionEvent stores plan changeSummary and prototypeChanges
  -> Review UI shows plan changes and prototype changes separately
  -> Prototype iframe renders the selected external URL
```

## 7. Iframe Responsibility

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

## 8. Vite Usage

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

## 9. Prototype Boundary

Plan GUI does not own prototype internals. It owns only:

- prototype identity (`id`, `title`, `summary`)
- plan-target links (`links`)
- URL tabs (`tabs`)
- iframe shell behavior

## 10. Persistence Strategy

POC:

- `session.json` stores latest `PlanSession` shape or latest `PlanDraft` plus metadata
- `events.jsonl` stores append-only `PlanEvent` rows
- `PlanDraft.prototypes[]` stores prototype ids, plan links, and URL tabs

Later:

- SQLite `sessions` table
- SQLite `events` table
- SQLite `prototype_tabs` or `prototype_artifacts` table if metadata grows
- optional file/blob storage for larger prototype artifacts

## 11. Security and Isolation

POC isolation requirements:

- every read/write is scoped by `sessionId`
- iframe loads external URL content separately from review UI
- review web app does not execute or inspect external prototype code
- external prototype code cannot access Agent GUI session state through normal APIs
- iframe uses sandbox attributes where practical

The POC is local-first and does not attempt full production-grade untrusted code execution isolation.

## 12. Minimal Build Order

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

## 13. MCP Registration Gate

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

## 14. Fixture Project

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

## 15. Expansion Path

Initial:

```txt
single local server
review UI local
prototype runtime local
file-backed persistence
```

Later:

```txt
external review web app
local companion server
local prototype runtime
SQLite or server persistence
optional tunnel or local HTTPS
```

The module boundaries above are intended to make that split possible without rewriting the domain model or MCP tools.
