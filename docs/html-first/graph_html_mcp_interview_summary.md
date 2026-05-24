# 그래프 및 HTML 중심 MCP 구성 인터뷰 요약

## 1. 목표

현재 노드뷰 중심 구성을 그래프와 HTML 중심 구성으로 변경한다.

핵심 목표는 에이전트가 MCP를 통해 작업의 논리적 흐름을 그래프로 다루고, 각 노드의 세부 표현은 에이전트가 생성한 HTML을 iframe으로 보여주는 구조를 만드는 것이다.

## 2. 핵심 해석

여기서 "재사용 가능"하다는 의미는 특정 워크플로우 인스턴스를 재사용한다는 뜻이 아니다.

모든 작업은 논리적 연결과 작업 흐름을 그래프로 나타낼 수 있으므로, 그래프 형식 자체를 반복적으로 사용할 수 있다는 의미다.

그래프는 작업의 흐름, 의존성, 순서, 반복, 분기, 위계를 표현한다. HTML iframe은 선택된 노드나 하위 그래프의 상세 화면, 리뷰 화면, 프로토타입 상태를 표현한다.

## 3. 노드의 의미 단위

노드의 의미 단위는 고정하지 않는다. 작업 유형과 도메인에 따라 달라진다.

- 인터뷰에서는 하나의 노드가 질문과 답변 묶음이 될 수 있다.
- 플랜에서는 하나의 노드가 작업 하나 또는 페이즈가 될 수 있다.
- 프로토타입 리뷰에서는 하나의 노드가 리뷰 단계나 화면 상태가 될 수 있다.
- 리뷰/수정 루프에서는 하나의 노드가 피드백 처리 단계, 수정 단계, 검토 단계가 될 수 있다.

중요한 것은 MCP 호출 단위나 iframe 화면 단위로 강제하지 않고, 해당 작업의 논리적 흐름을 사람이 이해하고 에이전트가 조작하기 쉬운 그래프로 나타내는 것이다.

## 4. 공통 스키마 방향

공통 필드는 작게 유지한다.

기본 구조 필드:

- `id`
- `title`
- `description`
- `subGraphs`
- 선택 필드: `iframes`

`edges`는 노드 내부 필드가 아니라 graph-level collection으로 둔다.

실행 관리 필드나 도메인별 상세 필드는 공통 필드로 과도하게 표준화하지 않는다. 상세 표현과 인터랙션은 iframe HTML이 담당한다.

## 5. 프랙탈 그래프 구조

모든 노드는 동일한 구체화 수준이나 동일한 위계를 갖지 않는다.

따라서 그래프는 프랙탈 구조를 지원해야 한다. 노드는 하위 그래프를 가질 수 있고, 하위 그래프는 다시 다른 하위 그래프를 가질 수 있다.

예시:

- 페이즈 노드의 하위 그래프가 세부 작업 목록을 표현할 수 있다.
- 하나의 작업 노드의 하위 그래프가 세부 작업 목록을 표현할 수 있다.
- 프로토타입 확인 노드의 하위 그래프가 여러 화면 상태를 표현할 수 있다.

상위 노드와 하위 그래프의 의미 관계는 고정하지 않는다. 에이전트가 작업 도메인과 컨텍스트에 따라 요약, 컨테이너, 실행 단위, 페이즈, 작업 단위 등으로 해석한다.

## 6. 그래프 저장 구조

모든 그래프는 문서 최상위 `graphs` 컬렉션에 저장한다.

노드는 하위 그래프 객체를 직접 중첩하지 않고, `subGraphs`에 하위 그래프 id만 참조한다.

권장 형태:

```json
{
  "id": "doc-search-review",
  "rootGraphId": "g-root",
  "graphs": [
    {
      "id": "g-root",
      "title": "검색 개선 계획",
      "nodes": [
        {
          "id": "n-implement",
          "title": "구현",
          "description": "검색 개선 기능을 구현한다.",
          "subGraphs": ["g-implementation-detail"]
        }
      ],
      "edges": []
    },
    {
      "id": "g-implementation-detail",
      "title": "구현 세부 작업",
      "parent": { "graphId": "g-root", "nodeId": "n-implement" },
      "nodes": [],
      "edges": []
    }
  ]
}
```

