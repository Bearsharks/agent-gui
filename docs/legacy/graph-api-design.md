# Graph API Design

## 목적

Graph Plan API는 단순한 node/edge CRUD가 아니다.
그래프는 node 하나를 바꾸는 순간 edge, subgraph, target, validation, revision lineage가 함께 영향을 받는다.

따라서 API의 중심은 개별 리소스 CRUD가 아니라 다음 조합이어야 한다.

- revisioned graph document
- target-based mutation
- atomic operation transaction
- validation summary
- review event history

## 설계 원칙

1. `GraphPlanDocument`가 저장 단위이자 단일 source of truth다.
2. 부분 변경 API가 있어도 서버는 변경 후 전체 document를 다시 검증한다.
3. 모든 mutation은 `baseRevision`을 요구한다.
4. 모든 mutation은 revision event를 남긴다.
5. target은 JSON path가 아니라 `GraphPlanTarget`을 우선한다.
6. 삭제, 이동, subgraph 추출처럼 부작용이 큰 작업은 policy를 명시한다.
7. 복잡한 변경은 여러 operation을 atomic transaction으로 묶는다.
8. plan definition 변경과 runtime state 변경은 분리한다.

## API 계층

최상위 API는 다음 계층으로 나눈다.

```txt
1. Document API       전체 그래프 문서 생성, 조회, 교체, 검증
2. Mutation API       여러 graph operation을 원자적으로 적용
3. Target Patch API   특정 target을 기준으로 한 단일 변경
4. Structure API      node, edge, branch 구조 변경
5. Subgraph API       하위 그래프 추가, 추출, inline, binding 변경
6. Runtime API        실행 상태, output, validator event 기록
7. Review API         feedback, reply, revision, approval
```

MVP에서는 API route를 과도하게 나누지 않고 `Document API`, `Mutation API`, `Review API` 중심으로 시작한다. `Structure API`와 `Subgraph API`는 `Mutation API`의 operation으로 먼저 제공한다.

## Document API

전체 document를 생성, 조회, 교체, 검증한다.

```txt
POST /api/sessions
GET  /api/sessions/:sessionId
PUT  /api/sessions/:sessionId/graph-plan
POST /api/graph-plan/validate
```

### Session 생성

```http
POST /api/sessions
```

```json
{
  "graphPlan": {}
}
```

응답:

```json
{
  "sessionId": "plan_1234abcd",
  "url": "http://localhost:8787/sessions/plan_1234abcd",
  "revision": 1,
  "validation": {
    "mode": "draft",
    "publishReady": true,
    "errorCount": 0,
    "warningCount": 0,
    "issues": []
  }
}
```

### 전체 교체

```http
PUT /api/sessions/:sessionId/graph-plan
```

```json
{
  "baseRevision": 4,
  "graphPlan": {},
  "changeSummary": {
    "structure": ["Root graph branch model replaced."],
    "content": ["Verification criteria updated."],
    "validation": ["Resolved missing_target_block."]
  },
  "validationPolicy": "block_errors"
}
```

서버 처리:

1. 현재 session과 `baseRevision`을 확인한다.
2. `GraphPlanDocument` schema를 parse한다.
3. semantic validator를 실행한다.
4. validation policy를 적용한다.
5. revision을 증가시킨다.
6. `agent.revision` event를 저장한다.
7. 갱신된 session과 validation summary를 반환한다.

## Mutation API

그래프 변경은 보통 node 추가, edge 연결, block 추가가 한 번에 묶인다.
따라서 최상위 mutation API는 여러 operation을 atomic하게 적용해야 한다.

```http
POST /api/sessions/:sessionId/graph-plan/mutations
```

```json
{
  "baseRevision": 4,
  "mode": "atomic",
  "operations": [
    {
      "op": "replace_block",
      "target": {
        "type": "block",
        "graphId": "g-root",
        "nodeId": "n-review",
        "blockId": "b-risk"
      },
      "block": {}
    },
    {
      "op": "add_edge",
      "graphId": "g-root",
      "edge": {
        "id": "e-review-to-verify",
        "from": "n-review",
        "to": "n-verify"
      }
    }
  ],
  "changeSummary": {
    "structure": ["Connected review node to verification node."],
    "content": ["Replaced risk block."],
    "validation": []
  },
  "validationPolicy": "block_errors"
}
```

서버 처리:

