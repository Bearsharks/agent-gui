---
name: codex-skill-curation
description: Curate Codex skills by pruning and consolidation.
---

# Codex Skill Curation

Use this skill when the user explicitly asks to curate, prune, archive, merge,
or consolidate Codex self-improvement skills.

Curation is the full library maintenance pipeline. It includes time/telemetry
based pruning and LLM-guided skill consolidation. Unlike
`codex-self-improvement`, this workflow does not use MCP tools for mutation.
It directly edits the skill store on disk and updates the shared telemetry
sidecar.

## Boundaries

- Do not use MCP tools for curation.
- Work directly under `~/.codex/self-improvement/skills`.
- Use `~/.codex/self-improvement/skills/.usage.json` as the telemetry sidecar.
- Use `~/.codex/self-improvement/changes.jsonl` for change records.
- Archive by moving complete skill directories under
  `~/.codex/self-improvement/skills/.archive`.
- Never permanently delete a skill directory.
- Never touch user-created or pinned skills unless the user explicitly names
  them and approves the action.

## Pipeline

1. Snapshot before state.
   - List active agent-created skill directories.
   - Read each `SKILL.md` frontmatter.
   - Load telemetry from `.usage.json`.
   - Record `name`, `description`, `version`, `purpose_hash`, `state`,
     `pinned`, `created_by`, counters, activity timestamps, and content hash.

2. Automatic transitions.
   - Consider only `created_by=agent`.
   - Skip `pinned=true`.
   - Use `last_activity_at`, then `created_at`, as the activity anchor.
   - Mark old active skills as `stale`.
   - Archive older stale/active skills by moving the complete directory into
     `.archive`.
   - Update `.usage.json` atomically.

3. Consolidation pass.
   - Scan all remaining agent-created skills.
   - Find prefix/domain clusters such as `codex-*`, `mcp-*`, `gateway-*`, or
     other repeated first words and workflow domains.
   - Ask whether a maintainer would write these as separate skills or as one
     umbrella skill with labeled subsections.

4. Choose one consolidation method per cluster.
   - Merge into an existing umbrella skill when one member is already broad.
   - Create a new umbrella `SKILL.md` when no existing member is broad enough.
   - Demote narrow but valuable details into the umbrella's `references/`,
     `templates/`, or `scripts/` directory.

5. Preserve package integrity.
   - Inspect each source skill as a full directory package.
   - If the source has `references/`, `templates/`, `scripts/`, `assets/`, or
     relative links to them, do not flatten only `SKILL.md`.
   - Either keep the source skill, fully re-home all needed support files and
     rewrite paths, or archive the entire package unchanged.

6. Archive absorbed sources.
   - Add archive metadata before moving when possible:
     `absorbed_into: <umbrella>` for consolidation, or an empty/absent target
     for pure pruning.
   - Move the complete source directory into `.archive`.
   - Update telemetry state to `archived` and set `archived_at`.

7. Reconcile results.
   - Treat explicit `absorbed_into` metadata as the strongest signal.
   - Use the structured summary as the second signal.
   - Use filesystem/content audit as the fallback signal.
   - If a claimed umbrella does not exist after the run, do not classify the
     source as consolidated.

8. Write reports.
   - Write a machine-readable `run.json`.
   - Write a human-readable `REPORT.md`.
   - Include counts for checked, stale, archived, consolidated, pruned, added,
     and state transitions.

## Output Format

End with a human summary and this exact structured block:

```yaml
consolidations:
  - from: <old-skill-name>
    into: <umbrella-skill-name>
    reason: <why merged>
prunings:
  - name: <skill-name>
    reason: <why archived without merge>
```

Every archived source must appear in exactly one list.

## Safety

- Prefer a dry-run report when the requested scope is broad or ambiguous.
- Ask for explicit approval before a live curation pass.
- Keep archives recoverable by directory move.
- Do not rely on usage counters alone; judge overlap by content.
- Do not stop after the first cluster if obvious umbrella opportunities remain.
