---
name: codex-self-improvement
description: Improve Codex skills from approved session review.
---

# Codex Self-Improvement

Use this skill when the user explicitly asks to reflect a completed session,
workflow correction, recurring procedure, or durable preference into Codex
self-improvement skills.

This skill is the manual Codex equivalent of Hermes background self-improvement
review. The user runs it after a Codex session or task is complete. Review the
whole available session conversation, not just the latest user message, and
update skills only through the `codex-self-improvement` MCP tools after explicit
approval.

## Boundaries

- Use MCP tools only: `skill_list`, `skill_view`, `skill_manage`.
- Do not edit skill files directly.
- Use `skill_manage` only for `create`, `edit`, `patch`, or `write_file`.
- Do not archive, delete, restore, pin, unpin, merge, or consolidate skills.
- If a change requires archive, umbrella merge, stale pruning, or package
  relocation, stop and propose the `codex-skill-curation` workflow instead.

## Review Input

Use the full active conversation as the source of truth unless the user provides
a specific transcript or artifact. Treat the completed session the way Hermes
background review treats its post-turn conversation snapshot: inspect user
corrections, tool failures and fixes, loaded skills, decisions, and the final
working approach.

If the available conversation is visibly truncated or missing the task context,
do not invent a review. Ask for the missing transcript or artifact.

When a transcript file or pasteable transcript is available, run the deterministic
rubric before proposing a mutation. If turn-history exists for the same session,
include it in the review; it is the compact memory index for user decisions,
corrections, memory requests, agent issues, and successful working patterns.

```bash
python3 ~/.codex/self-improvement/codex_self_improvement.py review \
  --transcript <path> \
  --turn-history-session <session-id>
```

If no transcript file exists and the active conversation is complete in context,
apply the same rubric manually and include the rubric fields in the proposal:
durable signals, loaded/consulted skills, ranked targets, rejected transient
failures, and `requires_approval=true`.

Do not treat regex signals as the final decision. Use them as attention hints.
A skill update candidate may exist even when no regex signal appears, and a
regex signal may be rejected when full context shows it is one-off, disputed, or
environment-specific. Review the full transcript and turn-history together.

Ignore:

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
   - Be active. A completed non-trivial session often has at least one small
     skill improvement. `Nothing to save` is valid only when no durable signal
     appears after checking the whole session.
   - User corrections about style, tone, format, workflow, legibility, or
     verbosity are first-class skill signals when they affect a class of task.
     Embed them in the relevant task skill, not only in memory.
   - Capture the fix or reusable retry pattern, not a transient setup failure.
     Never save durable claims such as "tool X does not work" when the issue was
     environment state, missing config, or a resolved one-off failure.

2. Run or apply the deterministic review rubric.
   - Prefer the `review` command when transcript text is available.
   - Include `--turn-history-session` or `--turn-history-file` when turn-history
     exists for the session.
   - Treat its `run.json` and `REPORT.md` as the structured review artifact.
   - Do not mutate from the report alone; it is a proposal aid and always
     requires approval.
   - If reviewing manually from active context, reproduce the same fields:
     `explicit_signals`, `turn_history_signals`, `contextual_candidates`,
     `rejected_candidates`, `loaded_skills`, `candidate_targets`,
     `do_not_store`, and `rubric.recommended_operation`.

3. Inspect the skill landscape.
   - Call `skill_list`.
   - Use telemetry in the result: `created_by`, `state`, `pinned`,
     `use_count`, `view_count`, `patch_count`, and `last_activity_at`.
   - Reconstruct which skills were loaded or consulted in this session from
     visible `skill_view` calls, skill names mentioned in the conversation, and
     the current skill list.

4. Verify identity before relying on a skill.
   - Call `skill_view` for any candidate target.
   - Preserve `version` and `purpose_hash` in the proposal.
   - If the skill changed since it was listed, reload and re-evaluate.
   - If the purpose no longer matches the intended update, do not patch it.

5. Choose the update target using Hermes review priority.
   1. Patch a currently-loaded or consulted skill when it covers the learning.
      It was in play, so it is the best first target.
   2. Patch an existing broad/umbrella skill when no loaded skill fits.
   3. Add a support file under an existing umbrella when the lesson is detailed
      session evidence, a reusable template, or a deterministic script.
      - `references/<topic>.md`: session-specific detail, reproduction recipes,
        provider quirks, condensed docs, or domain notes.
      - `templates/<name>.<ext>`: starter files intended to be copied and
        modified.
      - `scripts/<name>.<ext>`: deterministic probes, generators, or
        verification commands.
      Add a one-line pointer in the umbrella `SKILL.md` whenever writing a
      support file.
   4. Create a new class-level umbrella skill only when no existing skill covers
      the class. The name must not be a PR number, feature codename, exact error
      string, library name alone, or today's task artifact.

6. Propose before mutating.
   Include:
   - deterministic report path when one was created
   - rubric result and recommended operation
   - target skill or new skill name
   - durable lesson
   - session evidence that supports the lesson
   - telemetry signals that influenced the decision
   - exact intended operation: `create`, `edit`, `patch`, or `write_file`
   - exact content shape, summarized compactly
   - rejected alternatives, especially why a loaded skill or existing umbrella
     was not patched
   - what will not be stored

7. Wait for explicit user approval.
   - Do not call `skill_manage` before approval.
   - If approval changes the scope, re-check the target with `skill_view`.
   - If the target has `created_by=user` or `pinned=true`, ask for explicit
     approval naming that target before mutating it.

8. Apply through MCP.
   - Use `patch` for small changes.
   - Use `write_file` for detailed references, templates, or scripts that
     would bloat `SKILL.md`.
   - Use `create` only for durable class-level workflows likely to recur.
   - Use `edit` only when replacing the full SKILL.md is clearer than patching.

9. Summarize the result.
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

## Output Shape Before Approval

Use this compact structure before any mutation:

```text
Self-improvement proposal
- signal: <workflow correction | user preference | missing step | reusable fix>
- evidence: <short session evidence>
- target: <skill name or new skill name>
- operation: <patch | write_file | create | edit>
- why this target: <loaded skill / existing umbrella / no existing fit>
- skipped: <candidate skills not changed and why>
- will not store: <secrets, one-off facts, transient failures, etc.>
```

## Refusal Cases

Do not update skills when:

- the user did not ask for self-improvement
- the evidence is only a truncated transcript tail
- the lesson is project-local and unlikely to recur
- the update would store secrets or raw private content
- the target skill purpose does not match
- the required operation is consolidation or archive
