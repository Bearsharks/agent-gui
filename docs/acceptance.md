# Browser-Based Plan Review UI Acceptance Criteria

## 1. Purpose

이 문서는 POC 완료 조건, 구체적인 사용자 시나리오, 그리고 에이전트 브라우저 스킬을 활용한 E2E 검증 방법을 정의한다.

POC는 이 문서의 완료 조건과 E2E 검증 항목을 만족해야 완료된 것으로 본다.

## 2. Completion Criteria

### 2.1 Single Local Server

완료 조건:

- 단일 로컬 서버가 실행된다.
- MCP endpoint와 web endpoint가 같은 서버 프로세스에서 제공된다.
- review UI, session API, event stream, prototype iframe route가 같은 로컬 서버 아래에서 동작한다.

실패 조건:

- MCP 서버와 웹 서버가 별도 프로세스로만 동작한다.
- review UI와 prototype iframe이 같은 세션 저장소를 공유하지 않는다.

### 2.2 Plan Session Creation

완료 조건:

- 에이전트가 MCP tool `create_plan_session`을 호출할 수 있다.
- 서버가 `sessionId`, `url`, `revision`을 반환한다.
- 반환된 URL을 브라우저에서 열면 해당 세션의 plan이 표시된다.

실패 조건:

- URL은 열리지만 세션 plan이 표시되지 않는다.
- revision이 표시되지 않는다.
- 세션 URL이 특정 `sessionId`에 연결되지 않는다.

### 2.3 Session Isolation

완료 조건:

- `plan_A`, `plan_B`가 서로 다른 plan, event, prototype state를 가진다.
- 한 세션의 피드백, revision, prototype 변경이 다른 세션 화면에 섞이지 않는다.

실패 조건:

- 세션 A의 event가 세션 B 화면에 보인다.
- 세션 A의 prototype state가 세션 B iframe에 보인다.
- API나 MCP 조회에서 `sessionId` 경계가 깨진다.

### 2.4 Immediate Plan Updates

완료 조건:

- MCP 또는 API로 plan revision이 갱신되면 열린 브라우저 UI가 최신 revision을 반영한다.
- 수동 새로고침 없이 상태, revision, 변경 요약, step 내용이 업데이트된다.

실패 조건:

- 브라우저 새로고침을 해야만 최신 revision이 보인다.
- revision 번호만 바뀌고 step/detail/change summary가 갱신되지 않는다.

### 2.5 Feedback Loop

완료 조건:

- 사용자는 전체 plan feedback을 남길 수 있다.
- 사용자는 특정 step feedback을 남길 수 있다.
- 피드백은 `user.feedback` event로 저장된다.
- 저장된 피드백은 target을 가진다.
- 에이전트는 MCP tool로 이벤트를 조회할 수 있다.
- 에이전트는 `post_agent_reply`로 해당 피드백 아래 답변을 남길 수 있다.
- 답변은 브라우저에서 원래 피드백 thread 아래에 표시된다.

실패 조건:

- feedback이 target 없이 저장된다.
- agent reply가 원래 feedback 아래에 붙지 않는다.
- step feedback과 plan feedback이 UI에서 구분되지 않는다.

### 2.6 Revision Loop

완료 조건:

- 에이전트가 `update_plan_revision`을 호출하면 revision이 증가한다.
- `update_plan_revision`은 단일 tool이지만, 선택적으로 특정 step 또는 prototype target을 지정해 수정 의도 범위를 좁힐 수 있다.
- 변경 요약이 표시된다.
- 이전 feedback event는 원래 revision 번호를 유지한다.
- 최신 plan은 새 revision 기준으로 표시된다.

실패 조건:

- revision 증가 없이 plan만 덮어쓴다.
- 작은 수정에도 target 없이 전체 plan 재작성을 강제한다.
- 변경 요약이 표시되지 않는다.
- 이전 feedback event의 revision 추적이 사라진다.

### 2.7 CLI Notify

완료 조건:

- `planctl notify plan_123`이 세션 상태를 `needs_agent`로 바꾼다.
- 브라우저 UI가 `needs_agent` 상태를 표시한다.
- 이후 에이전트가 MCP로 최신 이벤트를 조회할 수 있다.

실패 조건:

- notify 이후 세션 status가 바뀌지 않는다.
- notify 상태가 브라우저에 반영되지 않는다.

### 2.8 Prototype Playground

완료 조건:

