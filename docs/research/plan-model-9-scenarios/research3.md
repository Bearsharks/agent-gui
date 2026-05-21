# Graph Plan Model Research 3

## Goal

Research 3 treats the latest model feedback as model work, not migration work. The loop stress-tested complex depth-2 graph plans with subagents and only adopted changes that directly improved graph correctness, validation, or agent authoring reliability.

## Version Summary

Research 3 moved the model through four baselines:

- V6: adopted the six model-level improvements from the review feedback.
- V7: added numeric condition operators, graph_ref contract bindings, and arbitrary runtime output values.
- V8: added contract output producers, structured runtime output entries, runtime-state semantic validation, and stronger binding/type checks.
- V9: added runtime event records, binding `targetPointer`, output binding target-slot warnings, and artifact range path consistency warnings.

## V6 Changes

V6 adopted:

- block `outputDefinitions`
- typed compound `GraphCondition`
- graph `contract.inputs` and `contract.outputs`
- `GraphPlanRuntimeState`
- `artifact_range` target
- constrained `x-*` custom node kinds

Free-form condition expressions were intentionally excluded. Typed predicates and `all` / `any` / `not` conditions are easier for agents to use consistently and easier for validators to check.

## Loop 1: V6 To V7

Six parallel subagents generated depth-2 scenarios across prototype review, option comparison, research fan-out/fan-in, debugging, checklist gates, and graph authoring.

Repeated failures:

- Threshold gates were awkward without numeric operators.
- Child graph contracts were declared but not connected to `graph_ref`.
- Conditions referenced runtime outputs that had no generic runtime value store.
- Condition values were not checked against output types or `allowedValues`.

Adopted V7 changes:

- Added numeric condition operators: `greater_than`, `greater_than_or_equal`, `less_than`, `less_than_or_equal`.
- Added `graph_ref.inputBindings` and `graph_ref.outputBindings`.
- Added runtime `outputValues`.
- Added semantic validation for condition value type, numeric operator type, and `allowedValues`.
- Added graph_ref binding key validation against child graph contracts.

Verification:

- positive fixtures: 3
- adversarial fixtures: 14
- `pnpm --filter @agent-gui/plan-schema typecheck` passed

## Loop 2: V7 To V8

Six more parallel depth-2 scenarios stressed V7 with stricter child graph boundaries and runtime output use.

Repeated failures:

- Runtime output keys were still opaque strings.
- Graph contract outputs could be declared without an internal producer.
- Binding sources could resolve but pass incompatible value types.
- Runtime output values were not validated against document `outputDefinitions`.

Adopted V8 changes:

- Added `contract.outputs[].producedBy`.
- Added `GraphPlanRuntimeState.outputEntries`.
- Added `validateGraphPlanRuntimeState(document, runtimeState)`.
- Added produced output pointer/type validation.
- Added graph contract output producer warnings.
- Added graph_ref binding type compatibility validation.
- Added adversarial fixtures for condition value/type, empty bindings, binding type mismatch, and missing graph output producers.

Verification:

- positive fixtures: 3
- adversarial fixtures: 19
- plan-schema typecheck passed

## Loop 3: V8 To V9

The third loop again used six parallel subagents with complex depth-2 scenarios. V8 was expressive enough for all scenarios.

Repeated findings:

- `outputBindings.target` stopped at a target block and did not identify a specific parent output slot.
- Repeated experiment runs should be runtime events, not duplicated plan nodes.
- `artifact_range.path` should be checked against the referenced artifact `ref`.
- Branch coverage, derived output semantics, and active-branch fan-in semantics are useful but should stay in validator/tooling for now.
- Raw JSON authoring is now complex enough that helper APIs are needed.

Adopted V9 changes:

- Added `graph_ref` binding `targetPointer`.
- Added output binding warning when a target block does not declare the mapped output key.
- Added runtime event records for `experiment_run`, `output_value`, `validator_result`, and `user_decision`.
- Added runtime event output validation through `validateGraphPlanRuntimeState`.
- Added artifact range path/ref mismatch warning.
- Added adversarial fixtures for output binding target-slot mismatch and artifact range path mismatch.

Verification:

- positive fixtures: 3
- adversarial fixtures: 21
- runtime validator sample: 0 issues
- plan-schema typecheck passed

## Current Assessment

V9 is a good model baseline for MCP and screen design work.

The model is more complex than V5/V6, but most of the complexity is explicit contract structure that prevents agent guesswork:

- outputs are declared before conditions use them
- child graph boundaries have typed contracts and bindings
- graph outputs can point to producers
- runtime values use structured pointers
- runtime events can record repeated runs without mutating the plan definition

The remaining risk is not expressiveness. It is raw authoring reliability.

## Recommended Next Work

Do not add broad new schema primitives yet.

Prioritize authoring tools and MCP/skill guidance:

- `defineOutput(block, definition)` returning a reusable pointer
- `addOwnedGraphRef(parent, child, bindings)` syncing `ownedGraphIds`, `graph_ref`, and child `owner`
- `bindGraphInput()` and `bindGraphOutput()` with immediate contract/type checks
- `setRuntimeOutput(pointer, value)` validating against `outputDefinitions`
- `validatePublishReady(document, runtimeState)` combining schema, semantic, runtime, and publish-mode validation

Useful later validator work:

- branch coverage warnings for `single_choice` outputs
- publish-mode requirements for owned child graph contracts
- active-branch fan-in semantics
- derived output documentation or typed runtime-computed markers

## Recommendation

Treat V9 as the Research 3 baseline.

Proceed to MCP changes and screen design, but build authoring helpers alongside them. Agents do not need perfect model understanding if the tools generate the repeated structural pieces and validators catch drift immediately.
