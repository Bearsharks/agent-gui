# Browser-Based Plan Review UI PRD

## 1. Product Summary

브라우저 기반 플랜 리뷰 UI는 에이전트와 사용자가 같은 계획 화면을 공유하면서, 계획 초안에 대한 피드백과 에이전트 응답, 수정 revision을 구조화된 세션 데이터로 주고받는 POC이다.

이 POC의 핵심은 에이전트를 자동으로 깨우는 push 이벤트 시스템이 아니다. 핵심은 브라우저 UI를 공유 작업면으로 사용하고, 사용자의 피드백과 에이전트의 응답을 MCP tool을 통해 읽고 쓰는 루프가 일반 채팅보다 명확한지 검증하는 것이다.

시스템은 두 개의 역할을 제공하지만 하나의 서버 프로세스가 모두 책임진다.

- MCP server role: 에이전트가 plan session을 생성, 조회, 수정, 승인 기록할 수 있는 tool interface를 제공한다.
- Web server role: 사용자가 브라우저에서 plan review workspace와 prototype playground를 볼 수 있는 UI/API를 제공한다.

서버는 세션 단위로 plan JSON을 관리한다. 같은 서버가 MCP tool 호출과 브라우저 UI 요청을 모두 처리하므로, plan JSON이 변경될 때마다 해당 세션의 웹 화면은 항상 최신 revision 기준의 plan을 보여야 한다.

## 2. Goals

- 에이전트가 생성한 작업 계획 초안을 브라우저 화면에 표시한다.
- 사용자가 전체 플랜, phase, step, decision, risk, verification 단위로 피드백을 남길 수 있게 한다.
- 사용자의 피드백을 구조화된 이벤트로 저장한다.
- 사용자가 CLI 또는 대화로 확인을 요청하면, 에이전트가 MCP tool로 최신 세션과 이벤트를 조회할 수 있게 한다.
- 에이전트가 피드백에 답변하거나 수정된 플랜 revision을 기록할 수 있게 한다.
- 브라우저 화면에서 에이전트 답변, 변경 요약, 최신 revision, 승인 상태를 추적할 수 있게 한다.
- MCP server와 web server를 별도 프로세스로 분리하지 않고 하나의 서버에서 제공한다.
- 세션별 plan JSON을 격리해서 관리하고, 웹 UI는 항상 해당 세션의 최신 plan JSON을 기준으로 렌더링한다.
- 플랜 안의 UX 영역을 빠르게 시각화하고 검토할 수 있는 prototype playground를 제공한다.
- prototype playground는 React 기반이어야 하며, 지정된 design system을 사용해 프로토타입을 렌더링해야 한다.
- prototype playground에서 동적으로 생성 또는 수정된 React 코드가 즉시 화면에 반영되어야 한다.
- plan JSON 갱신 여부가 브라우저 UI와 playground에 즉시 반영되어야 한다.

## 3. Non-Goals

- MCP server push 기반 자동 wake-up
- 실시간 멀티유저 협업
- 고도화된 권한/인증
- 코드 실행, 테스트, 커밋까지 포함하는 전체 작업 자동화 루프
- 복잡한 diff editor
- PM tool 수준의 phase/task 관리 기능

## 4. Core Product Question

POC는 다음 질문을 검증한다.

- 사용자가 브라우저에서 플랜을 더 잘 이해하는가?
- 사용자가 피드백의 위치와 의도를 더 명확히 남길 수 있는가?
- 에이전트가 MCP tool로 피드백을 정확히 읽고 답할 수 있는가?
- 플랜 revision이 화면에서 추적 가능한가?
- 이 루프가 일반 채팅보다 덜 헷갈리는가?

## 5. Recommended Product Direction

기본 단위는 `step`으로 둔다. `phase`는 선택적 grouping 기능으로만 제공한다.

권장 구조:

```txt
Plan
  optional Phase
    Step
      purpose
      scope
      risks
      verification
      feedback thread
```

