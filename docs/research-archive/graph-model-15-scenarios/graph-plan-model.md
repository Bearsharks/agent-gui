# Graph Plan Model

This draft generalizes a plan from a step list into a graph document.

## Core Idea

A plan is a root graph. A graph contains nodes and edges. A node is a semantic container made from blocks. A block can point at another graph, so the model is fractal:

```txt
Graph
  Node
    TextBlock
    ChecklistBlock
    PrototypeBlock
    GraphBlock -> Graph
```

The existing step model becomes one projection of this structure:

```txt
task node + text/checklist/prototype blocks + sequence edges
```

## Primitives

- `GraphPlanDraft`: the full plan document.
- `PlanGraph`: a scoped graph with entry nodes, nodes, and edges.
- `GraphNode`: a reviewable semantic unit such as task, phase, decision, question, review, research, hypothesis, gate, option, or section.
- `GraphBlock`: the content and interaction units inside a node.
- `GraphEdge`: a relationship or transition between nodes.
- `GraphCondition`: an optional condition on an edge.
- `GraphTarget`: an address for feedback, replies, revisions, and approvals.
- `GraphContract`: graph-level input and output definitions for subgraphs.
- `GraphRuntimeState`: execution/review values such as answers, gate results, active nodes, and completed nodes.

## Plan Definition vs Runtime State

The plan draft should describe structure and expected outputs. User answers, computed gate results, current active path, and completed nodes belong in runtime state or events.

```txt
GraphPlanDraft
  stable structure, blocks, expected outputs, edges, conditions

GraphRuntimeState / PlanEvent
  question answers, checklist results, approvals, selected options, active path
```

Blocks declare `outputDefinitions`; runtime values store actual `key/value` pairs against a `GraphTarget`.

## Block Types

- `text`: explanation, rationale, instructions, or section prose.
- `checklist`: acceptance criteria, gates, release checks, or task subtasks.
- `question`: interview, decision prompt, clarification request, or tutoring question.
- `approval`: explicit human or agent approval.
- `prototype`: a plan-linked prototype or prototype piece.
- `artifact`: files, diffs, docs, datasets, charts, URLs, or metrics.
- `graph`: a subgraph reference, used for phase internals, branches, loops, or appendices.
- `evaluation`: option comparison and scoring.
- `evidence`: research claims and supporting sources.

## Edge Types

- `sequence`: default ordered flow.
- `dependency`: target depends on source.
- `conditional`: follow this edge when its condition is true.
- `fallback`: default path when no conditional edge applies.
- `reference`: non-execution relationship.
- `blocks` / `unblocks`: workflow state relationships.
- `loop`: repeat or return to a prior node.
- `rollback`: operational reversal path.

Nodes can declare `joinPolicy` for fan-in behavior:

- `all_incoming`: wait for all incoming dependency/unblock paths.
- `any_incoming`: continue when any incoming path is satisfied.
- `quorum`: continue after a minimum number of incoming paths.
- `manual`: the UI/user decides readiness.

Loop edges can declare `loopPolicy.maxIterations` and `loopPolicy.exitCondition`.

## Conditions

Conditions live on edges and usually reference block outputs:

```txt
QuestionBlock output -> ConditionalEdge condition -> next node
ChecklistBlock gate -> ConditionalEdge condition -> next phase
Prototype feedback output -> ConditionalEdge condition -> revision path
```

The MVP should prefer structured conditions:

```ts
{
  label: "OAuth selected",
  source: { nodeId: "choose-auth", blockId: "auth-question", outputKey: "auth_strategy" },
  operator: "equals",
  value: "oauth"
}
```

Free-form expressions are allowed as an escape hatch, but UI and validation should rely on structured fields first.

Checklist gates use the checklist block's canonical output key, defaulting to `gate_passed`:

```ts
{
  label: "Release gate passed",
  source: { nodeId: "release-gate", blockId: "checks", outputKey: "gate_passed" },
  operator: "gate_passed"
}
```

Compound conditions are represented with `all`, `any`, and `not`.

## Representative Patterns

### Linear Plan

```txt
discover -> design -> implement -> verify
```

Task nodes connected with `sequence` edges.

### Phase Plan

```txt
phase node
  text block
  graph block -> phase subgraph
```

Phase nodes keep high-level review readable while subgraphs hold detailed execution.

### Branching Plan

```txt
decision node
  question block -> output
conditional edges -> branch nodes
fallback edge -> clarification node
```

### Interview

Question nodes connected by conditional edges. Each question block produces an output used by the next edge.

