---
name: plan-gui-mcp
description: Use Agent GUI's graph/html MCP workflow to create browser-reviewable GraphPlanDocument sessions, attach node iframe HTML entries, inspect graph/node/edge/iframe feedback events, reply or revise plans, validate graph targets, and confirm approval. Trigger when the user asks to use Agent GUI, Plan GUI, graph plan review, MCP plan sessions, browser plan review, node iframe previews, revision/approval loops, or wants an implementation plan reviewed before code changes.
---

# Plan GUI MCP

Use this skill to create and operate Agent GUI graph plan review sessions. The current model is graph/html based: MCP owns reusable flow structure, and node iframe HTML owns detailed presentation.

## Current Model

Submit a full `GraphPlanDocument`:

```ts
type GraphPlanDocument = {
  schemaVersion: "graph-plan/v1";
  id: string;
  title: string;
  markdownDesc?: string;
  rootGraphId: string;
  graphs: GraphPlanGraph[];
  currentRevision: number;
};
```

Each graph owns its nodes and edges:

```ts
type GraphPlanGraph = {
  id: string;
  title: string;
  markdownDesc?: string;
  parent?: { graphId: string; nodeId: string };
  nodes: GraphPlanNode[];
  edges: GraphPlanEdge[];
};
```

Each node can point to child graphs and local iframe entries:

```ts
type GraphPlanNode = {
  id: string;
  title: string;
  markdownDesc?: string;
  subGraphs?: string[];
  iframes?: {
    id: string;
    description: string;
    url: string;
    entryPath?: string;
  }[];
};
```

Use stable readable IDs: `g-implementation`, `n-validation`, `e-review-fix`, `iframe-before-after`.

## Graph And Iframe Rules

- Store all graphs in top-level `graphs[]`.
- Store edges as graph-level `edges[]`; do not embed edges inside nodes.
- Use `node.subGraphs[]` to connect a node to child graphs.
- Set each child graph's `parent` to the owning `{ graphId, nodeId }`.
- Use `markdownDesc` for concise document, graph, and node context. It is markdown and optional.
- The review UI renders selected node `markdownDesc` as a graph overlay and derives graph-card summary text from the same field.
- Choose between `markdownDesc` and iframe HTML deliberately:
  - Use `markdownDesc` for node purpose, decisions, review results, and short textual context that should be readable directly in the graph.
  - Use iframe HTML for actual UI states, prototypes, before/after comparisons, dense checklists, tables, panels, or interactions that are easier to judge visually.
  - When both are useful, keep `markdownDesc` as the decision summary and put the detailed screen or review UI in iframe HTML.
  - Do not put long bodies into every `markdownDesc`; split long work into a subgraph or iframe HTML.
- Use `iframes[].description` as the UI tab label.
- Keep `iframes[].id` unique within the node.
- Set `iframes[].entryPath` when the iframe URL is backed by a workspace source entry that an agent should read later. Keep it to the entry file path only; put scenario meaning, state details, and review guidance in `description`, `markdownDesc`, or the iframe HTML itself.
- Use only local explicit-port HTTP iframe URLs:
  - `http://localhost:<port>/...`
  - `http://127.0.0.1:<port>/...`
- The browser app appends `planRevision=<revision>` to iframe URLs and remounts iframe previews when the plan revision changes. Keep iframe URLs stable; do not add your own revision cache-buster unless the HTML itself needs a separate version key.

## Targets

Feedback, relations, and mutations use `GraphPlanTarget`:

```ts
type GraphPlanTarget =
  | { type: "plan" }
  | { type: "graph"; graphId: string }
  | { type: "node"; graphId: string; nodeId: string }
  | { type: "edge"; graphId: string; edgeId: string }
  | { type: "iframe"; graphId: string; nodeId: string; iframeId: string };
```

Prefer precise targets. If feedback is about a node's iframe tab, target `iframe`. If it is about the graph flow, target `graph`, `node`, or `edge`.

## MCP Tools

Prefer direct MCP tools when available:

- `create_graph_plan_session({ graphPlan })`
- `get_graph_plan_session({ sessionId })`
- `list_plan_events({ sessionId, afterEventId?, feedbackStatus? })`
- `post_agent_reply({ sessionId, revision, replyToEventId, target, body, disposition })`
- `mutate_graph_plan({ sessionId, baseRevision, operations, changeSummary, validationPolicy? })`
- `replace_graph_plan({ sessionId, baseRevision, graphPlan, changeSummary, replacementRationale, validationPolicy? })`
- `normalize_graph_plan({ graphPlan, mode? })`
- `validate_graph_plan({ graphPlan, mode? })`
- `mark_plan_approved({ sessionId, revision, message? })`

If direct MCP tools are not available, use local HTTP:

```bash
curl -s http://localhost:8787/mcp/tools
curl -s -X POST http://localhost:8787/mcp/call \
  -H 'content-type: application/json' \
  --data-binary @payload.json
```

## Standard Workflow

1. Inspect the current schema if unsure: `packages/plan-schema/src/graphPlan.ts`.
2. Draft a focused `GraphPlanDocument` with explicit graph/node/edge/iframe IDs.
3. When visual review helps, prefer a preview URL served by the target project, such as `http://localhost:5173/...`.
4. Use `docs/prototypes` only for Agent GUI fixture/debug HTML in this repo, not as the default place for real project previews.
5. Attach HTML entry points through `node.iframes[]`.
6. Validate before creating a session: `validate_graph_plan` with `mode: "publish"` when possible.
7. Create the session with `create_graph_plan_session`.
8. Share `http://localhost:8787/sessions/<sessionId>` and ask the user to review.
9. When feedback is ready, read `list_plan_events`; by default it returns only unhandled user feedback.
10. Handle every feedback item by calling `post_agent_reply` with a disposition. This is required even when a graph mutation also addresses the feedback.
11. Default to `mutate_graph_plan` for revisions.
12. Re-validate, then confirm approval with `get_graph_plan_session` or `mark_plan_approved` when appropriate.

