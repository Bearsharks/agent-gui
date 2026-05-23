---
name: plan-gui-mcp
description: Use Agent GUI's current graph-plan MCP workflow to create browser-reviewable GraphPlanDocument sessions, attach prototype iframe tabs, inspect feedback events, reply or revise plans, validate graph targets, and confirm approval. Trigger when the user asks to use Agent GUI, Plan GUI, graph plan review, MCP plan sessions, browser plan review, prototype tabs, revision/approval loops, or wants an implementation plan reviewed before code changes.
---

# Plan GUI MCP

Use this skill to create and operate Agent GUI graph-plan review sessions. The current model is graph-based: sessions contain a `GraphPlanDocument`, not the older step-based `PlanDraft`.

## Current Model

Submit a full `GraphPlanDocument`:

```ts
type GraphPlanDocument = {
  schemaVersion: "graph-plan/v1";
  id: string;
  title: string;
  goal: string;
  summary?: string;
  rootGraphId: string;
  graphs: GraphPlanGraph[];
  currentRevision: number;
};
```

Each graph contains nodes and edges:

```ts
type GraphPlanGraph = {
  id: string;
  title: string;
  purpose?: string;
  owner?: GraphPlanPointer;
  contract?: { inputs?: OutputDefinition[]; outputs?: OutputDefinition[] };
  nodes: GraphPlanNode[];
  edges: GraphPlanEdge[];
  layout?: { mode: "linear" | "dag" | "swimlane" | "tree" | "freeform"; order?: string[] };
};

type GraphPlanNode = {
  id: string;
  kind: "section" | "action" | "decision" | "checkpoint" | "review" | "artifact" | "note" | `x-${string}`;
  title: string;
  summary?: string;
  blocks: GraphPlanBlock[];
  ownedGraphIds?: string[];
  status?: "open" | "needs_revision" | "accepted" | "blocked" | "complete" | "rejected";
};
```

Use stable readable IDs: `g-implementation`, `n-validation`, `b-prototype`, `task-add-todo`, `tab-filter`.

## Targets

Feedback, links, relations, and mutations use `GraphPlanTarget`:

```ts
type GraphPlanTarget =
  | { type: "plan" }
  | { type: "graph"; graphId: string }
  | { type: "node"; graphId: string; nodeId: string }
  | { type: "block"; graphId: string; nodeId: string; blockId: string }
  | { type: "block_item"; graphId: string; nodeId: string; blockId: string; itemId: string; itemType?: BlockItemType }
  | { type: "edge"; graphId: string; edgeId: string }
  | { type: "prototype_tab"; graphId: string; nodeId: string; blockId: string; prototypeId: string; tabId: string }
  | { type: "artifact_range"; graphId: string; nodeId: string; blockId: string; artifactId: string; path?: string; lineStart?: number; lineEnd?: number };
```

`BlockItemType` values: `task`, `check`, `criterion`, `option`, `evidence`, `finding`, `verification`, `hypothesis`, `experiment`, `score`, `risk`, `artifact`, `change`, `migration_step`.

Prefer precise targets. If feedback is about a prototype screen state, target `prototype_tab`. If it is about a row inside a task/checklist/criteria block, target `block_item`.

## Blocks

Use only the block types needed for the plan. Common choices:

- `text`: freeform body plus optional `outputDefinitions`.
- `task_list`: implementation work items. Each item can have `target`.
- `checklist`: manual checks with `required`, `status`, `owner`.
- `criteria`: approval conditions with `required`, `status`.
- `review_bundle`: review prompt, linked targets, acceptance criteria, optional `prototypeRef`.
- `prototype`: iframe tabs for visual/interactive review.
- `risk`: risks with severity and mitigation.
- `verification`: command/manual/test/metric checks.
- `checkpoint_outcome`: final gate result and determining targets.
- `artifact`: files, URLs, code refs, generated outputs.
- `graph_ref`: references owned or external subgraphs.

Other supported specialist blocks include `choice_set`, `comparison`, `evidence`, `synthesis`, `changelog`, `investigation`, and `migration`.

### Common Metadata

Every block can include:

- `id`, `type`, `title`, `summary`, `status`
- `links: { target, purpose }[]`
- `outputDefinitions: { key, label?, valueType, required?, allowedValues?, producedBy? }[]`
- `revisionMeta`
- `metadata`

Use `links` and `outputDefinitions` when they help the reviewer understand what this block affects or produces. Do not invent metadata just to fill fields.

## Prototype Tabs

Prototype review is now a graph `prototype` block with URL tabs. Do not use the removed `pieces` model.