하위 그래프는 표준 `parent` 역참조를 가진다.

- 루트 그래프는 `parent`가 없다.
- 하위 그래프의 `parent`는 `{ graphId, nodeId }` 형태다.
- `graph.id`는 문서 전체에서 전역 유일해야 한다.
- `node.id`와 `edge.id`는 해당 graph 안에서만 유일하면 된다.

MCP 타겟팅 원칙:

- 하위 그래프에 노드를 추가할 때는 해당 `graphId`를 직접 타겟팅한다.
- 부모 노드에 새 하위 그래프를 연결할 때는 `parentGraphId + parentNodeId`를 타겟팅한다.
- 이미 연결된 하위 그래프에 노드를 추가할 때는 `parentNodeId + subGraphId`가 아니라 `subGraphId`를 직접 타겟팅한다.

## 7. Edge 구조

원본 스키마는 graph-owned edges로 고정한다.

이유:

- MCP가 edge를 안정적으로 추가, 수정, 삭제하려면 edge가 독립 id를 가져야 한다.
- 조건부 edge, loop edge, dependency edge 같은 흐름 표현에 적합하다.
- 노드 내부 edge는 필요할 경우 UI projection으로 만들 수 있지만 저장 원본은 graph-level edges 하나로 유지한다.

Edge 최소 필드:

- `id`
- `from`
- `to`
- `kind`
- `label`
- 선택 필드: `condition`

권장 `kind`:

- `sequence`
- `conditional`
- `loop`
- `dependency`
- 필요 시 에이전트가 확장 가능한 문자열

예시:

```json
{
  "id": "g-review-revision-loop",
  "title": "Review revision loop",
  "description": "피드백을 반영하고 승인 또는 재수정을 반복하는 흐름",
  "nodes": [
    { "id": "n-feedback", "title": "피드백 접수", "description": "사용자 피드백을 수집한다." },
    { "id": "n-revision", "title": "수정안 작성", "description": "피드백을 반영한 수정안을 만든다." },
    {
      "id": "n-review",
      "title": "수정 결과 리뷰",
      "description": "수정 결과를 iframe으로 검토한다.",
      "iframes": [
        {
          "id": "if-revision-review",
          "description": "수정 결과 리뷰 화면",
          "url": "http://localhost:3000/agent-review/search-panel/revision-review"
        }
      ]
    }
  ],
  "edges": [
    { "id": "e-feedback-revision", "from": "n-feedback", "to": "n-revision", "kind": "sequence", "label": "analyze and revise" },
    { "id": "e-revision-review", "from": "n-revision", "to": "n-review", "kind": "sequence", "label": "review result" },
    { "id": "e-review-revision", "from": "n-review", "to": "n-revision", "kind": "loop", "label": "needs revision", "condition": "user requests changes" }
  ]
}
```

## 8. iframe HTML 처리

iframe에 넣을 HTML은 중앙 artifact 저장소가 아니라 에이전트가 각 프로젝트 상황에 맞게 그때그때 생성한다.

에이전트는 프로젝트별로 필요한 HTML을 만들고 로컬 서버를 띄운 뒤, MCP에는 해당 노드의 상세 진입점 URL만 제공한다.

노드는 선택적으로 여러 iframe entry를 가진다.

각 iframe entry는 의미를 과도하게 표준화하지 않고 `id`, `description`, `url`만 가진다. `id`는 MCP mutation과 feedback target을 위한 안정적인 식별자이고, `description`은 사용자가 어떤 상세 화면인지 판단할 수 있게 하는 짧은 설명이며, `url`은 에이전트가 생성한 HTML의 로컬 HTTP 진입점이다.

```json
{
  "id": "n-revision-review",
  "title": "수정 결과 리뷰",
  "description": "피드백 반영 결과를 검토하고 승인 또는 재수정을 결정한다.",
  "subGraphs": [],
  "iframes": [
    {
      "id": "if-revision-review",
      "description": "수정 결과 리뷰 화면",
      "url": "http://localhost:3000/agent-review/search-panel/revision-review"
    },
    {
      "id": "if-before-after",
      "description": "이전/이후 비교 화면",
      "url": "http://localhost:3000/agent-review/search-panel/before-after"
    }
  ]
}
```

