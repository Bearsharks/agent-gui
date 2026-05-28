# Graph Validator Issue Taxonomy

## 목적

Graph Validator Issue Taxonomy의 목적은 그래프 플랜에서 발생하는 문제를 validator, HTTP API, MCP tool, Review UI, 테스트가 같은 언어로 이해하게 만드는 것이다.

그래프 플랜은 단순 목록이 아니다. `graph`, `node`, `block`, `edge`, `subgraph`, `prototype_piece`, `artifact_range`, `runtime output`이 서로 참조한다. 따라서 validator가 단순히 "invalid graph" 또는 "pointer does not resolve"처럼 말하면 UI와 agent가 다음 행동을 결정하기 어렵다.

taxonomy는 다음 질문에 답해야 한다.

- 무엇이 깨졌는가?
- 문제가 어느 graph/node/block/edge에 붙어 있는가?
- 저장은 가능한가, 승인은 막아야 하는가?
- UI는 어디에 표시해야 하는가?
- agent는 어떤 mutation으로 고쳐야 하는가?
- regression test는 어떤 안정적인 code를 검증해야 하는가?

즉 taxonomy는 validator 내부 정리가 아니라 Graph Plan GUI의 리뷰/수정 루프를 위한 오류 계약이다.

## 소비자별 책임

### Validator

validator는 raw message가 아니라 typed issue를 반환한다.

- stable `code`
- broad `category`
- `severity`
- source `path`
- 가능한 경우 `target` 또는 `pointer`
- 사람이 읽을 수 있는 `message`

### HTTP API

API는 graph 생성, 전체 교체, mutation 이후 validation summary를 반환한다.

- 저장 가능 여부
- approval 가능 여부
- error/warning count
- issue list

API는 message string을 해석하지 않는다. 정책 판단은 `severity`, `code`, `category`를 기준으로 한다.

### MCP Tool

MCP tool은 agent가 다음 행동을 결정할 수 있게 issue를 그대로 반환한다.

예:

- `missing_target_block`: target이 없는 block을 가리키므로 target 수정 또는 block 추가 mutation 필요
- `graph_contract_binding_type_mismatch`: graph_ref binding의 source/target output type 수정 필요
- `artifact_range_path_mismatch`: artifact target path 또는 artifact ref 수정 필요

Agent는 message parsing 없이 `code`로 repair strategy를 선택할 수 있어야 한다.

### Review UI

UI는 issue를 다음 기준으로 표시한다.

- graph overview badge
- node/block/edge inline marker
- validation panel grouping
- approval blocking banner
- target breadcrumb

UI는 `category`로 issue를 묶고, `target`이 있으면 해당 graph element에 표시한다.

### Tests

테스트는 message 문구가 아니라 `issue.code`를 검증한다.

메시지는 개선될 수 있지만 code는 contract라서 쉽게 바뀌면 안 된다.

## Issue Shape

권장 타입:

```ts
type GraphPlanValidationIssue = {
  severity: "error" | "warning";
  code: GraphPlanIssueCode;
  category: GraphPlanIssueCategory;
  message: string;
  path: string;
  target?: GraphPlanTarget;
  pointer?: GraphPlanPointer;
};
```

권장 summary:

```ts
type GraphPlanValidationSummary = {
  mode: "draft" | "publish";
  checkedAt: string;
  errorCount: number;
  warningCount: number;
  publishReady: boolean;
  issues: GraphPlanValidationIssue[];
};
```

`publishReady` 기본 규칙:

- `mode: "draft"`에서는 error가 있어도 session 저장은 가능할 수 있다.
- `mode: "publish"`에서는 error가 있으면 approval을 막는다.
- warning은 표시하지만 기본적으로 저장을 막지 않는다.

## Category Taxonomy

### `identity`

ID 자체의 중복이나 root graph 부재처럼 document identity를 깨는 문제다.

예상 code:

```txt
duplicate_graph_id
duplicate_node_id
duplicate_block_id
duplicate_edge_id
duplicate_output_definition
missing_root_graph
```

### `reference`

pointer, graph_ref, owner, output definition처럼 내부 reference가 resolve되지 않는 문제다.

예상 code:

```txt
missing_pointer
missing_output_definition
missing_graph_ref
missing_owned_graph
missing_graph_owner
missing_edge_from
missing_edge_to
owned_graph_owner_mismatch
graph_ref_owner_mismatch
owned_graph_ref_not_declared
```

### `target`

feedback, link, revision trace, prototype piece 등이 가리키는 `GraphPlanTarget`이 존재하지 않거나 type이 맞지 않는 문제다.

