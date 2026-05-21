# Fractal Scenario Corpus

이 파일은 graph/block model을 검증하기 위한 줄글 시나리오 모음이다. 각 시나리오는 최소 1개 이상의 하위 graph를 요구한다. 여기서는 의도와 판단 지점을 설명할 뿐, 모델 객체로 바로 변환하지 않는다. 모델 변환은 별도 실험 루프에서 수행한다.

## 공통 검증 기준

- Root plan이 단순 step list로만 끝나지 않아야 한다.
- 최소 하나의 node가 하위 graph를 포함하거나 참조해야 한다.
- Feedback target이 plan, graph, node, block, block item, edge, prototype piece 중 어디에 붙어야 하는지 판단 가능해야 한다.
- 조건 분기, gate, review loop, evidence synthesis, rollback 등은 필요할 때만 등장해야 한다.
- Session event가 담당해야 하는 실제 feedback/revision history와 plan graph가 담당해야 하는 의도 구조가 구분되어야 한다.

## 1. Linear / Phase Implementation Plan

Agent GUI 팀은 기존 step 기반 plan을 graph/block plan으로 확장하려고 한다. 사용자는 전체 흐름을 `Discovery`, `Implementation`, `Verification` 세 phase로 보고 싶다. 다만 `Implementation` phase는 단순 작업 하나가 아니라 하위 계획을 가진다.

`Implementation` 하위 계획에는 schema 추가, old step plan을 graph document로 투영하는 adapter 작성, review UI에서 node/block/edge target을 보여주는 작업이 순서대로 있다. Adapter 작업은 feedback thread가 기존 step target에서 새 graph target으로 이동하면서 손실될 수 있다는 위험을 포함한다.

사용자는 root phase 순서가 맞는지, implementation 하위 계획의 작업 순서가 맞는지, adapter 위험이 충분히 드러나는지에 feedback을 남기고 싶다. Verification phase는 old fixture session과 new graph session이 모두 열리는지를 확인하는 gate 역할을 한다.

Fractal requirement: `Implementation` phase는 별도 하위 graph로 표현되어야 한다.

## 2. Prototype Review Plan

Agent는 graph target review UI의 prototype을 만들었다. 사용자는 prototype 화면에서 특정 prototype piece를 클릭했을 때, 그 piece가 어떤 graph/node/block target을 검증하는지 즉시 알 수 있어야 한다고 요구한다.

Root plan은 review 목표 설정, prototype review, acceptance checkpoint로 구성된다. Prototype review node에는 prototype 자체와 review 질문이 포함된다. 하지만 prototype interaction state는 별도 하위 graph로 설명되어야 한다. 하위 graph는 default state, piece selected state, feedback composer open state를 가진다.

사용자는 prototype piece 자체에 “target context가 부족하다”는 feedback을 남길 수도 있고, review 질문 block에 “acceptance criteria가 약하다”는 feedback을 남길 수도 있다. Prototype 수정은 session event/revision으로 추적되어야 하며, graph는 review 의도와 target mapping만 표현한다.

Fractal requirement: prototype interaction state flow는 별도 하위 graph로 표현되어야 한다.

## 3. Decision Branching Plan

팀은 graph plan migration 전략을 선택해야 한다. 선택지는 `adapter first`, `native graph UI first`, `defer` 세 가지다. 단순히 선택지만 비교하는 것이 아니라, `adapter first`를 선택하면 별도 하위 실행 계획이 따라온다.

`adapter first` 하위 계획은 old PlanDraft를 graph document로 변환하고, 다시 현재 step UI가 읽을 수 있는 projection을 만드는 흐름을 가진다. 이 하위 계획에는 round-trip verification checkpoint가 있다. `native graph UI first`는 UI churn과 session compatibility risk가 크기 때문에 아직 후보로만 남아 있다. `defer`는 문서화만 하고 구현하지 않는 경로다.

사용자는 decision block의 선택지 설명, selected branch의 조건, adapter 하위 계획의 검증 checkpoint, rejected option rationale 각각에 feedback을 남길 수 있어야 한다.

Fractal requirement: selected branch인 `adapter first`는 별도 하위 graph로 표현되어야 한다.

## 4. Checklist / Gate Plan

graph schema release는 readiness gate를 통과해야 한다. Root plan은 prepare release, readiness gate, release execution으로 구성된다. Readiness gate는 단순 checklist block 하나가 아니라 하위 graph로 분해된다.

Readiness 하위 graph에는 schema readiness, UI readiness, event-thread readiness checkpoint가 있다. Schema readiness는 Zod schema export와 typecheck를 확인한다. UI readiness는 node/block/edge target labels가 review UI에서 보이는지 확인한다. Event-thread readiness는 review trace가 source event와 연결되는지 확인한다.

Gate가 실패하면 release execution으로 넘어가면 안 된다. 사용자는 gate 전체가 너무 엄격한지, 특정 checklist item이 불명확한지, gate outcome이 어디에 기록되는지에 feedback을 남기고 싶다.

Fractal requirement: readiness gate 내부는 별도 하위 graph로 표현되어야 한다.

## 5. Review / Revision Loop