데이터 모델은 flat `steps`를 canonical source로 유지한다. `phase`는 큰 플랜을 읽기 쉽게 묶기 위한 UI grouping으로 사용한다. 이렇게 하면 revision 비교, feedback target, MCP 조회, 변경 요약이 단순하게 유지된다.

계층형 drill-down은 제공하되 2단계로 제한한다.

```txt
Plan
  Phase
    Step
```

무한 tree, nested task, phase별 독립 승인, phase별 revision은 POC 범위에 포함하지 않는다.

## 6. User Flow

1. 에이전트가 플랜 초안을 만든다.
2. 에이전트가 MCP tool `create_plan_session`을 호출한다.
3. 서버는 플랜 세션을 만들고 URL을 반환한다.
4. 사용자는 브라우저에서 플랜을 본다.
5. 사용자는 전체 플랜, phase, step, decision, risk, verification에 피드백을 남긴다.
6. 서버는 피드백을 이벤트로 저장한다.
7. 사용자는 CLI에서 세션에 확인할 피드백이 있음을 알린다.

```bash
planctl notify plan_123
```

8. CLI는 서버의 세션 상태를 `needs_agent`로 변경한다.

```json
{
  "sessionId": "plan_123",
  "status": "needs_agent",
  "notifiedAt": "2026-05-19T10:20:00Z"
}
```

9. 사용자가 대화에서 에이전트에게 "확인해보세요"라고 말한다.
10. 에이전트는 MCP tool로 세션과 이벤트를 조회한다.
11. 에이전트는 피드백을 해석해 해당 위치에 답변을 남긴다.
12. 필요한 경우 에이전트는 새 플랜 revision을 생성한다.
13. 브라우저 화면은 에이전트 답변, 변경 요약, 새 revision을 표시한다.
14. 사용자는 다시 피드백하거나 플랜을 승인한다.

## 7. Browser UI Requirements

브라우저 화면은 "플랜 문서"가 아니라 "리뷰 작업대"로 설계한다.

### 7.1 Required Areas

- 플랜 제목
- 플랜 목표
- 현재 상태
- 현재 revision
- 핵심 결정 요약
- 단계 목록
- 단계별 피드백 입력
- 전체 플랜 피드백 입력
- 이벤트 타임라인
- 에이전트 답변 영역
- 변경 요약
- 승인 버튼
- prototype playground

### 7.2 Recommended Layout

```txt
[Header]
title / goal / status / revision / approve button

[Summary]
key decisions
latest change summary
plan-level feedback input

[Plan Outline]
optional phases
step list

[Step Detail Panel]
purpose
scope
risks
verification
related files
feedback thread
agent replies

[Activity]
event timeline
revision history

[Prototype Playground]
selected UX-related step
prototype preview
prototype notes
feedback attached to prototype/step
```

초기 화면에 모든 정보를 펼쳐서 보여주지 않는다. 리스트에서는 가볍게 보여주고, 사용자가 step을 선택하면 상세 패널에서 목적, 변경 범위, 리스크, 검증, 피드백 thread를 보여준다.

이벤트 타임라인, 에이전트 답변 전체, 변경 요약 전체는 activity drawer 또는 side panel에 배치할 수 있다.

### 7.3 Prototype Playground

Prototype playground는 플랜에서 UX 관련 step이나 decision을 선택해 간단한 프로토타입을 바로 그려보고 리뷰할 수 있는 영역이다.

POC에서 playground의 목적은 production UI builder가 아니라, 플랜의 UX 판단을 텍스트만으로 리뷰하지 않고 시각적 초안과 함께 검토하는 것이다.

기술적 필수 요구사항:

- playground는 React runtime 위에서 동작해야 한다.
- playground에서 렌더링되는 프로토타입은 프로젝트가 지정한 design system 컴포넌트와 토큰을 사용해야 한다.
- 동적으로 생성되는 prototype code는 저장 후 새로고침을 기다리지 않고 즉시 preview에 반영되어야 한다.
- code update와 preview update 사이의 지연은 사용자가 실시간 편집으로 인식할 수 있을 정도로 짧아야 한다.
- plan JSON이 갱신되면 playground가 참조하는 plan, step, decision, prototype state도 즉시 최신 기준으로 갱신되어야 한다.
- playground는 현재 sessionId와 revision을 기준으로 prototype state를 격리해야 한다.

