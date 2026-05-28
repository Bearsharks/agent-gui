# Graph-Based Plan Overview

## Purpose

Graph-based plan은 현재의 선형 `Plan -> Phase -> Step` 리뷰 모델을 확장해, 복잡한 작업 계획을 노드와 엣지로 표현하는 최종 목표 모델이다.

목표는 작업 실행 엔진을 만드는 것이 아니다. 목표는 에이전트가 만든 계획을 사용자가 더 정확히 읽고, 특정 판단 지점에 피드백을 남기고, 에이전트가 그 피드백을 구조화된 revision으로 반영할 수 있게 하는 것이다.

## Why Graphs

현재 POC의 `step` 목록은 단순한 계획에는 충분하지만, 실제 작업에서는 다음 구조가 자주 나타난다.

- 여러 작업이 병렬로 진행된다.
- 특정 검증 결과에 따라 다음 경로가 달라진다.
- 하위 계획이 별도 그래프로 접혀 있어야 전체 계획이 읽힌다.
- 하나의 artifact, prototype, runtime output이 여러 판단 지점에 연결된다.
- 사용자의 피드백이 "Step 4 전체"가 아니라 특정 evidence, risk, verification, artifact range에 붙어야 한다.

그래프 모델은 이 관계를 plan JSON 안에 명시한다. UI는 이 그래프를 그대로 노출하되, 사용자가 모든 JSON 구조를 이해하지 않아도 판단할 수 있는 리뷰 화면으로 렌더링해야 한다.

## Core Model

기준 모델은 `packages/plan-schema/src/graphPlan.ts`의 V9 스키마와 semantic validator를 따른다.

핵심 단위:

- `GraphPlanDocument`: 전체 그래프 플랜 문서. revision, root graph, graphs, runtime state를 가진다.
- `Graph`: 특정 범위의 계획 그래프. 노드, 엣지, 그래프 입출력 contract, layout, owner 정보를 가진다.
- `Node`: 작업, 결정, 검증, 리뷰, 산출물, 메모 같은 판단 단위.
- `Block`: 노드 안의 내용 단위. task, checklist, criteria, evidence, risk, verification, artifact, graph_ref 등을 표현한다.
- `Edge`: 노드 간 흐름. 조건부 분기와 의존 관계를 표현한다.
- `RuntimeState`: 계획 정의와 분리된 실행/검증 상태. 현재 위치, output binding, event log를 가진다.
- `Target`: 피드백과 revision이 붙는 위치. plan, graph, node, block, edge, prototype piece, artifact range를 가리킨다.

중요한 원칙은 plan definition과 runtime state를 분리하는 것이다. 계획의 구조가 바뀌는 revision과, 실행 중 관찰된 상태나 output은 같은 세션에 속하지만 서로 다른 책임을 가진다.

## Review Loop

기본 사용자 루프:

1. 에이전트가 graph plan draft를 만든다.
2. 서버가 graph plan session을 만들고 review URL을 반환한다.
3. 사용자는 브라우저에서 graph overview, node detail, block content, prototype을 검토한다.
4. 사용자는 plan, graph, node, block, edge, prototype piece, artifact range에 피드백을 남긴다.
5. 에이전트는 MCP tool로 feedback event를 읽는다.
6. 에이전트는 답변을 남기거나 graph plan revision을 만든다.
7. validator가 dangling reference, binding mismatch, graph contract 위반, runtime/output 불일치를 검사한다.
8. 브라우저는 새 revision, change summary, target thread, runtime state를 반영한다.
9. 사용자는 현재 revision을 승인한다.

## Product Shape

Review UI는 그래프를 "그림판"으로만 보여주면 안 된다. 긴 계획을 판단하기 쉬운 작업대여야 한다.

필수 화면:

- graph overview: root graph, subgraph, branch, checkpoint를 빠르게 파악한다.
- node list/detail: 선택한 노드의 목적, 블록, 입출력, 위험, 검증을 본다.
- edge/branch view: 왜 다음 노드로 이어지는지, 어떤 조건이 있는지 본다.
- feedback thread: target별 피드백과 agent reply를 추적한다.
- revision summary: graph 구조 변경과 content 변경을 구분한다.
- runtime panel: 현재 실행 상태, output binding, validator issue를 본다.
- prototype panel: UX 판단이 필요한 노드와 prototype piece를 연결한다.

## MVP Boundary

MVP에 포함한다:

- V9 graph plan schema를 session payload로 저장하고 조회한다.
- 기존 선형 plan session과 호환되는 migration 또는 adapter를 둔다.
- graph/node/block/edge target feedback을 저장한다.
- revision update에서 graph plan 전체를 갱신하되, target을 함께 기록한다.
- validator 결과를 UI와 MCP 응답에서 확인할 수 있게 한다.
- root graph와 subgraph를 읽기 쉬운 UI로 탐색한다.

MVP에 포함하지 않는다:

- 임의 코드 실행 workflow engine
- 복잡한 expression language
- 완전한 자동 스케줄러
- PM tool 수준의 작업 배정/마감일 관리
- 사용자가 직접 그래프를 자유 편집하는 full visual editor

## Success Criteria

성공 기준:

- 사용자가 긴 계획을 채팅보다 빠르게 이해한다.
- 피드백 target이 plan 전체 설명 없이도 명확하다.
- 에이전트가 feedback event만 보고 수정 범위를 판단할 수 있다.
- revision마다 graph 구조 변경과 내용 변경이 구분된다.
- validator가 잘못된 reference, output binding, runtime 상태를 조기에 잡는다.
- prototype과 artifact range가 실제 판단 위치에 연결된다.