예상 code:

```txt
missing_target_graph
missing_target_node
missing_target_block
missing_target_block_item
missing_target_edge
missing_target_prototype_piece
target_block_item_type_mismatch
```

### `graph_contract`

subgraph input/output contract, graph_ref binding, output type이 맞지 않는 문제다.

예상 code:

```txt
missing_graph_contract_input
missing_graph_contract_output
required_graph_input_unbound
empty_graph_contract_binding
graph_contract_output_not_produced
graph_contract_binding_type_mismatch
graph_contract_binding_target_output_missing
produced_output_type_mismatch
```

### `condition`

edge condition, choice, comparison, branch selection 관련 문제다.

예상 code:

```txt
condition_value_not_allowed
condition_value_type_mismatch
condition_operator_type_mismatch
missing_selected_option
missing_selected_comparison_option
missing_downstream_graph
missing_comparison_downstream_graph
missing_score_option
missing_score_criterion
selected_option_status_mismatch
```

### `runtime`

runtime state가 plan definition과 맞지 않는 문제다.

예상 code:

```txt
runtime_document_mismatch
runtime_output_value_type_mismatch
runtime_output_value_not_allowed
runtime_current_node_missing
```

### `artifact`

artifact range, file path, line/char range가 맞지 않는 문제다.

예상 code:

```txt
missing_target_artifact_range
invalid_artifact_line_range
invalid_artifact_char_range
artifact_range_path_mismatch
```

### `revision_lineage`

changelog, target split/merge, revision trace가 변경 이력을 설명하지 못하는 문제다.

예상 code:

```txt
split_mapping_previous_count
split_mapping_new_count
merge_mapping_previous_count
merge_mapping_new_count
```

### `authoring_quality`

저장은 가능하지만 graph authoring 품질이나 review 가능성을 떨어뜨리는 문제다.

예상 code:

```txt
untyped_evidence_ref
missing_evidence_ref
synthesis_missing_branch_evidence
missing_experiment_hypothesis
missing_experiment_procedure_graph
```

## 예시

없는 block target을 가리키는 경우:

```json
{
  "severity": "error",
  "code": "missing_target_block",
  "category": "target",
  "path": "graphs.g-root.nodes.n-review.blocks.b-risk.links.0.target",
  "target": {
    "type": "block",
    "graphId": "g-root",
    "nodeId": "n-review",
    "blockId": "b-missing"
  },
  "message": "Target block 'g-root/n-review/b-missing' does not exist."
}
```

subgraph output binding type이 맞지 않는 경우:

```json
{
  "severity": "error",
  "code": "graph_contract_binding_type_mismatch",
  "category": "graph_contract",
  "path": "graph:g-root/node:n-parent/block:b-child.outputBindings.decision.source",
  "pointer": {
    "graphId": "g-child",
    "nodeId": "n-choice",
    "blockId": "b-choice",
    "outputKey": "decision"
  },
  "message": "Binding source output type does not match the graph contract output type."
}
```

artifact path가 맞지 않는 경우:

```json
{
  "severity": "warning",
  "code": "artifact_range_path_mismatch",
  "category": "artifact",
  "path": "graphs.g-root.nodes.n-artifact.blocks.b-files.artifacts.0",
  "target": {
    "type": "artifact_range",
    "graphId": "g-root",
    "nodeId": "n-artifact",
    "blockId": "b-files",
    "artifactId": "a-plan",
    "path": "docs/old.md"
  },
  "message": "Artifact range path does not match artifact ref."
}
```

## 구현 요구사항

1. 모든 validator issue code는 `GraphPlanIssueCode` union에 포함한다.
2. 모든 issue code는 category mapping을 가진다.
3. `addIssue`는 raw string code를 받더라도 내부에서 category를 부여하거나, typed helper로 교체한다.
4. summary builder는 `errorCount`, `warningCount`, `publishReady`를 계산한다.
5. API와 MCP는 validation summary를 그대로 반환한다.
6. UI는 category와 target을 기준으로 issue를 표시한다.
7. fixture regression test는 expected issue code를 검증한다.

## 완료 조건

- taxonomy 문서의 category와 code가 실제 TypeScript 타입과 일치한다.
- validator가 반환하는 모든 issue는 category를 가진다.
- positive fixture는 error 0개를 반환한다.
- adversarial fixture는 기대한 issue code를 반환한다.
- API create/replace/mutate 응답이 validation summary를 포함한다.
- MCP validation tool이 같은 validation summary를 반환한다.
- Review UI가 issue category와 target을 기반으로 표시할 수 있다.