요구사항:

- UX 관련 step 또는 decision에 연결된다.
- 현재 세션과 revision에 속한 prototype state를 표시한다.
- plan JSON이 갱신되면 playground가 참조하는 step, decision, revision도 최신 기준으로 갱신된다.
- 사용자는 prototype에 대한 피드백을 남길 수 있다.
- prototype 피드백은 일반 피드백과 동일하게 `PlanEvent`로 저장되며 target을 가진다.
- POC에서는 복잡한 diff editor나 full design tool 기능을 제공하지 않는다.

Prototype mapping 요구사항:

- prototype은 독립 컨텐츠가 아니라 plan revision에 속한 artifact다.
- prototype은 한 번에 완성된 단일 화면만 의미하지 않는다.
- prototype은 여러 component-like piece의 묶음일 수 있다.
- 각 prototype piece는 button group, panel, card, form, navigation, state view, interaction slice처럼 계획 검토에 필요한 작은 UI 단위일 수 있다.
- piece 단위로도 plan target과 연결될 수 있어야 한다.
- 모든 prototype은 최소 하나 이상의 plan target에 연결되어야 한다.
- 하나의 prototype은 여러 step, decision, plan target을 설명하거나 검증할 수 있다.
- 하나의 step 또는 decision은 여러 prototype과 연결될 수 있다.
- step detail은 연결된 prototype 목록을 표시해야 한다.
- step detail은 해당 step과 연결된 prototype piece 목록도 표시할 수 있어야 한다.
- prototype panel은 연결된 step, decision, plan target을 표시해야 한다.
- prototype feedback은 prototype target과 연결된 plan target 양쪽에서 추적 가능해야 한다.
- plan revision이 변경될 때 prototype mapping이 여전히 유효한지 확인해야 한다.
- 변경 요약은 plan 변경과 prototype 변경을 구분해 표시해야 한다.

권장 target:

```ts
type PlanTarget = {
  type:
    | 'plan'
    | 'phase'
    | 'step'
    | 'decision'
    | 'risk'
    | 'verification'
    | 'prototype'
  id?: string
}
```

### 7.4 Step Card Requirements

각 step 카드는 다음 정보를 가진다.

- step number
- title
- kind
- purpose 또는 summary
- 변경 범위
- risks
- verification
- status
- step-level feedback input
- feedback thread
- agent replies attached to feedback

예시:

```txt
Step 3. runtimeSurface 도입

목적:
role 기반 bootstrap selector를 runtimeSurface로 바꾼다.

변경 범위:
- apps/frontend/src/app/bootstrap
- apps/frontend/src/app/role
- apps/desktop URL 생성 지점

리스크:
구버전 desktop이 ?role= query를 생성하면 새 frontend에서 깨질 수 있다.

검증:
- role query 검색
- frontend 테스트
- desktop shell runtime 테스트
```

### 7.5 Feedback UX

사용자는 각 step 옆에서 피드백을 남길 수 있다.

예시 사용자 피드백:

```txt
surface라는 이름은 기존 target.surface와 충돌합니다.
runtimeSurface로 바꾸는 방향을 다시 검토해주세요.
```

에이전트 답변은 해당 피드백 아래에 붙는다.

예시 에이전트 답변:

```txt
이 피드백은 부트스트랩 surface와 콘텐츠 target.surface의 의미 충돌을 지적한 것으로 이해했습니다.
따라서 plan의 query 이름을 ?surface=가 아니라 ?runtimeSurface=로 수정하겠습니다.
```

## 8. Status Model

`PlanSession.status`는 다음 값을 가진다.