before/after 비교, 여러 상세 화면, 탭, 비교 UI 같은 세부 표현은 여전히 HTML 내부에서 자체적으로 처리할 수 있다. 다만 한 노드에 명확히 구분되는 상세 진입점이 여러 개 필요한 경우, `iframes` 배열에 여러 entry를 둘 수 있다.

중앙 스키마는 role, before/after, 상태명 같은 의미를 표준화하지 않는다. 의미가 필요한 경우 `description`에 자연어로 적고, 상세 구조와 인터랙션은 각 HTML이 담당한다.

## 9. iframe URL 허용 범위

기본 허용 범위는 로컬 HTTP URL로 제한한다.

허용:

- `http://localhost:<port>/...`
- `http://127.0.0.1:<port>/...`

기본 거부:

- `file://...`
- 임의의 외부 URL
- 명시적 allowlist가 없는 배포 미리보기 URL

보안 기준:

- UI는 iframe sandbox를 적용해야 한다.
- MCP 또는 서버 검증은 최소한 URL scheme과 host allowlist를 확인해야 한다.
- 기본 allowlist는 `localhost`와 `127.0.0.1`이다.
- URL 문자열 형식만 느슨하게 통과시키지 않는다.
- `iframes` 배열의 모든 entry에 동일한 URL 검증을 적용한다.
- 같은 노드 안에서 `iframes[].id`는 유일해야 한다.

테스트 기준:

- 유효한 값: `http://localhost:3000/agent-review/search-panel/prototype-check`
- 유효한 값: `http://127.0.0.1:3000/agent-review/search-panel/revision-review`
- 거부해야 하는 값: `file:///Users/example/prototype.html`
- 거부해야 하는 값: `https://example.com/prototype.html`

## 10. 완료 검증 시나리오

## 10. UI 구성 방향

UI는 현재 Review UI와 유사한 큰 형상을 유지한다.

기본 구성:

```txt
Header
Left Graph View
Right Detail Panel
```

### Header

Header는 현재 세션의 전역 상태를 보여준다.

- plan title
- status
- revision
- validation summary
- approval state

### Left Graph View

왼쪽 Graph View는 전체 그래프를 보여준다.

현재 선택한 graph scope만 보여주는 drilldown 방식이 아니라, root graph와 하위 그래프를 포함한 전체 프랙탈 그래프 구조를 한 화면에서 파악할 수 있게 한다.

표시 대상:

- root graph
- 하위 graph
- graph 안의 node
- graph-level edge
- node와 subgraph의 소유 관계
- 선택된 node
- iframe이 있는 node 표시
- validation issue가 있는 graph/node/edge 표시

하위 graph는 parent node와의 연결 관계가 드러나야 한다. 사용자가 어떤 node가 어떤 subgraph를 포함하는지, 그리고 전체 흐름 안에서 하위 graph가 어디에 붙어 있는지 한눈에 이해할 수 있어야 한다.

### Right Detail Panel

오른쪽 Detail Panel은 현재 선택 중인 node를 중심으로 구성한다.

상단에는 선택한 node 정보를 보여준다.

- node title
- node description
- node status가 있다면 status
- incoming/outgoing edge summary
- owned subgraph summary
- validation issue summary

node에 `iframes`가 있으면 node 정보 아래에 iframe tab을 보여준다.

각 tab은 iframe entry의 `description`을 label로 사용하고, 선택된 tab의 `url`을 sandbox iframe으로 렌더링한다.

```txt
Right Detail Panel
  Selected Node Info
  Iframe Tabs
  Active Iframe Preview
  Feedback
```

Feedback 영역은 오른쪽 Detail Panel 하단에 둔다.

기본 feedback target은 현재 선택된 node다. 사용자가 iframe tab을 선택한 상태에서 피드백을 남기면 해당 iframe entry를 target으로 삼을 수 있어야 한다.

### UI 책임 경계