사용자는 graph/block model 초안을 리뷰하면서 “target path가 너무 기술적이라 일반 사용자가 이해하기 어렵다”는 feedback을 남겼다. Agent는 이 feedback을 반영해 revision 2를 만들고, 어떤 node/block/edge target이 바뀌었는지 changelog로 설명해야 한다.

Root plan은 current revision review, targeted revision work, approval checkpoint로 구성된다. Targeted revision work는 하위 graph를 가진다. 하위 graph에는 target label copy 수정, prototype piece context label 수정, event timeline에서 old target과 new target을 함께 보여주는 작업이 있다.

실제 feedback thread와 approval은 session event가 canonical source다. Plan graph는 “어떤 revision work가 필요한지”와 “어떤 target이 변경되었는지”만 표현해야 한다. 사용자는 changelog entry가 원래 feedback event를 제대로 참조하는지 확인하고 싶다.

Fractal requirement: targeted revision work는 별도 하위 graph로 표현되어야 한다.

## 6. Research Fan-Out / Fan-In Plan

팀은 graph plan review UI의 첫 projection을 결정하기 위해 research를 수행한다. Root plan은 세 개의 research branch로 fan-out되고, 마지막에 synthesis node로 fan-in된다.

Branch A는 code evidence를 수집한다. 이 branch 자체가 하위 graph다. 하위 graph에서는 current schema, review-web selection state, event timeline target label rendering을 각각 조사한다. Branch B는 UX evidence를 수집한다. 사용자가 긴 plan에서 outline을 더 잘 이해하는지, canvas graph가 도움이 되는지 확인한다. Branch C는 persistence/event evidence를 수집한다. revision event와 feedback event가 이미 chronological history를 제공한다는 점을 검토한다.

Synthesis는 branch별 evidence item을 참조해 “초기 UI는 canvas-first가 아니라 outline-first + selected node detail이 적합하다”는 결론을 낸다. 사용자는 synthesis가 어떤 evidence를 근거로 결론을 냈는지 추적하고 싶다.

Fractal requirement: code evidence branch는 별도 하위 graph로 표현되어야 한다.

## 7. Option Comparison / Selection Plan

팀은 graph review UI projection을 선택해야 한다. 후보는 `outline first`, `canvas first`, `hybrid`다. 단순 선택이 아니라 criteria matrix가 필요하다. Criteria는 long plan readability, target feedback precision, implementation cost, prototype review compatibility다.

`outline first`가 추천 후보가 되지만, 이 후보 자체도 하위 계획을 가진다. 하위 계획은 graph outline panel, selected node detail panel, target thread panel을 어떤 순서로 구현할지 설명한다. `canvas first`는 시각적으로 강하지만 긴 plan에서 읽기 어려울 위험이 있다. `hybrid`는 최종 방향일 수 있지만 초기 POC에는 범위가 크다.

사용자는 comparison criterion 하나하나에 feedback을 남기거나, selected option rationale이 약하다고 지적하거나, outline-first 하위 계획의 구현 순서를 수정하고 싶다.

Fractal requirement: selected option인 `outline first`는 별도 하위 graph로 표현되어야 한다.

## 8. Debugging / Hypothesis Loop

graph target feedback이 revision 이후 잘못된 thread 아래에 보이는 버그가 있다. 사용자는 “block feedback이 node feedback으로 보인다”고 보고했다. Agent는 debugging plan을 세워야 한다.

Root debugging plan은 symptom capture, investigation, fix, regression checkpoint로 구성된다. Investigation node에는 hypotheses와 experiments가 있다. 하지만 experiment 절차는 별도 하위 graph로 표현되어야 한다. 하위 graph는 reproduce, compare target identity before/after revision, patch resolver test 순서로 진행된다.

가설은 “revision이 block ID를 바꾸지만 stableId mapping이 없다”는 것이다. 실험 결과가 refute되면 investigation은 symptom capture로 loop back해야 한다. Confirm되면 fix로 진행한다. 사용자는 hypothesis 자체, experiment 결과, loop edge 조건, regression checkpoint에 feedback을 남기고 싶다.

Fractal requirement: experiment procedure는 별도 하위 graph로 표현되어야 한다.

## 9. Migration Plan

Agent GUI는 저장된 session payload를 기존 `PlanDraft`에서 `PlanDocument`로 migration하려고 한다. Migration은 compatibility mode를 거쳐 cutover한 뒤 cleanup하는 단계로 진행된다.

Root migration plan에는 inventory, compatibility mode, cutover, cleanup checkpoint가 있다. Cutover는 위험하므로 별도 하위 graph로 표현되어야 한다. Cutover 하위 graph에는 dual read enablement, new graph session write, default writer switch가 있다. Switch 실패 시 rollback edge를 따라 dual read 상태로 돌아가야 한다.

Migration block은 fromVersion, toVersion, affected surfaces, compatibility strategy, rollback scope, rollback plan, verification gate를 명시해야 한다. 사용자는 rollback이 step scope인지 global scope인지, old sessions가 계속 읽히는지, cleanup checkpoint가 너무 이른지에 feedback을 남길 수 있어야 한다.

Fractal requirement: cutover phase는 별도 하위 graph로 표현되어야 한다.