- `draft`: 세션이 생성되었고 아직 사용자 피드백이 없는 상태
- `needs_agent`: 사용자 피드백이 있고 에이전트 확인이 필요한 상태
- `agent_replied`: 에이전트가 하나 이상의 피드백에 답변한 상태
- `revision_ready`: 에이전트가 새 revision을 생성한 상태
- `approved`: 사용자가 현재 revision을 승인한 상태
- `rejected`: 사용자가 현재 계획을 거절한 상태

## 9. Data Model

```ts
type PlanSession = {
  id: string
  status:
    | 'draft'
    | 'needs_agent'
    | 'agent_replied'
    | 'revision_ready'
    | 'approved'
    | 'rejected'
  revision: number
  plan: PlanDraft
  events: PlanEvent[]
  createdAt: string
  updatedAt: string
}

type PlanDraft = {
  title: string
  goal: string
  summary?: string
  decisions: PlanDecision[]
  phases?: PlanPhase[]
  steps: PlanStep[]
  risks?: PlanRisk[]
  verification?: string[]
  prototypes?: PlanPrototype[]
}

type PlanPhase = {
  id: string
  title: string
  summary?: string
  goal?: string
  stepIds: string[]
  status?: 'open' | 'needs_revision' | 'accepted'
}

type PlanDecision = {
  id: string
  title: string
  summary: string
  rationale?: string
}

type PlanStep = {
  id: string
  phaseId?: string
  title: string
  kind: 'research' | 'decision' | 'code' | 'test' | 'checkpoint'
  summary: string
  files?: string[]
  risks?: string[]
  constraints?: string[]
  verification?: string[]
  status?: 'open' | 'needs_revision' | 'accepted'
}

type PlanRisk = {
  id: string
  title: string
  severity: 'low' | 'medium' | 'high'
  description: string
  mitigation?: string
}

type PlanPrototype = {
  id: string
  revision: number
  title: string
  summary?: string
  kind: 'wireframe' | 'mockup' | 'flow' | 'interaction'
  links: PrototypeLink[]
  pieces: PrototypePiece[]
  codeRef?: PrototypeCodeRef
  state: Record<string, unknown>
  notes?: string[]
}

type PrototypePiece = {
  id: string
  title: string
  summary?: string
  kind:
    | 'component'
    | 'panel'
    | 'form'
    | 'card'
    | 'navigation'
    | 'state_view'
    | 'interaction_slice'
  links: PrototypeLink[]
  codeRef?: PrototypeCodeRef
  state?: Record<string, unknown>
}

type PrototypeLink = {
  target: PlanTarget
  purpose: 'explains' | 'validates' | 'alternative' | 'final_candidate'
}

type PrototypeCodeRef = {
  type: 'session_artifact'
  path: string
}

type PlanEvent =
  | UserFeedbackEvent
  | AgentReplyEvent
  | AgentRevisionEvent
  | UserApprovalEvent

type PlanTarget = {
  type:
    | 'plan'
    | 'phase'
    | 'step'
    | 'decision'
    | 'risk'
    | 'verification'
    | 'prototype'
  id?: string
}

type FeedbackDisposition =
  | 'open'
  | 'answered'
  | 'incorporated_in_revision'
  | 'rejected'
  | 'needs_user_clarification'

type UserFeedbackEvent = {
  id: string
  type: 'user.feedback'
  sessionId: string
  revision: number
  target: PlanTarget
  intent?:
    | 'revise'
    | 'simplify'
    | 'make_more_radical'
    | 'make_more_conservative'
    | 'reassess_risk'
    | 'verify_against_code'
    | 'rename'
    | 'question'
  message: string
  createdAt: string
}

type AgentReplyEvent = {
  id: string
  type: 'agent.reply'
  sessionId: string
  revision: number
  replyToEventId: string
  target: PlanTarget
  body: string
  disposition?: FeedbackDisposition
  createdAt: string
}

type AgentRevisionEvent = {
  id: string
  type: 'agent.revision'
  sessionId: string
  fromRevision: number
  toRevision: number
  changeSummary: string[]
  prototypeChanges?: PrototypeChangeSummary[]
  createdAt: string
}

type PrototypeChangeSummary = {
  prototypeId: string
  pieceId?: string
  changeSummary: string[]
  linkedTargets: PlanTarget[]
}

type UserApprovalEvent = {
  id: string
  type: 'user.approval'
  sessionId: string
  revision: number
  message?: string
  createdAt: string
}
```