### Checklist Gate

A gate node has a checklist block. An edge to the next graph area requires `all_required` or `all_items`.

### Prototype Review

A review node combines text, prototype, checklist, and question blocks. Feedback can target the node, prototype block, or prototype piece via `GraphTarget`.

### Research or Debugging Loop

Research, hypothesis, experiment, and result nodes form a loop. Result nodes route back to a new hypothesis or forward to a fix/summary.

## Projection

The model separates semantic structure from view hints, but graph review needs enough projection metadata to avoid unreadable generic graph diagrams.

- `PlanGraph.projection.defaultView` chooses the first view.
- `PlanGraph.projection.traversal` controls outline ordering.
- `PlanGraph.projection.groups` defines labeled groups and lanes.
- `GraphNode.projection` controls display order, labels, collapsed summaries, and block order.
- `GraphEdge.display` distinguishes primary, alternate, rollback, reference, and hidden edges.

Execution edge kinds should be considered separately from display roles. For example, a rollback edge has semantic `kind: "rollback"` and should also usually have `display.role: "rollback"`.

## Runtime And Events

`GraphRuntimeState` stores active/completed/skipped/blocked nodes, active/satisfied edges, selected paths, loop iterations, approvals, gates, and keyed runtime values.

Graph-specific events are modeled separately from the current step-centered events:

- `graph.feedback`
- `graph.reply`
- `graph.runtime_value`
- `graph.revision`
- `graph.approval`

The current POC still uses the old `PlanSession` event schemas; migrating those tools is a separate implementation step.

`GraphPlanSession` is the graph-native session envelope for that migration. It mirrors the current POC session shape: `status`, `revision`, `plan`, optional `runtime`, `events`, `createdAt`, and `updatedAt`.

## Authoring Recipes

Fresh agents should start from the smallest valid shape:

```ts
{
  title: "Plan title",
  goal: "Outcome",
  rootGraphId: "root",
  graphs: [{
    id: "root",
    title: "Root graph",
    entryNodeIds: ["start"],
    nodes: [{
      id: "start",
      type: "task",
      title: "Start",
      blocks: [{ id: "summary", type: "text", body: "What happens here." }]
    }],
    edges: []
  }]
}
```

Branching recipe:

- Put the prompt in a `question` block.
- Give the question an `outputKey`.
- Put routing only on `conditional` / `fallback` edges.
- Use `condition.source = { nodeId, blockId, outputKey }`.

Gate recipe:

- Put criteria in a `checklist` block.
- Use `gate: "all_required"` for release/approval gates.
- Route from the gate with `operator: "gate_passed"` and `outputKey: "gate_passed"`.

Subgraph recipe:

- Keep the parent node readable with a `text` block.
- Add a `graph` block pointing to the child graph.
- Use `inputBindings` and `outputBindings` only when parent/child runtime values must connect.

## Authoring Rules

Targets:

- `node`: requires `nodeId`.
- `block`: requires `nodeId` and `blockId`.
- `edge`: requires `edgeId`.
- `condition`: requires `edgeId` and `conditionId`.
- `checklist_item`: requires `nodeId`, `blockId`, and `itemId`.
- `evaluation_score`: requires `nodeId`, `blockId`, `optionId`, and `criterionId`.
- `prototype_piece`: requires `nodeId`, `blockId`, and `pieceId`.

Conditions:

- `equals` / `not_equals`: use `source` and `value`.
- `exists` / `not_exists`: use `source`.
- `gate_passed` / `gate_failed`: use a checklist block source and its `outputKey`.
- `approved`: use an approval block source or approval runtime target.
- `score_at_least`: use an evaluation score source and numeric `value`.
- Use exactly one of `operator`, `expression`, `all`, `any`, or `not`.

Validation that requires cross-reference checks is intentionally outside Zod. At minimum, validate graph ids, node ids, block ids, edge endpoints, graph block refs, projection block order, contract bindings, and target resolvability.

## Open Design Questions

- Which node type presets the UI should recognize first. The schema now keeps `node.type` open.
- Custom node types must use an `x-` prefix so renderers can distinguish known presets from extensions.
- `blocks` and `unblocks` are advanced authoring features. MVP authoring should prefer `dependency`, `conditional`, and `fallback` unless a UI/runtime explicitly needs blocker visualization.
- How much runtime state should live in `GraphPlanEvent` versus `GraphRuntimeState`.
- How much of the old `PlanDraft` schema should remain during migration.
- What referential integrity validation should run outside Zod for graph ids, node ids, block ids, edge endpoints, and target paths.