```ts
{
  id: "b-prototype",
  type: "prototype",
  title: "Todo List 프로토타입",
  prototypeId: "proto-todo-list",
  revision: 1,
  tabs: [
    {
      id: "tab-filter",
      title: "필터 상태",
      url: "http://localhost:8787/prototypes/todo-list?view=filter",
      summary: "전체/진행 중/완료 필터를 검토한다.",
      context: { graphId: "g-plan", nodeId: "n-implementation", blockId: "b-ui-tasks", itemId: "task-filter" },
      relatedTargets: [
        {
          target: { type: "block_item", graphId: "g-plan", nodeId: "n-implementation", blockId: "b-ui-tasks", itemId: "task-filter", itemType: "task" },
          purpose: "validates",
          note: "이 탭은 필터 구현 작업의 목표 화면이다."
        }
      ]
    }
  ]
}
```

Rules:

- Use one tab per reviewable screen state, mode, or prototype URL.
- The iframe URL owns its internal UI. Do not model buttons or panels inside the iframe as graph artifacts.
- Use `context` for the primary graph location the tab explains.
- Use `relatedTargets` to show what the tab validates, shows, or tests.
- Allowed tab relation purposes: `explains`, `validates`, `tests_interaction`, `shows_state`.
- Local HTTP prototype URLs must be `localhost` or `127.0.0.1`; HTTPS is also allowed.

## MCP Tools

Prefer direct MCP tools when available:

- `create_graph_plan_session({ graphPlan })`
- `get_graph_plan_session({ sessionId })`
- `list_plan_events({ sessionId, afterEventId? })`
- `post_agent_reply({ sessionId, revision, replyToEventId, target, body, disposition? })`
- `replace_graph_plan({ sessionId, baseRevision, graphPlan, changeSummary, validationPolicy? })`
- `mutate_graph_plan({ sessionId, baseRevision, operations, changeSummary, validationPolicy? })`
- `validate_graph_plan({ graphPlan, mode? })`
- `mark_plan_approved({ sessionId, revision, message? })`

If direct MCP tools are not available, use local HTTP:

```bash
curl -s http://localhost:8787/mcp/tools
curl -s -X POST http://localhost:8787/mcp/call \
  -H 'content-type: application/json' \
  --data-binary @payload.json
```

HTTP payload shape:

```json
{
  "tool": "create_graph_plan_session",
  "input": { "graphPlan": { "schemaVersion": "graph-plan/v1" } }
}
```

## Standard Workflow

1. Inspect the current schema if unsure: `packages/plan-schema/src/graphPlan.ts`.
2. Draft a focused `GraphPlanDocument` with explicit graph/node/block IDs.
3. Add prototype HTML/routes when visual review helps. Serve local prototypes from the same server, then connect URLs through a `prototype` block.
4. Validate before creating a session: `validate_graph_plan` with `mode: "publish"` when possible.
5. Create the session with `create_graph_plan_session`.
6. Share `http://localhost:8787/sessions/<sessionId>` and ask the user to review.
7. When feedback is ready, read `list_plan_events`.
8. Reply with `post_agent_reply` for explanation-only feedback.
9. Use `mutate_graph_plan` for narrow edits; use `replace_graph_plan` for structural changes.
10. Re-validate, then confirm approval with `get_graph_plan_session` or `mark_plan_approved` when appropriate.

## Runtime Gotchas

- If a tool rejects `prototype_tab` and expects `prototype_piece`, the server or MCP process is stale. Restart `pnpm dev` or the MCP server so it loads the current `@agent-gui/plan-schema`.
- Existing stored sessions may contain older data. UI code should tolerate missing optional fields, but new sessions should use `prototype_tab`.
- HTTP calls from Node may hit sandbox network restrictions. `curl` is usually approved in this repo.
- If adding a new prototype route in `apps/server/src/main.ts`, restart `pnpm dev` before relying on the clean route.

## Local Commands

- Start server: `pnpm dev`
- Fixture session: `curl -s -X POST http://localhost:8787/api/fixture-session`
- List HTTP tools: `curl -s http://localhost:8787/mcp/tools`
- Notify agent after browser feedback: `pnpm planctl notify <sessionId>`
- Validate repo changes: `pnpm typecheck` and `pnpm build`

## User-Facing Response

After creating a session, provide the URL and next action:

```text
계획 수립이 완료되었습니다. 브라우저 UI에서 검토하고 피드백을 남겨주세요:
http://localhost:8787/sessions/<sessionId>
```

If you created prototype URLs, list the main route briefly and mention that prototype tabs are available inside the plan UI.