Graph View는 전체 흐름과 구조를 보여준다.

Detail Panel은 선택한 node의 요약 정보, iframe 상세 화면, 피드백 thread를 보여준다.

상세 체크리스트, before/after 비교, 프로토타입 상태, 리뷰 질문 같은 세부 표현은 React UI가 직접 해석하지 않고 iframe HTML이 담당한다.

## 11. 완료 검증 시나리오

9대 우선 시나리오 중 다음 3개가 잘 표현되는지를 완료 기준으로 삼는다.

1. Linear / phase implementation plan
2. Prototype review plan
5. Review / revision loop

### Fixture A: Linear / phase implementation plan

입력 텍스트:

```text
블로그의 검색 경험을 개선하는 작업 계획을 세워라.
```

최상위 노드:

- 요구 확인
- 설계
- 구현
- 검증
- 배포 준비

Edge 관계:

```text
요구 확인 -> 설계 -> 구현 -> 검증 -> 배포 준비
```

Sub-graph:

- `구현` 노드는 하위 그래프를 가진다.
- 하위 그래프에는 검색 입력 UI, 결과 필터링, 빈 상태, 접근성 점검 같은 세부 작업 노드가 포함된다.

iframe HTML 필수 내용:

- 선택된 페이즈 또는 작업의 상세 설명
- 체크 항목
- 예상 산출물
- 관련 파일 또는 UI 상태

### Fixture B: Prototype review plan

입력 텍스트:

```text
새 검색 패널 프로토타입을 사용자가 검토하고 피드백할 수 있게 하라.
```

최상위 노드:

- 리뷰 목표
- 프로토타입 확인
- 피드백 수집
- 승인 여부 결정

Edge 관계:

```text
리뷰 목표 -> 프로토타입 확인 -> 피드백 수집 -> 승인 여부 결정
```

Sub-graph:

- `프로토타입 확인` 노드는 하위 그래프를 가진다.
- 하위 그래프에는 기본 상태, 검색어 입력 상태, 결과 있음 상태, 결과 없음 상태 같은 리뷰 가능한 화면 상태 노드가 포함된다.

iframe HTML 필수 내용:

- 검색 패널 UI
- 상태별 탭 또는 뷰
- 피드백 대상 표시
- 선택된 노드와 iframe 화면의 연결 정보

### Fixture C: Review / revision loop

입력 이벤트:

```text
사용자가 Prototype review plan의 검색 결과 상태에 대해 "결과가 너무 조밀하고 빈 상태 설명이 부족하다"는 피드백을 남긴다.
```

최상위 노드:

- 피드백 접수
- 영향 분석
- 수정안 작성
- 수정 결과 리뷰
- 승인 또는 재수정

Edge 관계:

```text
피드백 접수 -> 영향 분석 -> 수정안 작성 -> 수정 결과 리뷰 -> 승인 또는 재수정
승인 또는 재수정 -> 수정안 작성
```

두 번째 edge는 조건부 loop edge다.

Sub-graph:

- `수정안 작성` 노드는 하위 그래프를 가진다.
- 하위 그래프에는 결과 밀도 조정, 빈 상태 카피 개선, 프로토타입 HTML 갱신, 회귀 확인 노드가 포함된다.

iframe HTML 필수 내용:

- 이전/이후 비교
- 반영된 피드백 요약
- 수정된 검색 패널 상태
- 아직 남은 리뷰 질문

## 12. 남은 구현 방향

다음 구현 단계에서는 이 인터뷰 결과를 바탕으로 실제 스키마와 테스트를 작성해야 한다.

우선순위:

1. 프랙탈 graph document 스키마 정의
2. graph-level edges 검증
3. `subGraphs` 참조와 `parent` 역참조 검증
4. `iframes[].url` allowlist 검증
5. Fixture A/B/C를 기반으로 한 테스트 작성
6. 그래프와 iframe URL을 MCP가 안정적으로 생성, 조회, 수정할 수 있는 API 또는 tool contract 정리

## 13. 인터뷰 메타데이터

- Interview session id: `interview_20260524_053317`
- 완료 상태: Seed 생성 가능
- 최종 ambiguity: `0.18`
