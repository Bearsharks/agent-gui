# Agent GUI Handoff

## Current State

This repository now contains a POC implementation for the browser-based plan review UI.

Core documents:

- `prd.md`: product requirements
- `architecture.md`: technical architecture
- `acceptance.md`: completion criteria and E2E scenarios

Implemented workspace structure:

```txt
apps/
  server/
  review-web/
  prototype-runtime/
packages/
  plan-schema/
  design-system/
fixtures/
  review-target-app/
```

## Completed Work

### Documentation

Created and committed:

- PRD for browser-based plan review
- Architecture document for the single local server design
- Acceptance criteria document with user scenarios and E2E requirements

Important product decisions captured in the docs:

- One local server owns both MCP and web server roles.
- `step` remains the core plan unit.
- `phase` is optional grouping only.
- Prototype is part of the plan review artifact.
- Prototype preview is a plan-linked URL tab container.
- Prototype ids and prototype-to-plan-target links are explicit; URL internals are owned by the external app.
- `update_plan_revision` remains the single revision update tool, with optional `target` for focused updates.
- Plan/prototype updates must be reflected immediately in the browser.
- Actual completion requires a realistic fixture project scenario.

### Implementation

Implemented:

- pnpm workspace
- shared plan schema package
- local design system package
- realistic fixture project
- single local server
- file-backed session store
- session APIs
- SSE event stream
- `planctl notify`
- review web UI
- prototype iframe runtime
- MCP-style HTTP route
- stdio MCP server implementation

Implemented commands:

```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm planctl notify <sessionId>
```

### Local Verification Completed

Verified locally:

- `pnpm typecheck` passed
- `pnpm build` passed
- local server starts on `http://localhost:8787`
- `POST /api/fixture-session` creates a plan session
- `GET /api/sessions/:sessionId` returns the plan session
- `/sessions/:sessionId` returns review app HTML
- `planctl notify` changes session status to `needs_agent`
- prototype feedback can be stored
- agent reply can be recorded
- targeted `update_plan_revision` works for `prototype`
- registered MCP `create_plan_session` works in the restarted Codex session
- `agent-browser` E2E verification completed against MCP-created fixture session `plan_88e7c898`
- review UI renders title, goal, status, revision, decisions, steps, step detail, feedback controls, event timeline, change summary, approval control, prototype URL tabs, iframe preview, and prototype-to-plan-target mapping
- browser-added plan, step, and prototype feedback are stored with correct targets
- `planctl notify plan_88e7c898` changed status to `needs_agent` and the browser reflected it
- registered MCP `list_plan_events`, `post_agent_reply`, and targeted `update_plan_revision` were verified
- revision 2 reflected status, change summary, step detail changes, and prototype change summary without manual page refresh
- browser approval created a `user.approval` event for revision 2 and changed status to `approved`
- session isolation was checked with control session `plan_ddfdf979`; B-only feedback did not appear in session A

Example working session from the last run:

```txt
http://localhost:8787/sessions/plan_88e7c898
```

That session may not persist across cleanup or future runs, so create a fresh fixture session if needed:

```bash
curl -s -X POST http://localhost:8787/api/fixture-session
```

## MCP Registration State

Codex config was updated at:

```txt
~/.codex/config.toml
```

Backup was created at:

```txt
~/.codex/config.toml.agent-gui.bak
```

Registered block:

```toml
[mcp_servers.agent-gui-plan-review]
command = "pnpm"
args = ["--dir", "/Users/joseongbynn/Projects/agent-gui", "--filter", "@agent-gui/server", "exec", "tsx", "src/mcp/stdioServer.ts"]
```

After session restart, the MCP server is visible as tools under the `agent_gui_plan_review` namespace.

Confirmed in the restarted session:

- `create_plan_session` created `plan_88e7c898`
- `get_plan_session` worked against `plan_88e7c898`
- `list_plan_events` returned feedback events with preserved targets
- `post_agent_reply` created replies with correct `replyToEventId`
- `update_plan_revision` created revision 2 with `fromRevision: 1`, `toRevision: 2`, targeted prototype metadata, and linked targets

## Browser Use Status

The acceptance criteria require E2E verification with the Codex in-app browser / browser-use skill.

The browser-use plugin is installed and enabled:

```toml
[plugins."browser-use@openai-bundled"]
enabled = true
```

However, the current session did not expose the required Node REPL tool:

```txt
mcp__node_repl__js
```

or equivalent:

```txt
node_repl js JavaScript execution
```

The browser-use skill requires that tool to initialize the in-app browser runtime.

Current result:

- Browser Use was attempted per its skill instructions, but this session still does not expose `mcp__node_repl__js` or an equivalent Node REPL `js` tool.
- Because the in-app Browser Use runtime could not be initialized, E2E was completed with the available `agent-browser` browser automation CLI instead.
- This verifies the actual local browser UI behavior, but it is not a literal Browser Use / Node REPL run.

Web search and local plugin inspection suggest:

- `mcp__node_repl__js` is not a normal user-configured MCP server.
- It is an internal/deferred tool required by the browser-use plugin.
- It may appear only in sessions where Browser Use / in-app browser tool discovery is enabled.
- A new session likely needs to be opened with Browser Use / Node REPL tool discovery available.

## Optional Follow-Up

If a future Codex session exposes `mcp__node_repl__js` or another Node REPL `js` tool, rerun the same E2E scenario with the Browser Use in-app browser runtime for strict acceptance parity.

## Completed Verification Plan

1. Start the local server if it is not running:

```bash
pnpm dev
```

2. Create a fresh fixture session:

```bash
curl -s -X POST http://localhost:8787/api/fixture-session
```

3. Use browser automation to open:

```txt
http://localhost:8787/sessions/<sessionId>
```

4. Verify visible UI:

- plan title
- goal
- status
- revision
- decision summary
- step list
- selected step detail
- step feedback input
- plan feedback input
- event timeline
- agent reply thread
- change summary
- approval button/state
- prototype iframe
- prototype URL tabs
- prototype-to-plan-target mapping

5. Completed browser interaction flow:

- Add step feedback.
- Add prototype feedback.
- Run `planctl notify <sessionId>`.
- Use registered MCP tool `list_plan_events`.
- Use registered MCP tool `post_agent_reply`.
- Use registered MCP tool `update_plan_revision` with `target: { type: "prototype", id: "proto-url-tabs" }`.
- Confirm revision and prototype change summary update without manual page refresh.
- Approve the latest revision in the browser.
- Confirm `approved` status appears.

6. Verified data assertions:

- UI revision matches `PlanSession.revision`.
- feedback target is preserved.
- agent reply has correct `replyToEventId`.
- `AgentRevisionEvent.fromRevision` and `toRevision` are correct.
- prototype changes include `prototypeId` and linked targets.
- approval event revision matches approved UI revision.

## Recent Commits

```txt
cb95d43 fix: resolve session storage paths from source
d1b5033 chore: ignore generated session data
cce886e feat: scaffold plan review server and UI
b2cd08a docs: clarify prototype revision workflow
1fff668 docs: define plan review poc
```

## Notes For Next Agent

- The local server must be running separately from MCP registration.
- MCP registration alone does not serve the web UI.
- If `localhost:8787` shows a blank page, first check:

```bash
curl -s -i http://localhost:8787/api/health
```

- If the server is not running, start:

```bash
pnpm dev
```

- Generated session files should remain ignored.
- Do not treat fallback Playwright verification as satisfying the browser-use requirement unless the user explicitly approves that fallback.