## 10. Feedback Handling

피드백은 항상 target을 가진다.

지원 target:

- `plan`: 전체 플랜
- `phase`: 선택적 phase
- `step`: 특정 step
- `decision`: 특정 decision
- `risk`: 특정 risk
- `verification`: 검증 항목
- `prototype`: prototype playground의 특정 프로토타입

에이전트 답변은 `replyToEventId`로 사용자 피드백에 연결된다.

피드백 처리 상태는 `AgentReplyEvent.disposition`으로 표현한다. UI는 이를 사용해 피드백이 답변되었는지, revision에 반영되었는지, 거절되었는지, 추가 확인이 필요한지를 표시한다.

Prototype feedback은 두 방향에서 추적 가능해야 한다.

- prototype thread: 특정 prototype에 직접 남긴 피드백
- linked plan target thread: 해당 prototype이 연결된 step, decision, plan target에서 함께 보이는 피드백

에이전트가 prototype feedback을 반영해 plan을 수정하면 `AgentRevisionEvent.prototypeChanges`에 어떤 prototype이 어떤 target과 연결되어 변경되었는지 기록한다.

## 11. MCP Tools

MCP는 push 이벤트 시스템이 아니라, 에이전트가 세션을 만들고 조회하고 기록하는 인터페이스다.

MCP tool은 별도 MCP 전용 서버 프로세스에서 제공하지 않는다. POC에서는 하나의 서버가 MCP endpoint와 web endpoint를 함께 제공한다. 같은 in-memory store 또는 persistence layer를 공유해야 하며, MCP tool로 plan JSON이 변경되면 웹 UI는 동일 세션의 최신 데이터를 즉시 조회할 수 있어야 한다.

### 11.1 Server Architecture

POC 서버는 단일 프로세스로 구성한다.

```txt
Single Server
  MCP endpoints
    create_plan_session
    get_plan_session
    list_plan_events
    post_agent_reply
    update_plan_revision
    mark_plan_approved

  Web endpoints
    session page
    session JSON API
    feedback API
    approval API
    prototype playground API

  Shared session store
    PlanSession by sessionId
    latest PlanDraft by sessionId
    append-only PlanEvent list by sessionId
```

핵심 원칙:

- 서버는 `sessionId`를 모든 plan, event, prototype state의 격리 경계로 사용한다.
- 브라우저 URL은 특정 `sessionId`를 포함한다.
- 웹 UI는 로컬에 오래된 plan을 canonical state로 들고 있지 않는다.
- plan JSON이 MCP tool이나 web API를 통해 변경되면, 다음 웹 조회는 항상 최신 revision을 반환한다.
- plan JSON이 MCP tool이나 web API를 통해 변경되면, 열려 있는 브라우저 UI와 playground는 즉시 최신 상태를 반영해야 한다.
- 즉시 반영은 Server-Sent Events, WebSocket, long polling, 짧은 주기 polling 중 하나로 구현할 수 있다.
- 에이전트 자동 wake-up과 멀티유저 협업용 push는 구현하지 않는다.

Prototype playground runtime:

- 서버는 session-scoped prototype code/state를 저장하고 제공한다.
- 웹 클라이언트는 React runtime에서 prototype code를 렌더링한다.
- prototype code는 지정된 design system import와 design token 사용을 전제로 한다.
- prototype code가 변경되면 서버 저장소와 preview runtime이 같은 session/revision 기준으로 갱신되어야 한다.
- preview runtime은 code 변경을 즉시 반영해야 하며, 사용자가 수동 새로고침을 하지 않아야 한다.

### 11.2 create_plan_session

```ts
create_plan_session(input: {
  plan: PlanDraft
}): {
  sessionId: string
  url: string
  revision: number
}
```