- UX 관련 step 또는 decision에 연결된 prototype이 iframe에 표시된다.
- prototype은 사용자가 제공한 URL tabs 중 선택된 URL을 iframe에 표시한다.
- prototype은 최소 하나 이상의 plan target에 연결된다.
- prototype panel은 prototype id/title과 연결된 step, decision, plan target을 표시한다.
- prototype 내부 UI 구성은 외부 URL 웹앱이 책임지며 Plan GUI는 해석하지 않는다.
- step/detail 화면에서 연결된 prototype을 확인할 수 있다.
- prototype feedback은 prototype thread와 연결된 plan target thread 양쪽에서 추적 가능하다.
- prototype URL tab 변경이 iframe preview에 즉시 반영된다.
- prototype 변경은 plan revision과 change summary에서 추적된다.
- prototype 에러가 review UI 전체를 깨뜨리지 않고 iframe 내부에 표시된다.

실패 조건:

- prototype iframe이 렌더링되지 않는다.
- prototype이 어떤 plan target과 연결되는지 알 수 없다.
- step/detail에서 연결된 prototype을 찾을 수 없다.
- prototype feedback이 연결된 plan target에서 추적되지 않는다.
- prototype update 후 수동 새로고침이 필요하다.
- iframe 에러가 review UI 전체를 깨뜨린다.

### 2.9 Approval

완료 조건:

- 사용자가 현재 revision을 승인할 수 있다.
- `user.approval` event가 저장된다.
- 세션 상태가 `approved`로 바뀐다.
- 브라우저 UI가 승인된 revision을 표시한다.

실패 조건:

- 승인 후 status가 바뀌지 않는다.
- 어떤 revision이 승인되었는지 알 수 없다.

### 2.10 Realistic Fixture Project Scenario

완료 조건:

- 현재 repository 내부에 실제 사용 시나리오를 모사하는 별도 fixture project가 존재한다.
- fixture project는 plan review 대상이 되는 독립적인 작은 app 또는 package여야 한다.
- 에이전트는 해당 fixture project를 대상으로 실제 plan session을 생성한다.
- 에이전트는 MCP tool로 plan을 생성, 조회, 답변, revision 갱신한다.
- 사용자는 브라우저 review UI에서 fixture project plan을 검토한다.
- prototype playground는 fixture project의 UX 변경 계획과 연결된 prototype을 표시한다.
- E2E 검증은 mock-only plan이 아니라 fixture project를 대상으로 한 실제 계획 완성 시나리오를 포함한다.

MCP 등록 게이트:

- 만든 MCP server는 Codex에 등록되기 전까지 현재 에이전트 세션에서 MCP tool로 사용할 수 없을 수 있다.
- 구현자는 모든 구현을 완료한 뒤 MCP server 등록 절차를 수행해야 한다.
- 구현자는 실제 사용자 시나리오 검증을 시작하기 직전에 사용자에게 Codex 세션 재실행을 요청해야 한다.
- 세션 재실행 이후 에이전트는 실제 등록된 MCP tool을 사용해 fixture project 계획 시나리오를 검증해야 한다.

실패 조건:

- fixture project 없이 API fixture 또는 hardcoded mock만으로 완료 판정한다.
- MCP 등록 전 상태에서 MCP tool 사용 검증을 완료한 것으로 처리한다.
- 세션 재실행이 필요한데 사용자에게 명확히 요청하지 않는다.
- prototype playground가 fixture project의 실제 UX 계획과 연결되지 않는다.

## 3. User Scenarios

### 3.1 Basic Plan Review

```txt
1. 에이전트가 plan 초안을 만든다.
2. 에이전트가 create_plan_session을 호출한다.
3. 사용자가 반환된 URL을 연다.
4. 사용자는 title, goal, status, revision, decisions, steps를 확인한다.
5. 사용자는 Step 3에 이름 충돌 관련 피드백을 남긴다.
6. 사용자는 전체 plan에도 보수적 접근을 요청하는 피드백을 남긴다.
7. 사용자가 planctl notify plan_123을 실행한다.
8. 에이전트가 get_plan_session 또는 list_plan_events로 피드백을 읽는다.
9. 에이전트가 각 피드백에 reply를 남긴다.
10. 브라우저에서 피드백 아래 agent reply가 보인다.
```

완료 판정:

- step feedback과 plan feedback이 각각 올바른 target으로 저장된다.
- agent reply가 각 feedback thread 아래에 표시된다.

### 3.2 Revision Creation

```txt
1. 사용자가 Step 3의 query 이름 변경을 요청한다.
2. 에이전트가 피드백을 읽는다.
3. 에이전트가 plan을 수정해 revision 2를 생성한다.
4. changeSummary에 runtimeSurface 변경이 기록된다.
5. 브라우저 UI가 revision 2를 표시한다.
6. Step 3 내용이 새 이름 기준으로 바뀐다.
7. 기존 피드백은 revision 1의 event로 남아 있다.
```

