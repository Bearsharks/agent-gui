# Graph Review UI Design

## 목적

Graph Review UI의 목적은 agent가 만든 `GraphPlanDocument`를 사용자가 채팅보다 정확히 읽고, 특정 graph target에 피드백을 남기고, revision 결과를 검토할 수 있게 하는 것이다.

UI는 graph visual editor가 아니다. MVP는 read-only graph review workspace다.

## 설계 원칙

1. Step list/detail UI는 제거한다.
2. 화면의 중심 단위는 graph, node, block, edge다.
3. 사용자는 항상 현재 선택한 target을 알 수 있어야 한다.
4. 피드백 composer는 `GraphPlanTarget`을 만든다.
5. validation issue는 graph element에 연결되어야 한다.
6. prototype은 top-level 객체가 아니라 graph `prototype` block과 `prototype_piece` target으로 표시한다.
7. revision summary는 구조 변경과 내용 변경을 구분한다.
8. UI는 plan을 편집하지 않는다. 수정은 MCP/API mutation을 통해 들어온다.

## 화면 구조

권장 layout:

```txt
Header
  title / goal / status / revision / validation summary

Left Panel
  graph selector
  node list
  subgraph navigation

Center Panel
  graph overview
  selected node detail
  block renderer
  edge and condition summary

Right Panel
  target breadcrumb
  feedback composer
  target thread
  validation panel
  prototype piece panel

Bottom or Secondary Panel
  event timeline
  revision summary
```

## Fractal Graph Navigation UX

Graph Review UI의 탐색 경험은 단순한 flat graph visualization이 아니라, 프랙탈 그래프 구조를 단계적으로 읽는 drilldown workspace여야 한다.

사용자는 root graph에서 전체 plan의 큰 구조를 보고, 복잡한 node나 `graph_ref` block을 선택해 child graph로 내려간다. child graph 안에서도 동일하게 node, block, edge, prototype piece를 검토하고 피드백을 남길 수 있어야 한다.

핵심 원칙:

1. 현재 scope를 명확히 보여준다.
   - 사용자는 자신이 root graph를 보는지, 특정 node의 child graph를 보는지 항상 알아야 한다.
   - breadcrumb는 plan, graph, node, block, prototype piece까지 이어지는 위치를 표시한다.

2. drilldown은 graph scope 전환이다.
   - 화면 확대/축소로 모든 node를 한 canvas에 밀어 넣지 않는다.
   - drilldown 시 current graph가 child graph로 바뀌고, center panel은 그 graph 안의 node/edge만 보여준다.

3. parent context를 유지한다.
   - child graph에 들어가도 parent graph, parent node, entry block 또는 edge condition을 잃지 않게 한다.
   - parent context summary는 right panel 또는 center 상단에 compact하게 표시한다.

4. drillup은 이전 entry point를 보존한다.
   - 상위 graph로 돌아가면 사용자가 들어갔던 node나 `graph_ref` block을 강조한다.

5. feedback target은 current scope와 selected element에서 자동 결정한다.
   - 사용자가 raw target JSON을 직접 고르지 않게 한다.
   - node, block, edge, prototype piece 선택이 composer target을 바꾼다.

권장 탐색 요소:

- graph breadcrumb
- graph tree 또는 subgraph navigator
- current graph title/goal/contract summary
- parent context summary
- drillable node badge
- `graph_ref` block의 child graph 진입 action
- selected target breadcrumb
- validation issue에서 해당 graph scope로 이동하는 jump action

권장 URL state:

```txt
?graph=g-root
?graph=g-root&node=n-review
?graph=g-root&node=n-review&block=b-risk
?graph=g-child&node=n-verify&edge=e-verify-to-fix
?graph=g-child&node=n-ux&block=b-prototype&piece=piece-sidebar
```

URL state는 공유 가능한 review location이어야 한다. 없는 id가 들어오면 root graph의 첫 node 또는 graph target으로 안전하게 fallback한다.

## 주요 컴포넌트

### `GraphOverview`

root graph와 선택 graph의 node/edge 관계를 읽기 쉽게 보여준다.

MVP에서는 복잡한 canvas editor가 아니라 다음 정보 중심으로 시작한다.

- graph title
- node count
- edge count
- node cards
- incoming/outgoing edge labels
- branch condition summary
- validation issue badge
- drillable node badge
- child graph entry point

### `GraphNodeList`

현재 graph의 node 목록을 보여준다.

표시 정보:

- node title
- node kind
- status
- block count
- issue count
- selected state
- drillable state

### `NodeDetail`

선택한 node의 상세 내용을 보여준다.

표시 정보:

- node title
- node kind/status
- node summary
- input/output contract 요약
- linked targets
- blocks
- owned subgraphs
- incoming/outgoing edge summary
- validation issue badge

### `BlockRenderer`

block type별 read-only renderer다.

MVP에서 우선 지원할 block:

- `text`
- `task_list`
- `checklist`
- `criteria`
- `risk`
- `verification`
- `artifact`
- `prototype`
- `graph_ref`
- `choice_set`
- `changelog`

알 수 없는 block type은 fallback renderer로 JSON summary를 표시한다.

공통 block shell:

