# Graph-Based Plan Todo

## Current Baseline

- [x] V9 graph plan model baseline 정리
- [x] `GraphPlanDocument`, graph, node, block, edge, runtime state 스키마 추가
- [x] semantic validator와 adversarial fixtures 추가
- [x] 반복 실험 결과를 research report로 정리
- [ ] graph plan을 실제 Plan GUI session payload로 연결

## Decisions

- V9 스키마를 graph plan의 기준 모델로 둔다.
- plan definition과 runtime state를 분리한다.
- feedback target은 graph, node, block, edge, prototype piece, artifact range까지 확장한다.
- condition은 당장 자유식 DSL로 만들지 않고 구조화된 discriminated union으로 유지한다.
- 에이전트가 raw JSON을 직접 조립하지 않도록 authoring helper를 제공한다.

## 1. Schema And Validation

- [ ] `packages/plan-schema`에서 graph plan 타입 export를 정리한다.
- [ ] 기존 `PlanDraft`와 `GraphPlanDocument`의 공존 방식을 결정한다.
- [ ] 선형 plan을 root graph로 변환하는 adapter를 추가한다.
- [ ] publish-ready validator 모드를 추가한다.
- [ ] dangling graph/node/block/edge/prototype/artifact reference를 모두 validator issue로 표준화한다.
- [ ] output binding target slot, runtime event, artifact range path/ref mismatch 검사를 UI가 소비하기 쉬운 issue code로 정리한다.
- [ ] validator fixture를 positive/adversarial/regression 그룹으로 나눈다.

## 2. Server And MCP

- [ ] `create_plan_session`이 graph plan payload를 받을 수 있게 한다.
- [ ] `get_plan_session` 응답에 graph plan과 validator summary를 포함한다.
- [ ] `update_plan_revision`이 graph target을 받을 수 있게 한다.
- [ ] `post_agent_reply`가 graph/node/block/edge target thread에 붙도록 target resolver를 확장한다.
- [ ] `mark_plan_approved`가 승인한 graph plan revision을 명확히 기록한다.
- [ ] event store에 graph plan runtime event와 user feedback event를 구분해서 저장한다.
- [ ] file-backed store에서 graph plan payload 크기와 revision history 저장 방식을 점검한다.

## 3. Review UI

- [ ] graph overview 화면을 추가한다.
- [ ] root graph, subgraph, selected node를 URL state 또는 local UI state로 추적한다.
- [ ] node detail 패널에서 block list, input/output, risks, verification을 렌더링한다.
- [ ] edge와 branch condition을 사람이 읽을 수 있는 라벨로 표시한다.
- [ ] target breadcrumb를 plan/graph/node/block/prototype/artifact range 기준으로 표시한다.
- [ ] graph target feedback composer를 추가한다.
- [ ] activity timeline에서 graph target, revision, disposition을 표시한다.
- [ ] revision summary에서 structure change와 content change를 구분한다.
- [ ] runtime panel에서 current node, emitted output, validator issue를 표시한다.
- [ ] prototype panel이 graph node/block target과 prototype piece를 함께 보여주게 한다.

## 4. Authoring Helpers

- [ ] graph, node, block, edge id 생성 규칙을 helper로 고정한다.
- [ ] `defineGraphPlan` helper를 추가한다.
- [ ] `addNode`, `addEdge`, `addGraphRef` helper를 추가한다.
- [ ] graph input/output contract를 선언하고 binding하는 helper를 추가한다.
- [ ] artifact range target을 안전하게 만드는 helper를 추가한다.
- [ ] authoring helper가 validator를 자동 실행하는 테스트 유틸을 제공한다.
- [ ] fixture plan 작성자가 raw object shape를 외우지 않아도 되게 예제를 추가한다.

## 5. Fixtures And Tests

- [ ] graph plan positive fixture를 최소 3개 만든다.
- [ ] adversarial fixture 20개 이상을 regression test에 연결한다.
- [ ] 선형 plan session과 graph plan session이 같은 서버에서 공존하는지 테스트한다.
- [ ] graph feedback, agent reply, targeted revision update E2E를 추가한다.
- [ ] session A/B isolation을 graph plan payload로 재검증한다.
- [ ] prototype piece feedback이 graph target thread와 함께 추적되는지 검증한다.
- [ ] validator issue가 MCP 응답과 브라우저 UI에 같은 의미로 노출되는지 검증한다.

## 6. Documentation

- [ ] `docs/prd.md`에 graph plan product direction을 반영한다.
- [ ] `docs/architecture.md`에 graph plan session payload, validator, target resolver 경계를 추가한다.
- [ ] `docs/acceptance.md`에 graph plan E2E 완료 조건을 추가한다.
- [ ] `docs/planGUIMCPguide.md`에 graph target feedback/revision 예시를 추가한다.
- [ ] graph plan authoring example을 추가한다.
- [ ] Agent guidance에 graph plan을 언제 쓰고 언제 선형 plan으로 충분한지 적는다.

## Milestones

### M1. Schema Integrated

- graph plan 타입이 public export로 정리된다.
- validator가 publish-ready issue를 안정적으로 반환한다.
- 선형 plan adapter 방향이 결정된다.

### M2. Graph Session API

- MCP와 HTTP API가 graph plan session을 생성, 조회, 수정한다.
- graph target feedback과 agent reply가 event store에 저장된다.
- 기존 선형 POC 세션이 깨지지 않는다.

### M3. Read-Only Graph Review UI

- 사용자가 root graph와 node detail을 탐색할 수 있다.
- block, edge, condition, target breadcrumb가 읽히는 형태로 표시된다.
- validator summary가 화면에 보인다.

### M4. Feedback And Revision Loop

- 사용자가 graph target에 피드백을 남긴다.
- 에이전트가 MCP event만 보고 답변 또는 revision을 만든다.
- 브라우저가 targeted change summary와 thread를 반영한다.

### M5. Production-Ready POC Decision

- fixture project로 graph plan E2E를 검증한다.
- 채팅-only 계획 리뷰와 Graph Plan GUI 리뷰를 비교한다.
- 계속 투자할 UI/API 범위와 버릴 범위를 결정한다.

## Immediate Next Tasks

1. `packages/plan-schema/src/index.ts`에서 graph plan exports를 확인한다.
2. graph plan validator issue code를 UI 표시용으로 정리한다.
3. `PlanTarget` 타입에 graph/node/block/edge/artifact range target을 추가한다.
4. `create_plan_session` 입력 스키마에 graph plan payload를 추가한다.
5. graph plan fixture session 생성 route를 만든다.
6. Review UI에 read-only graph overview를 붙인다.
7. selected graph/node state를 URL 또는 route param으로 설계한다.
8. graph target feedback 저장 API를 확장한다.
9. MCP `list_plan_events` 출력에서 graph target breadcrumb를 확인한다.
10. graph plan E2E acceptance scenario를 `docs/acceptance.md`에 편입한다.