완료 판정:

- latest plan은 revision 2 기준이다.
- event timeline에서는 revision 1 feedback과 revision 2 update를 구분할 수 있다.

### 3.3 Session Isolation

```txt
1. plan_A와 plan_B를 생성한다.
2. plan_A에 step feedback을 남긴다.
3. plan_B에는 다른 feedback을 남긴다.
4. plan_A 브라우저 화면에는 plan_A event만 보인다.
5. plan_B 브라우저 화면에는 plan_B event만 보인다.
6. prototype state도 서로 섞이지 않는다.
```

완료 판정:

- 두 세션의 title, revision, events, prototype state가 독립적으로 유지된다.

### 3.4 Prototype Playground

```txt
1. plan에 UX step과 prototype artifact가 포함된다.
2. 사용자가 해당 step을 선택한다.
3. prototype iframe이 표시된다.
4. prototype panel은 prototype id/title과 연결된 plan target을 표시한다.
5. 사용자가 URL tab을 선택한다.
6. iframe은 선택된 URL의 외부 웹앱을 렌더링한다.
7. 사용자는 prototype에 대한 피드백을 남긴다.
8. feedback target은 prototype 또는 연결된 step으로 저장된다.
9. 연결된 step detail에서도 prototype feedback을 추적할 수 있다.
10. 에이전트가 prototype feedback을 반영해 plan revision과 prototype change summary를 갱신한다.
```

완료 판정:

- iframe preview가 보인다.
- prototype URL tab 전환이 즉시 반영된다.
- prototype feedback이 event timeline과 target thread에 표시된다.
- prototype과 step/decision의 양방향 mapping이 화면에 표시된다.
- prototype 변경이 revision change summary에 표시된다.

### 3.5 Approval

```txt
1. 사용자가 최신 revision을 검토한다.
2. 사용자가 승인 버튼을 누른다.
3. 서버가 user.approval event를 저장한다.
4. 세션 status가 approved로 바뀐다.
5. 브라우저 UI가 approved 상태와 승인 revision을 표시한다.
```

완료 판정:

- 승인 event가 저장된다.
- approved status가 브라우저에 표시된다.

### 3.6 Fixture Project End-to-End Plan Completion

```txt
1. 현재 repository 내부에 fixture project를 만든다.
2. fixture project는 작은 React app 또는 UI package로 구성한다.
3. fixture project 안에 실제로 개선할 UX surface를 둔다.
4. 단일 로컬 서버와 MCP server를 구현한다.
5. MCP server를 Codex 설정에 등록한다.
6. 구현자는 사용자에게 Codex 세션 재실행을 요청한다.
7. 세션 재실행 후 에이전트는 등록된 MCP tool을 사용할 수 있는지 확인한다.
8. 에이전트는 fixture project를 읽고 작업 계획 초안을 만든다.
9. 에이전트는 create_plan_session으로 plan session을 생성한다.
10. 사용자는 브라우저에서 fixture project plan을 검토한다.
11. 사용자는 step 또는 prototype에 피드백을 남긴다.
12. 사용자는 planctl notify로 확인 요청을 남긴다.
13. 에이전트는 MCP로 feedback event를 조회한다.
14. 에이전트는 feedback에 답변하고 필요하면 plan revision을 만든다.
15. prototype playground는 수정된 prototype을 즉시 반영한다.
16. 사용자는 최신 revision을 승인한다.
```

완료 판정:

- fixture project 기반 plan session이 생성된다.
- MCP 등록과 Codex 세션 재실행 이후 실제 MCP tool 호출이 사용된다.
- fixture project의 UX prototype이 iframe에서 표시된다.
- 사용자의 feedback, agent reply, revision, approval이 하나의 session timeline으로 연결된다.

## 4. Browser-Skill E2E Verification

E2E는 에이전트가 실제 로컬 서버를 띄운 뒤, Codex in-app browser를 사용해 검증한다.

브라우저 검증에는 `browser-use` 스킬을 사용한다. 검증자는 local target인 `localhost`, `127.0.0.1`, 또는 동일한 로컬 서버 URL을 브라우저에서 직접 열고, DOM snapshot과 screenshot을 통해 실제 사용자 화면을 확인해야 한다.

### 4.1 Required E2E Flow

