---
name: plan-gui-mcp
description: Use Agent GUI's local MCP plan review workflow to create browser-reviewable implementation plans, collect targeted user feedback, answer feedback threads, submit plan revisions, and confirm approval before implementation. Trigger when the user asks to use Agent GUI, Plan GUI, plan review UI, MCP plan sessions, browser plan review, revision/approval loops, or wants a complex implementation plan reviewed in the Agent GUI before code changes.
---

# Plan GUI MCP

Use this skill to run the Agent GUI review loop for implementation plans. Agent GUI is a local server plus MCP server that lets users review structured plans, leave targeted feedback, inspect revisions, and approve a plan in a browser.

## Prerequisites

- Work from the Agent GUI repo when possible.
- The local server normally runs at `http://localhost:8787`.
- If the server is not running and the task requires the UI, start it with `pnpm dev`.
- Use the available MCP tools directly when present:
  - `create_plan_session`
  - `get_plan_session`
  - `list_plan_events`
  - `post_agent_reply`
  - `update_plan_revision`
  - `mark_plan_approved`

## Standard Workflow

1. Draft the plan before editing code when the user asks for Agent GUI review or when the workflow explicitly requires approval.
2. Create a `PlanDraft` with clear decisions, phases, steps, risks, verification, and optional prototypes.
3. Call `create_plan_session` with `{ plan }`.
4. Share the returned review URL and ask the user to review it in the browser.
5. Wait for the user to say feedback is ready, or for `pnpm planctl notify <sessionId>` to mark the session as `needs_agent`.
6. Read feedback with `list_plan_events`.
7. For feedback that only needs explanation, call `post_agent_reply` on the original feedback event.
8. For feedback that changes the plan, call `update_plan_revision` with the full updated `PlanDraft`, the current `baseRevision`, and a concise `changeSummary`.
9. Repeat until the user approves the revision.
10. Confirm approval with `get_plan_session` before starting implementation.

## PlanDraft Shape

Always submit the full plan object on create and revision updates.

```ts
type PlanDraft = {
  title: string;
  goal: string;
  summary?: string;
  decisions?: Array<{
    id: string;
    title: string;
    summary: string;
    rationale?: string;
  }>;
  phases?: Array<{
    id: string;
    title: string;
    summary?: string;
    stepIds: string[];
  }>;
  steps: Array<{
    id: string;
    phaseId?: string;
    title: string;
    kind: "research" | "decision" | "code" | "test" | "checkpoint";
    summary: string;
    files?: string[];
    risks?: string[];
    constraints?: string[];
    verification?: string[];
  }>;
  risks?: Array<{
    id: string;
    title: string;
    severity: "low" | "medium" | "high";
    description: string;
    mitigation: string;
  }>;
  verification?: string[];
  prototypes?: PrototypeDraft[];
};

type PrototypeDraft = {
  id: string;
  revision: number;
  title: string;
  summary?: string;
  kind: "wireframe" | "mockup" | "flow" | "interaction";
  links: Array<{
    target: PlanTarget;
    purpose: "explains" | "validates" | "alternative" | "final_candidate";
  }>;
  tabs?: Array<{
    id: string;
    title: string;
    url: string;
    summary?: string;
  }>;
  state: Record<string, unknown>;
};
```

Use stable, readable IDs such as `phase-setup`, `step-auth-form`, `risk-session-state`, and `proto-main-flow`.

## Targets

Use precise targets so feedback threads and revisions remain traceable.

```ts
type PlanTarget = {
  type:
    | "plan"
    | "phase"
    | "step"
    | "decision"
    | "risk"
    | "verification"
    | "prototype";
  id?: string;
};
```

Rules:

- Use `{ "type": "plan" }` for whole-plan feedback.
- Include `id` for node-specific targets such as steps, decisions, risks, and prototypes.
- Preserve previous feedback and revision history; do not recreate a new session just to handle ordinary feedback.

## Reply vs Revision

Use `post_agent_reply` when:

- The user asks a clarifying question.
- The current plan is still correct.
- More user input is needed before revising.

Set `disposition` to one of:

- `answered`
- `needs_user_clarification`
- `open`
- `incorporated_in_revision`
- `rejected`

Use `update_plan_revision` when:

- The user asks to change scope, order, files, risks, verification, or prototype details.
- A plan defect is discovered while reviewing feedback.
- A targeted update would make the plan clearer than a reply.

Revision update requirements:

- Pass `baseRevision` equal to the current session revision.
- Pass the complete updated `PlanDraft`, not a partial patch.
- Include `changeSummary` entries that explain user-visible decisions.
- Include `target` when the revision is mainly about one plan node.
- Include `prototypeChanges` when prototype URL tabs or plan-target links change.

## Prototype Guidance

Add `prototypes` only when a visual or interaction preview would help the user review UX, UI, flow, or product behavior.

Each prototype should include:

- `id`, `revision`, `title`, `summary`
- `kind`: `wireframe`, `mockup`, `flow`, or `interaction`
- `links` to plan targets with purposes such as `explains`, `validates`, `alternative`, or `final_candidate`
- `tabs`, an array of external preview URLs:
  - `id`
  - `title`
  - `url`
  - optional `summary`
- `state` for small metadata only

Plan GUI renders prototype identity, linked plan targets, URL tabs, and the selected URL in an iframe. The external URL owns its internal UI. Do not model buttons, panels, components, or other iframe internals as Agent GUI artifacts.

## Local Commands

- Start server: `pnpm dev`
- Create fixture session for manual testing: `curl -s -X POST http://localhost:8787/api/fixture-session`
- Notify agent after browser feedback: `pnpm planctl notify <sessionId>`
- Validate repo changes: `pnpm typecheck` and `pnpm build`

## User-Facing Messages

After creating a session, provide the review URL and the next action:

```text
계획 수립이 완료되었습니다. 브라우저 UI에서 검토하고 피드백을 남겨주세요:
http://localhost:8787/sessions/<sessionId>
```

After submitting a revision, summarize the revision number and change summary, then ask the user to review the updated browser UI.

After approval, state that the approved revision is confirmed and proceed with implementation.