- title
- block type
- status
- issue badge
- selected state
- feedback target action

Block renderer는 block 전체 target과 block item target을 구분해야 한다. 예를 들어 risk 목록에서 특정 risk row를 선택하면 block target이 아니라 `block_item` target을 만들 수 있어야 한다.

Type별 렌더링:

- `text`: 제목, 요약, 본문을 문서형으로 표시한다. 긴 본문은 disclosure로 접는다.
- `task_list`: task별 row, status, dependency, issue badge를 표시한다.
- `checklist`: read-only checklist로 pass/fail/unknown 상태와 미충족 이유를 표시한다.
- `criteria`: criterion별 충족 조건과 검증 방법을 함께 표시한다.
- `risk`: severity, likelihood, mitigation을 표 형태로 표시하고 risk item target을 지원한다.
- `verification`: command, expected result, actual result, status를 분리해서 표시한다.
- `artifact`: artifact title/path/type을 표시하고 가능한 경우 `artifact_range` feedback으로 이어지게 한다.
- `prototype`: preview url 또는 piece list를 표시하고 piece 선택 시 `prototype_piece` target을 만든다.
- `graph_ref`: child graph drilldown entry로 표시한다.
- `choice_set`: option, condition, downstream edge를 표시해 branch 판단을 돕는다.
- `changelog`: structure/content/validation change를 그룹으로 표시한다.

### `GraphTargetBreadcrumb`

현재 선택 또는 feedback 대상 target을 사람이 읽을 수 있게 표시한다.

예:

```txt
Root Graph / Review API Node / Risk Block
Root Graph / Review API Node / Prototype Block / Sidebar Piece
Root Graph / Edge: review -> verify
```

### `GraphFeedbackCenter`

선택 target에 피드백을 남긴다.

지원 target:

- `plan`
- `graph`
- `node`
- `block`
- `block_item`
- `edge`
- `prototype_piece`
- `artifact_range`

MVP에서는 자동 target 선택을 우선한다.

- node 선택 시 node target
- block 선택 시 block target
- prototype piece 선택 시 prototype_piece target
- issue 선택 시 issue target 또는 pointer 기반 target

### `ValidationPanel`

validation summary와 issue list를 표시한다.

표시 기준:

- error/warning count
- publishReady
- category group
- target breadcrumb
- issue message

issue 클릭 시 가능한 경우 해당 graph/node/block/edge를 선택한다.

### `GraphPrototypePanel`

graph `prototype` block과 piece를 표시한다.

표시 정보:

- prototype block title
- tabs 또는 preview URL
- piece list
- primary target
- validates targets
- selected piece state

piece 선택 시 `prototype_piece` target이 feedback composer에 연결된다.

### `EventTimeline`

graph target 기반 event history를 표시한다.

표시 대상:

- user feedback
- agent reply
- agent revision
- user approval

각 event는 target breadcrumb와 revision을 함께 표시한다.

### `RevisionSummary`

revision event의 change summary를 표시한다.

구분:

- structure changes
- content changes
- validation changes

## URL State

선택 상태는 URL에 반영한다.

권장 query:

```txt
?graph=g-root&node=n-review&block=b-risk
```

prototype piece:

```txt
?graph=g-root&node=n-review&block=b-prototype&piece=piece-sidebar
```

이렇게 하면 사용자가 특정 판단 지점을 공유하거나 다시 열 수 있다.

## Validation UI 동작

validation issue가 `target`을 가지면 해당 element에 badge를 표시한다.

target이 없는 issue는 panel에만 표시한다.

category별 기본 표시:

- `identity`: header 또는 graph overview
- `reference`: 관련 node/block 또는 validation panel
- `target`: target breadcrumb와 thread 주변
- `graph_contract`: graph_ref block 또는 subgraph panel
- `condition`: edge/choice_set 주변
- `runtime`: runtime panel
- `artifact`: artifact block
- `revision_lineage`: revision summary
- `authoring_quality`: warning group

## 제거 대상

다음 step-based UI는 active path에서 제거한다.

- `StepList.tsx`
- `StepDetail.tsx`
- `session.plan.steps` 기반 state
- `step` target feedback composer
- top-level prototype link가 `step`을 가리키는 UI

## 완료 조건

- graph fixture session이 review UI에서 열린다.
- root graph와 node list가 보인다.
- node 선택 시 block detail이 보인다.
- block 또는 node target에 feedback을 남길 수 있다.
- validation summary와 issue list가 보인다.
- issue 클릭 시 가능한 경우 관련 graph element로 이동한다.
- prototype block과 prototype piece target을 표시한다.
- event timeline이 graph target breadcrumb를 표시한다.
- UI 코드가 `session.plan.steps`를 읽지 않는다.

## 검증 방법

실행:

```bash
pnpm typecheck
pnpm build
pnpm dev
```

수동 검증:

1. graph fixture session 생성
2. review URL 열기
3. root graph overview 확인
4. node 선택
5. block detail 확인
6. node 또는 block feedback 작성
7. event timeline에서 target breadcrumb 확인
8. validation issue badge와 panel 확인
9. prototype piece 선택 후 feedback target 확인
10. API 또는 MCP mutation 후 revision/validation 갱신 확인