```txt
1. 로컬 서버를 실행한다.
2. repository 내부 fixture project가 존재하는지 확인한다.
3. 구현이 완료된 MCP server를 Codex에 등록한다.
4. 실제 사용자 시나리오 검증 시작 직전에 사용자에게 Codex 세션 재실행을 요청한다.
5. 세션 재실행 후 등록된 MCP tool을 사용할 수 있는지 확인한다.
6. fixture project를 대상으로 MCP tool로 plan session을 생성한다.
7. browser-use로 세션 URL을 연다.
8. DOM snapshot 또는 screenshot으로 주요 영역이 표시되는지 확인한다.
9. 브라우저에서 step feedback을 입력한다.
10. MCP로 event 저장을 확인한다.
11. notify를 실행하거나 notify API를 호출한다.
12. MCP로 event를 조회한다.
13. agent reply를 작성한다.
14. 브라우저에서 reply 표시를 확인한다.
15. revision update를 실행한다.
16. 브라우저에서 revision, step, change summary가 즉시 반영되는지 확인한다.
17. prototype iframe 표시를 확인한다.
18. prototype update를 실행한다.
19. iframe preview가 즉시 변경되는지 확인한다.
20. approve 버튼을 클릭한다.
21. approved 상태가 표시되는지 확인한다.
```

### 4.2 Required Visible Elements

브라우저 검증 중 다음 요소가 화면에서 확인되어야 한다.

- plan title
- plan goal
- status
- revision
- decision summary
- step list
- selected step detail
- step feedback input
- plan feedback input
- event timeline
- agent reply thread
- change summary
- approval button
- approval state
- prototype iframe
- prototype render result

### 4.3 Required Data Assertions

화면 검증과 별도로 다음 데이터를 MCP/API로 확인해야 한다.

- `PlanSession.id`가 URL의 `sessionId`와 일치한다.
- `PlanSession.revision`이 UI revision과 일치한다.
- step feedback event의 target이 `{ type: 'step', id: ... }`이다.
- plan feedback event의 target이 `{ type: 'plan' }`이다.
- prototype feedback event의 target이 `{ type: 'prototype', id: ... }`이거나 연결된 plan target과 함께 추적 가능하다.
- prototype의 `links`가 하나 이상의 valid PlanTarget을 가진다.
- prototype의 `tabs`가 URL preview 목록으로 존재한다.
- 연결된 step 또는 decision에서 해당 prototype id를 찾을 수 있다.
- agent reply의 `replyToEventId`가 원래 feedback event id와 일치한다.
- revision update 후 `AgentRevisionEvent.fromRevision`과 `toRevision`이 올바르다.
- prototype 변경이 있는 revision은 `AgentRevisionEvent.prototypeChanges` 또는 동등한 change summary를 가진다.
- approval 후 `UserApprovalEvent.revision`이 승인된 UI revision과 일치한다.
- fixture project path가 plan session metadata 또는 plan content에서 추적 가능하다.
- 실제 등록된 MCP tool 호출로 session/event/revision/prototype update가 수행되었다.

### 4.4 Immediate Update Verification

즉시 반영은 다음 방식으로 검증한다.

```txt
1. 브라우저에 세션 화면을 열어둔다.
2. MCP/API로 plan revision 또는 prototype code/state를 갱신한다.
3. 브라우저를 수동 새로고침하지 않는다.
4. UI가 제한 시간 안에 최신 상태를 반영하는지 확인한다.
```

POC 기준 제한 시간:

- plan revision update: 2초 이내
- event timeline update: 2초 이내
- prototype iframe update: 3초 이내

### 4.5 Failure Conditions

다음 중 하나라도 발생하면 E2E 실패로 본다.

- 새로고침해야만 plan revision이 보인다.
- feedback이 target 없이 저장된다.
- agent reply가 원래 feedback 아래에 붙지 않는다.
- 세션 A의 event가 세션 B에 보인다.
- prototype iframe 에러가 review UI 전체를 깨뜨린다.
- prototype이 design system 없이 임의 스타일로만 렌더링된다.
- prototype과 plan target의 mapping이 없거나 UI에서 확인되지 않는다.
- prototype과 plan target의 mapping이 없거나 UI에서 확인되지 않는다.
- prototype 변경이 revision/change summary에 추적되지 않는다.
- approval 후 status 또는 revision 표시가 불명확하다.
- browser-use로 실제 화면 상태를 확인하지 않았다.
- fixture project 없이 synthetic-only scenario로 E2E를 끝낸다.
- MCP server 등록과 Codex 세션 재실행을 거치지 않고 MCP tool 검증을 완료 처리한다.

## 5. Completion Rule

작업은 다음 조건을 모두 만족해야 완료로 선언할 수 있다.

- 모든 completion criteria가 통과한다.
- 모든 required user scenario가 통과한다.
- browser-skill E2E verification이 통과한다.
- 실패 조건에 해당하는 문제가 남아 있지 않다.
- 구현상 제외한 항목이 있다면 POC scope 또는 open question으로 명시되어 있다.