## Feedback Handling

`post_agent_reply` is the source of truth for whether a feedback thread is handled. Do not rely on "read once" semantics, and do not assume a graph revision alone closes feedback.

Use `list_plan_events` as follows:

- Default: `list_plan_events({ sessionId })` returns only open `user.feedback` events that do not have a non-open reply disposition.
- Full audit log: `list_plan_events({ sessionId, feedbackStatus: "all" })`.
- Handled feedback only: `list_plan_events({ sessionId, feedbackStatus: "resolved" })`.
- Cursoring still works with `afterEventId`.

Use these `post_agent_reply.disposition` values:

- `answered`: answered without changing the graph.
- `incorporated_in_revision`: graph/html content was changed to address the feedback.
- `rejected`: intentionally not changing the plan, with rationale in `body`.
- `needs_user_clarification`: cannot complete without user input; clearly ask the next question in `body`.
- `open`: avoid this for normal handling because it leaves the feedback in the default open list.

When a mutation handles feedback, do both operations:

1. Call `mutate_graph_plan` or `replace_graph_plan`.
2. Call `post_agent_reply` with `replyToEventId` pointing to the original `user.feedback` and `disposition: "incorporated_in_revision"`.

Example:

```json
{
  "sessionId": "plan_12345678",
  "revision": 3,
  "replyToEventId": "feedback_abcdef12",
  "target": { "type": "node", "graphId": "g-review", "nodeId": "n-result-review" },
  "body": "반영했습니다. 노드 설명과 iframe 비교 화면을 새 기준으로 갱신했습니다.",
  "disposition": "incorporated_in_revision"
}
```

## Mutation Choice

Use `mutate_graph_plan` unless the whole document truly needs replacement.

Use `mutate_graph_plan` for:

- Adding nodes, edges, and subgraphs.
- Updating graph or node title or `markdownDesc`.
- Attaching or detaching subgraphs.
- Adding, updating, or removing iframe entries.
- Updating edge label, condition, or kind.

Use `replace_graph_plan` only for:

- Importing a fully regenerated `GraphPlanDocument`.
- Redesigning most graphs at once where targeted operations would obscure intent.
- Intentionally remapping many target identities after a split/merge/rewrite.

`replace_graph_plan` requires `replacementRationale`. If you cannot explain why targeted mutations are insufficient, use `mutate_graph_plan`.

## Iframe Mutation Examples

Add an iframe entry:

```json
{
  "op": "add_iframe",
  "target": { "type": "node", "graphId": "g-review", "nodeId": "n-result-review" },
  "iframe": {
    "id": "iframe-before-after",
    "description": "Before/after comparison",
    "url": "http://localhost:5173/agent-gui-preview/revision-before-after",
    "entryPath": "src/agent-gui-preview/revision-before-after.tsx"
  }
}
```

Update an iframe entry:

```json
{
  "op": "update_iframe",
  "target": { "type": "iframe", "graphId": "g-review", "nodeId": "n-result-review", "iframeId": "iframe-before-after" },
  "fields": {
    "description": "Revision before/after comparison",
    "entryPath": "src/agent-gui-preview/revision-before-after.tsx"
  }
}
```

Remove an iframe entry:

```json
{
  "op": "remove_iframe",
  "target": { "type": "iframe", "graphId": "g-review", "nodeId": "n-result-review", "iframeId": "iframe-before-after" }
}
```

Minimal node with iframe:

```json
{
  "id": "n-review",
  "title": "수정 결과 리뷰",
  "markdownDesc": "## 수정 결과 리뷰\n\n사용자 피드백 반영 결과를 확인한다.\n\n### 확인할 내용\n\n- 수정 전후 차이가 명확한지 확인한다.\n- 남은 피드백은 iframe target에 남긴다.",
  "iframes": [
    {
      "id": "iframe-result-review",
      "description": "수정 결과 리뷰 화면",
      "url": "http://localhost:5173/agent-gui-preview/revision-review",
      "entryPath": "src/agent-gui-preview/revision-review.tsx"
    }
  ]
}
```

## Runtime Gotchas

- If iframe targets or iframe mutation ops are rejected, restart `pnpm dev` or the MCP server so it loads the current `@agent-gui/plan-schema`.
- Existing stored sessions may contain old fields; create a new session for graph/html validation.
- HTTP calls from Node may hit sandbox network restrictions. `curl` is usually approved in this repo.
- If using fixture/debug HTML under `docs/prototypes`, restart `pnpm dev` before relying on the route.

## Local Commands

- Start server: `pnpm dev`
- Fixture sessions: `curl -s -X POST 'http://localhost:8787/api/fixture-session?scenario=linear'`, `prototype`, or `revision`
- List HTTP tools: `curl -s http://localhost:8787/mcp/tools`
- Notify agent after browser feedback: `pnpm planctl notify <sessionId>`
- Validate repo changes: `pnpm typecheck` and `pnpm build`
- Validate schema tests: `pnpm --filter @agent-gui/plan-schema test`
- Validate server tests: `pnpm --dir apps/server test`

## User-Facing Response

After creating a session, provide the URL and next action:

```text
계획 수립이 완료되었습니다. 브라우저 UI에서 검토하고 피드백을 남겨주세요:
http://localhost:8787/sessions/<sessionId>
```

If you created iframe HTML URLs, mention that iframe tabs are available inside the selected node detail panel.
