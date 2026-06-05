---
name: codex-self-improvement
description: Improve Codex skills from approved session review.
---

# Codex Self-Improvement

Use this skill when the user explicitly asks to reflect a completed session,
workflow correction, recurring procedure, or durable preference into Codex
self-improvement skills.

This skill replaces automatic post-turn review. It performs the review
manually, with user approval, and updates skills only through the
`codex-self-improvement` MCP tools.

## Boundaries

- Use MCP tools only: `skill_list`, `skill_view`, `skill_manage`.
- Do not edit skill files directly.
- Use `skill_manage` only for `create`, `edit`, `patch`, or `write_file`.
- Do not archive, delete, restore, pin, unpin, merge, or consolidate skills.
- If a change requires archive, umbrella merge, stale pruning, or package
  relocation, stop and propose the `codex-skill-curation` workflow instead.

## Review Input

Use the active conversation as the source of truth unless the user provides a
specific transcript or artifact. Ignore:

- one-off project facts
- secrets, credentials, or raw private data
- unverified guesses
- transient environment failures
- preferences that are still disputed
- rules that would make future agents refuse valid work

## Workflow

1. Extract durable learning candidates.
   - Keep only reusable procedures, safety checks, tool workflows, or stable
     user preferences.
   - Prefer class-level guidance over session-specific notes.

2. Inspect the skill landscape.
   - Call `skill_list`.
   - Use telemetry in the result: `created_by`, `state`, `pinned`,
     `use_count`, `view_count`, `patch_count`, and `last_activity_at`.
   - Prefer updating an existing broad skill over creating a narrow new skill.

3. Verify identity before relying on a skill.
   - Call `skill_view` for any candidate target.
   - Preserve `version` and `purpose_hash` in the proposal.
   - If the skill changed since it was listed, reload and re-evaluate.
   - If the purpose no longer matches the intended update, do not patch it.

4. Propose before mutating.
   Include:
   - target skill or new skill name
   - durable lesson
   - telemetry signals that influenced the decision
   - exact intended operation: `create`, `edit`, `patch`, or `write_file`
   - exact content shape, summarized compactly
   - what will not be stored

5. Wait for explicit user approval.
   - Do not call `skill_manage` before approval.
   - If approval changes the scope, re-check the target with `skill_view`.

6. Apply through MCP.
   - Use `patch` for small changes.
   - Use `write_file` for detailed references, templates, or scripts that
     would bloat `SKILL.md`.
   - Use `create` only for durable class-level workflows likely to recur.
   - Use `edit` only when replacing the full SKILL.md is clearer than patching.

7. Summarize the result.
   - Report changed skill name, operation, and returned version/change id.
   - Mention skipped candidates and why they were not saved.
   - If curation is needed, name the suspected overlap but do not perform it.

## Telemetry Use

Telemetry is a decision aid, not the sole decision maker.

- High recent use of a broad skill favors `patch`.
- Many narrow skills with similar names suggests curation, not another create.
- `created_by=user` or `pinned=true` requires extra caution and explicit user
  direction before any update.
- `state=archived` means the active target may have moved; inspect active
  skills and do not recreate blindly.

## Refusal Cases

Do not update skills when:

- the user did not ask for self-improvement
- the evidence is only a truncated transcript tail
- the lesson is project-local and unlikely to recur
- the update would store secrets or raw private content
- the target skill purpose does not match
- the required operation is consolidation or archive