1. 현재 graph document를 clone한다.
2. operation을 순서대로 적용한다.
3. operation 중 하나라도 실패하면 저장하지 않는다.
4. 변경된 전체 document를 검증한다.
5. validation policy를 통과하면 revision을 증가시킨다.
6. mutation 결과와 revision event를 저장한다.

## Target Patch API

Target Patch는 Mutation API의 간단한 형태다. MVP에서는 별도 route를 만들지 않고 `graph-plan/mutations`에 단일 operation으로 표현할 수 있다.

예:

```json
{
  "baseRevision": 4,
  "operations": [
    {
      "op": "update_node_fields",
      "target": {
        "type": "node",
        "graphId": "g-root",
        "nodeId": "n-implementation"
      },
      "fields": {
        "title": "Implement graph session API",
        "status": "needs_revision"
      }
    }
  ]
}
```

JSON Pointer 기반 patch는 escape hatch로만 둔다. 기본 API는 graph 의미를 보존하는 target 기반 operation을 사용한다.

## Operation Taxonomy

### Content Operations

내용 변경 중심 operation이다.

```txt
update_graph_fields
update_node_fields
update_block_fields
replace_node
replace_block
replace_edge
```

사용 예:

- node title/status 수정
- block 본문 교체
- risk block만 수정
- edge label이나 condition만 수정

### Structure Operations

그래프 구조 변경 operation이다.

```txt
add_node
remove_node
move_node
add_edge
remove_edge
rewire_edge
append_block
insert_block_before
insert_block_after
reorder_blocks
```

사용 예:

- 검증 node 추가
- branch edge 연결
- edge destination 변경
- node 안에 verification block 추가

### Composition Operations

subgraph와 graph reference를 다루는 operation이다.

```txt
add_subgraph
extract_subgraph
inline_subgraph
attach_graph_ref
update_graph_bindings
convert_node_to_subgraph
convert_block_to_node
```

사용 예:

- node 상세 계획을 하위 graph로 분리
- 여러 node를 subgraph로 추출
- graph_ref block을 parent node에 추가
- child graph input/output binding 수정

### Runtime Operations

plan definition이 아니라 runtime state를 다루는 operation이다.

```txt
set_current_node
set_output_value
append_runtime_event
record_validator_result
```

runtime operation은 graph revision과 별도 sequence를 가질 수 있다.
MVP에서는 runtime mutation을 document mutation과 분리된 API로 두는 것을 권장한다.

### Revision Operations

revision 단위 변경이다.

```txt
replace_document
apply_json_patch
revert_to_revision
```

`apply_json_patch`는 고급 escape hatch다. agent-facing 기본 도구는 target-based operation을 우선한다.

## MVP Operation Set

초기 구현은 다음 operation만 지원한다.

```txt
replace_document
update_node_fields
update_block_fields
replace_block
append_block
add_node
add_edge
remove_node
remove_edge
rewire_edge
add_subgraph
attach_graph_ref
```

이 세트만으로 다음 작업을 처리할 수 있다.

- 전체 graph document 교체
- 특정 node/block 내용 변경
- node와 edge 추가/삭제
- edge 재연결
- node에 block 추가
- 하위 graph 추가와 graph_ref 연결

## 삭제와 이동 Policy

삭제와 이동은 dangling target을 만들 수 있으므로 policy가 필요하다.

### Node 삭제

```json
{
  "op": "remove_node",
  "target": {
    "type": "node",
    "graphId": "g-root",
    "nodeId": "n-old"
  },
  "policy": {
    "edges": "remove",
    "ownedGraphs": "error",
    "feedbackTargets": "preserve_as_historical",
    "revisionTargets": "preserve_as_historical"
  }
}
```

정책 후보:

```txt
edges: error | remove | reconnect
ownedGraphs: error | remove | detach
feedbackTargets: error | preserve_as_historical
revisionTargets: error | preserve_as_historical
```

MVP 기본값:

```txt
edges: error
ownedGraphs: error
feedbackTargets: preserve_as_historical
revisionTargets: preserve_as_historical
```

즉, 삭제 부작용을 명시하지 않으면 구조를 보수적으로 보호한다.

## Subgraph API Semantics

Subgraph는 단순히 `graphs[]`에 graph를 추가하는 문제가 아니다.
parent node ownership, `graph_ref` block, input/output contract binding이 함께 맞아야 한다.

### 하위 graph 추가

