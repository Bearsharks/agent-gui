# Graph MCP Design

## 목적

Graph MCP 도구의 목적은 agent가 브라우저 Plan GUI 세션을 graph-only contract로 생성, 조회, 검증, 수정, 답변, 승인 처리할 수 있게 하는 것이다.

MCP는 HTTP API와 별도 모델을 만들지 않는다. HTTP API와 같은 `GraphPlanDocument`, `GraphPlanTarget`, mutation operation, validation summary를 사용한다.

## 설계 원칙

1. MCP tool은 `PlanDraft`, `step`, `phase`를 primary model로 언급하지 않는다.
2. 모든 plan payload는 `GraphPlanDocument`다.
3. 모든 feedback/reply/revision target은 `GraphPlanTarget`이다.
4. 전체 교체와 부분 mutation을 명확히 분리한다.
5. mutation은 `baseRevision`을 요구한다.
6. validation summary는 API 응답과 동일한 shape로 반환한다.
7. agent가 raw JSON path보다 graph target과 operation으로 수정하게 한다.
8. tool description은 agent가 다음 행동을 고를 수 있을 만큼 구체적이어야 한다.

## Tool Set

MVP MCP tool:

```txt
create_graph_plan_session
get_graph_plan_session
list_plan_events
post_agent_reply
replace_graph_plan
mutate_graph_plan
validate_graph_plan
mark_plan_approved
```

기존 tool 이름을 유지해야 하는 경우에도 schema와 description은 graph-only로 바꾼다.

## Tool Contracts

### `create_graph_plan_session`

Graph plan review session을 생성한다.

입력:

```ts
{
  graphPlan: GraphPlanDocument;
}
```

출력:

```ts
{
  sessionId: string;
  url: string;
  revision: number;
  validation: GraphPlanValidationSummary;
}
```

동작:

1. `GraphPlanDocument`를 parse한다.
2. validation을 실행한다.
3. session을 저장한다.
4. browser review URL을 반환한다.

### `get_graph_plan_session`

현재 session snapshot을 반환한다.

입력:

```ts
{
  sessionId: string;
}
```

출력:

```ts
PlanSession
```

출력 session은 반드시 `graphPlan`, `validation`, `events`를 포함한다.

### `list_plan_events`

세션 event를 조회한다.

입력:

```ts
{
  sessionId: string;
  afterEventId?: string;
}
```

출력:

```ts
PlanEvent[]
```

event target은 `GraphPlanTarget`이다. agent는 이 결과만 보고 답변할지, mutation할지, 전체 교체할지 결정할 수 있어야 한다.

### `post_agent_reply`

사용자 feedback thread에 agent 답변을 남긴다.

입력:

```ts
{
  sessionId: string;
  revision: number;
  replyToEventId: string;
  target: GraphPlanTarget;
  body: string;
  disposition?: "open" | "answered" | "incorporated_in_revision" | "rejected" | "needs_user_clarification";
}
```

출력:

```ts
AgentReplyEvent
```

주의:

- `target`은 원 feedback의 target과 같거나 더 구체적인 graph target이어야 한다.
- 서버는 target이 현재 graph plan에 resolve되는지 검증한다.

### `replace_graph_plan`

전체 `GraphPlanDocument`를 교체한다.

입력:

```ts
{
  sessionId: string;
  baseRevision: number;
  graphPlan: GraphPlanDocument;
  changeSummary: GraphPlanChangeSummary;
  validationPolicy?: "allow_all" | "block_errors";
}
```

출력:

```ts
PlanSession
```

사용 시점:

- 구조 변경이 크다.
- 여러 graph/subgraph가 한꺼번에 바뀐다.
- target patch로 표현하면 오히려 위험하다.

### `mutate_graph_plan`

여러 graph operation을 atomic하게 적용한다.

입력:

```ts
{
  sessionId: string;
  baseRevision: number;
  mode?: "atomic";
  operations: GraphPlanMutationOperation[];
  changeSummary: GraphPlanChangeSummary;
  validationPolicy?: "allow_all" | "block_errors";
}
```

출력:

```ts
PlanSession
```

사용 시점:

- 사용자가 지적한 특정 node/block/edge만 수정한다.
- node 추가와 edge 연결을 한 revision으로 묶는다.
- 하위 graph 추가와 graph_ref block 추가를 함께 적용한다.

지원 operation은 [graph-api-design.md](graph-api-design.md)의 MVP operation set을 따른다.

### `validate_graph_plan`

저장하지 않고 graph plan을 검증한다.

입력:

```ts
{
  graphPlan: GraphPlanDocument;
  mode?: "draft" | "publish";
}
```

출력:

```ts
GraphPlanValidationSummary
```

사용 시점:

- `replace_graph_plan` 전에 미리 검증한다.
- 대규모 mutation 결과를 저장하기 전에 검증한다.
- agent가 repair strategy를 정하기 위해 issue code를 확인한다.

### `mark_plan_approved`

현재 graph plan revision을 승인한다.

입력:

```ts
{
  sessionId: string;
  revision: number;
  message?: string;
}
```

출력:

```ts
PlanSession
```

정책:

- publish validation error가 있으면 approval을 막는 것을 기본값으로 한다.
- warning은 approval을 막지 않는다.

## Tool Description 요구사항

각 tool description은 다음을 명시한다.

- 입력 graph payload는 `GraphPlanDocument`다.
- target은 `GraphPlanTarget`이다.
- target 종류는 `plan`, `graph`, `node`, `block`, `block_item`, `edge`, `prototype_piece`, `artifact_range`다.
- mutation은 `baseRevision`을 요구한다.
- mutation 이후 validation이 실행된다.
- partial update는 `mutate_graph_plan`, full replacement는 `replace_graph_plan`을 사용한다.

## Error Handling

MCP tool error는 agent가 복구할 수 있게 구체적이어야 한다.

대표 error:

```txt
base_revision_mismatch
invalid_graph_plan_schema
validation_blocked
target_not_found
mutation_operation_failed
unknown_mutation_operation
approval_blocked_by_validation
```

`validation_blocked`는 validation summary를 포함해야 한다.

## 검증 시나리오

MCP 변경 완료 후 다음을 확인한다.

1. `create_graph_plan_session`으로 graph fixture session 생성
2. `get_graph_plan_session` 응답에 `graphPlan`, `validation`, `events` 존재
3. `validate_graph_plan`이 taxonomy summary 반환
4. `mutate_graph_plan`으로 block 하나 교체
5. mutation 후 revision 증가와 validation summary 갱신 확인
6. `replace_graph_plan`으로 전체 graph 교체
7. `post_agent_reply`가 graph target thread에 저장됨
8. validation error가 있는 publish revision approval 차단

