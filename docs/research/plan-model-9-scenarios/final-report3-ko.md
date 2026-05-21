# Graph Plan Model Research 3 최종 보고서

## 결론

3회 병렬 루프 결과, Research 3의 최종 baseline은 V9로 보는 것이 맞습니다.

V8 단계에서 이미 복잡한 2-depth 시나리오는 대부분 표현 가능했습니다. 세 번째 루프에서 드러난 문제는 모델 표현력 부족보다는 raw JSON 작성 안정성 문제였습니다. 그래서 V9는 큰 primitive를 늘리지 않고, runtime event와 binding 정밀도, validator 경고를 좁게 보강했습니다.

## 루프 요약

1차 루프: V6 -> V7

- numeric condition operator 추가
- `graph_ref.inputBindings/outputBindings` 추가
- runtime `outputValues` 추가
- condition value/type/allowedValues 검증 추가

2차 루프: V7 -> V8

- graph contract output `producedBy` 추가
- runtime `outputEntries` 추가
- runtime state semantic validator 추가
- graph_ref binding type compatibility 검증 추가
- graph contract output producer 검증 추가

3차 루프: V8 -> V9

- binding `targetPointer` 추가
- output binding target block이 해당 output key를 선언하지 않으면 warning
- runtime `events` 추가: `experiment_run`, `output_value`, `validator_result`, `user_decision`
- runtime event output validation 추가
- artifact range path/ref mismatch warning 추가

## 검증 결과

최종 상태에서 검증했습니다.

- positive fixture: 3개 통과
- adversarial fixture: 21개 통과
- runtime validator sample: issue 0개
- `pnpm --filter @agent-gui/plan-schema typecheck` 통과

## 모델 복잡성 판단

모델은 확실히 복잡해졌습니다.

하지만 복잡성 대부분은 에이전트가 추측하던 부분을 명시적 계약으로 바꾼 것입니다.

- condition이 참조하는 output을 block이 선언합니다.
- child graph가 입력/출력 contract를 가집니다.
- graph_ref가 parent-child dataflow를 binding으로 드러냅니다.
- graph contract output이 내부 producer를 가리킬 수 있습니다.
- runtime 값은 structured pointer로 기록됩니다.
- 반복 experiment run은 plan node가 아니라 runtime event로 기록됩니다.

따라서 복잡성 증가는 채택 가능합니다. 다만 이제 raw JSON을 에이전트가 직접 맞추게 하면 실수가 많아질 단계입니다.

## 남은 한계

아직 모델에 넣지 않은 것들이 있습니다.

- branch coverage warning
- active branch 기준 fan-in semantics
- derived output 계산식
- reusable graph template/interface
- definition 안에 남아 있는 일부 runtime-ish placeholder

이것들은 지금 schema primitive로 넣기보다 validator, authoring helper, MCP/skill guidance에서 다루는 편이 낫습니다.

## 다음 권장 작업

MCP 변경과 화면 설계에 들어가도 됩니다.

단, 화면 설계와 함께 authoring helper를 같이 설계해야 합니다.

우선순위는 다음입니다.

1. `defineOutput(block, definition)`
2. `addOwnedGraphRef(parent, child, bindings)`
3. `bindGraphInput()` / `bindGraphOutput()`
4. `setRuntimeOutput(pointer, value)`
5. `validatePublishReady(document, runtimeState)`

핵심 방향은 “모델을 더 단순하게 만들기”가 아니라 “에이전트가 반복 참조와 owner/binding/output pointer를 직접 조립하지 않게 만들기”입니다.