```json
{
  "op": "add_subgraph",
  "parent": {
    "type": "node",
    "graphId": "g-root",
    "nodeId": "n-implementation"
  },
  "graph": {
    "id": "g-implementation-detail",
    "title": "Implementation detail",
    "nodes": [],
    "edges": []
  },
  "attach": {
    "mode": "graph_ref_block",
    "blockId": "b-implementation-detail",
    "relationship": "detail"
  }
}
```

서버는 다음을 수행한다.

1. child graph를 `graphs[]`에 추가한다.
2. child graph owner를 parent node 또는 graph_ref block으로 설정한다.
3. parent node의 `ownedGraphIds`를 갱신한다.
4. 요청에 따라 parent node에 `graph_ref` block을 추가한다.
5. validation을 실행한다.

### Subgraph 추출

```json
{
  "op": "extract_subgraph",
  "sourceGraphId": "g-root",
  "nodeIds": ["n-a", "n-b", "n-c"],
  "newGraphId": "g-research-branch",
  "owner": {
    "type": "node",
    "graphId": "g-root",
    "nodeId": "n-research"
  },
  "policy": {
    "externalEdges": "convert_to_contract",
    "replaceInParentWith": "graph_ref_block"
  }
}
```

MVP에서는 `extract_subgraph`를 구현하지 않아도 된다. 다만 API taxonomy에는 포함해 이후 확장 방향을 고정한다.

## Runtime API

Runtime state는 plan definition과 분리한다.

권장 route:

```txt
PATCH /api/sessions/:sessionId/runtime
POST  /api/sessions/:sessionId/runtime/events
```

권장 정책:

- graph structure/content 변경은 `revision`을 증가시킨다.
- runtime event 변경은 별도 `runtimeSequence`를 증가시킨다.

MVP에서는 runtime API를 최소화하고, validator summary는 session에 저장한다.

## Review API

Review API는 graph mutation과 분리한다.

```txt
GET  /api/sessions/:sessionId/events
POST /api/sessions/:sessionId/feedback
POST /api/sessions/:sessionId/agent-replies
POST /api/sessions/:sessionId/approval
```

피드백 target은 항상 `GraphPlanTarget`이다.

```json
{
  "target": {
    "type": "block",
    "graphId": "g-root",
    "nodeId": "n-review",
    "blockId": "b-risk"
  },
  "message": "이 리스크는 검증 조건으로 분리하는 게 좋겠습니다.",
  "intent": "reassess_risk"
}
```

## MCP Tool Mapping

HTTP API와 MCP tool은 같은 graph contract를 사용한다.

권장 MCP 도구:

```txt
create_graph_plan_session
get_graph_plan_session
list_plan_events
post_agent_reply
mutate_graph_plan
replace_graph_plan
validate_graph_plan
mark_plan_approved
```

가장 중요한 도구는 `mutate_graph_plan`이다. node/edge/subgraph 추가처럼 구조가 바뀌는 작업도 먼저 mutation으로 표현한다. `replace_graph_plan`은 전체 문서 재생성, 대부분의 graph 재설계, 대규모 target identity 재매핑에만 사용한다.

```json
{
  "sessionId": "plan_1234",
  "baseRevision": 4,
  "operations": [
    {
      "op": "replace_block",
      "target": {
        "type": "block",
        "graphId": "g-root",
        "nodeId": "n-review",
        "blockId": "b-risk"
      },
      "block": {}
    }
  ],
  "changeSummary": {
    "structure": [],
    "content": ["Updated risk block after user feedback."],
    "validation": []
  }
}
```

## MVP API 요약

MVP route:

```txt
POST /api/sessions
GET  /api/sessions/:sessionId
GET  /api/sessions/:sessionId/events

PUT  /api/sessions/:sessionId/graph-plan
POST /api/sessions/:sessionId/graph-plan/mutations
POST /api/graph-plan/validate

POST /api/sessions/:sessionId/feedback
POST /api/sessions/:sessionId/agent-replies
POST /api/sessions/:sessionId/approval
```

MVP operation:

```txt
replace_document
update_node_fields
update_block_fields
replace_block
append_block
add_node
add_edge
remove_node
remove_edge
rewire_edge
add_subgraph
attach_graph_ref
```

핵심 결론:

Graph Plan API는 CRUD endpoint 모음이 아니라, revisioned graph document 위에 target-based atomic mutation을 적용하고 validation summary를 남기는 API여야 한다.