플랜 초안을 세션으로 만들고 브라우저 URL을 반환한다.

### 11.3 get_plan_session

```ts
get_plan_session(input: {
  sessionId: string
}): PlanSession
```

현재 세션 상태, 최신 플랜, 이벤트 목록을 조회한다.

### 11.4 list_plan_events

```ts
list_plan_events(input: {
  sessionId: string
  afterEventId?: string
}): {
  events: PlanEvent[]
}
```

특정 시점 이후의 사용자 피드백과 에이전트 이벤트를 조회한다.

### 11.5 post_agent_reply

```ts
post_agent_reply(input: {
  sessionId: string
  revision: number
  replyToEventId: string
  target: PlanTarget
  body: string
  disposition?: FeedbackDisposition
}): AgentReplyEvent
```

사용자 피드백에 대한 에이전트 답변을 해당 위치에 기록한다.

### 11.6 update_plan_revision

```ts
update_plan_revision(input: {
  sessionId: string
  baseRevision: number
  plan: PlanDraft
  changeSummary: string[]
}): PlanSession
```

수정된 플랜 revision을 저장한다.

### 11.7 mark_plan_approved

```ts
mark_plan_approved(input: {
  sessionId: string
  revision: number
  message?: string
}): PlanSession
```

사용자가 플랜을 승인했음을 기록한다.

## 12. CLI

CLI는 에이전트를 자동으로 깨우는 시스템이 아니다. POC에서는 사용자가 브라우저에서 작업을 마친 뒤 "이 세션에 확인할 피드백이 있다"는 신호를 남기는 용도다.

```bash
planctl notify plan_123
```

이 명령은 서버의 세션 상태를 `needs_agent`로 바꾼다.

응답 예시:

```json
{
  "sessionId": "plan_123",
  "status": "needs_agent",
  "notifiedAt": "2026-05-19T10:20:00Z"
}
```

이후 사용자가 대화에서 "확인해보세요"라고 하면 에이전트는 MCP tool로 해당 세션을 조회한다.

## 13. Revision Behavior

- revision은 항상 전체 `PlanDraft` 단위로 저장한다.
- phase 또는 step만 부분 revision으로 저장하지 않는다.
- prototype은 해당 plan revision에 속한 artifact로 취급한다.
- prototype이 변경되면 관련 plan revision과 연결 target을 함께 추적한다.
- `AgentRevisionEvent`는 `fromRevision`, `toRevision`, `changeSummary`, 선택적 `prototypeChanges`를 가진다.
- UI는 현재 revision과 최신 변경 요약을 명확히 표시한다.
- UI는 plan 변경 요약과 prototype 변경 요약을 구분해서 표시한다.
- 이전 revision의 사용자 피드백은 원본 revision 번호를 유지한다.
- 새 revision에 반영된 피드백은 `AgentReplyEvent.disposition = 'incorporated_in_revision'`으로 표시할 수 있다.

## 14. Approval Behavior

사용자는 현재 revision을 승인할 수 있다.

승인 시:

- `UserApprovalEvent`가 생성된다.
- 세션 상태가 `approved`로 변경된다.
- UI는 승인된 revision 번호를 표시한다.

승인은 POC에서 전체 플랜 단위로만 제공한다. step별 승인이나 phase별 승인은 제공하지 않는다.

## 15. POC Scope

포함:

- 플랜 세션 생성
- 브라우저에서 플랜 표시
- optional phase grouping
- 단계별 피드백 작성
- 전체 플랜 피드백 작성
- 이벤트 저장
- CLI notify
- 에이전트의 MCP 조회
- 에이전트 답변 기록
- 플랜 revision 갱신
- 브라우저에서 답변과 변경 요약 표시
- 플랜 승인
- 단일 서버에서 MCP endpoint와 web endpoint 제공
- 세션별 최신 plan JSON 렌더링
- UX 관련 step/decision에 연결되는 prototype playground
- repository 내부 fixture project를 대상으로 한 실제 plan/prototype/revision/approval 시나리오 검증

제외:

- MCP server push 기반 자동 wake-up
- 실시간 멀티유저 협업
- 권한/인증 고도화
- 코드 실행/테스트/커밋까지의 전체 작업 루프
- 복잡한 diff editor
- phase 중심의 고도화된 프로젝트 관리 기능
- production design tool 수준의 prototype editor
- fixture project를 실제 제품 수준의 완성 앱으로 만드는 작업

## 16. Success Criteria

POC는 다음 조건을 만족하면 성공으로 본다.

상세 완료 조건, 사용자 시나리오, E2E 검증 방법은 `acceptance.md`를 따른다.

- 에이전트가 플랜 초안을 세션으로 만들고 URL을 받을 수 있다.
- 사용자가 브라우저에서 플랜의 목표, 상태, revision, step, decision을 이해할 수 있다.
- 사용자가 전체 플랜 또는 특정 step에 피드백을 남길 수 있다.
- 서버가 피드백을 target이 있는 이벤트로 저장한다.
- `planctl notify`가 세션 상태를 `needs_agent`로 바꾼다.
- 에이전트가 MCP tool로 최신 피드백을 조회할 수 있다.
- 에이전트가 피드백별 답변을 기록할 수 있다.
- 에이전트가 새 revision과 변경 요약을 기록할 수 있다.
- 브라우저 UI가 피드백, 에이전트 답변, 변경 요약, revision을 연결해서 보여준다.
- prototype이 연결된 step/decision과 양방향으로 매핑되어 표시된다.
- prototype 변경이 plan revision과 change summary에서 추적된다.
- 사용자가 현재 revision을 승인할 수 있다.

## 17. Implementation Notes

- 서버는 단일 프로세스로 MCP server role과 web server role을 모두 책임진다.
- 이벤트 저장소는 append-only에 가깝게 설계한다.
- plan JSON과 event list는 `sessionId` 기준으로 분리해서 저장한다.
- 웹 UI는 session API를 통해 최신 `PlanSession`을 조회하고, 오래된 local snapshot을 canonical source로 사용하지 않는다.
- plan JSON 변경 이후 웹 화면과 playground의 최신성은 즉시 반영되어야 한다.
- playground는 React 기반 preview runtime을 가져야 하며, 동적 prototype code 변경을 즉시 렌더링해야 한다.
- playground prototype은 지정된 design system 컴포넌트와 토큰을 사용해야 한다.
- 동적 code execution은 session boundary를 지켜야 하며, 다른 session의 plan/prototype state를 읽거나 변경할 수 없어야 한다.
- `PlanDraft.steps`는 flat array로 유지한다.
- `PlanPhase.stepIds`와 `PlanStep.phaseId`는 grouping을 위한 보조 정보로 사용한다.
- `PlanDraft.prototypes`는 UX 검토용 playground state를 저장하는 선택 필드로 둔다.
- UI는 step 중심으로 설계하고 phase는 접기/펼치기 가능한 section으로 표현한다.
- feedback thread는 target 기준으로 묶어서 보여준다.
- activity timeline은 전체 이벤트를 시간순으로 보여준다.
- 자동 wake-up은 구현하지 않는다. 사용자의 대화 지시와 MCP 조회를 수동 루프로 검증한다.
- 구체 기술 스택과 서버 구조는 `architecture.md`에서 관리한다.

## 18. Open Questions

- `UserFeedbackEvent` 자체에 처리 상태를 저장할지, `AgentReplyEvent.disposition`으로만 파생할지 결정이 필요하다.
- `verification` target의 세부 id를 문자열로 둘지 별도 `PlanVerification` 모델을 둘지 결정이 필요하다.
- prototype state를 서버의 plan JSON 안에 저장할지, 별도 session-scoped artifact로 저장하고 plan에서 참조할지 결정이 필요하다.
- rejected 상태를 사용자가 직접 선택할 수 있게 할지, 승인하지 않고 종료하는 상태로만 둘지 결정이 필요하다.
- POC에서 revision history를 얼마나 상세히 보여줄지 결정이 필요하다.
