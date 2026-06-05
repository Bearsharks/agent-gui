---
name: codex-skill-curation
description: Curate Codex skills by pruning and consolidation.
---

# Codex Skill Curation

Use this skill when the user explicitly asks to curate, prune, archive, merge,
or consolidate Codex self-improvement skills.

Curation is the full library maintenance pipeline. It includes time/telemetry
based pruning and consolidation review. Unlike `codex-self-improvement`, this
workflow does not use MCP tools for mutation. Start with the curation runtime
dry-run so archive/stale decisions are report-backed before any live move.

## Boundaries

- Do not use MCP tools for curation.
- Prefer the runtime command before manual disk work:
  `python3 ~/.codex/self-improvement/codex_self_improvement.py curate`.
- Use `--apply` only after the dry-run report is reviewed and explicitly
  approved.
- Use `~/.codex/self-improvement/skills/.usage.json` as the telemetry sidecar.
- Use `~/.codex/self-improvement/changes.jsonl` for change records.
- Archive by moving complete skill directories under
  `~/.codex/self-improvement/skills/.archive`.
- Never permanently delete a skill directory.
- Never touch user-created or pinned skills unless the user explicitly names
  them and approves the action.

## Pipeline

1. Run the curation dry-run.
   - Execute `python3 ~/.codex/self-improvement/codex_self_improvement.py curate`.
   - Read `report_path` from the JSON result.
   - Inspect `run.json` and `REPORT.md`.
   - Treat the report as the source of truth for deterministic stale/archive
     transitions.
   - Treat `cluster_review` in `run.json` as the deterministic prefix/domain
     cluster pass. Do not rely only on an ad hoc manual list.

2. Snapshot before state.
   - List active agent-created skill directories.
   - Read each `SKILL.md` frontmatter.
   - Load telemetry from `.usage.json`.
   - Record `name`, `description`, `version`, `purpose_hash`, `state`,
     `pinned`, `created_by`, counters, activity timestamps, and content hash.

3. Automatic transitions.
   - Consider only `created_by=agent`.
   - Skip `pinned=true`.
   - Use `last_activity_at`, then `created_at`, as the activity anchor.
   - Mark old active skills as `stale`.
   - Archive older stale/active skills by moving the complete directory into
     `.archive`.
   - Update `.usage.json` atomically.

4. Mandatory prefix/domain cluster pass.
   - Start from the runtime `cluster_review.clusters` list, then manually inspect
     any ambiguous cluster before proposing live changes.
   - Identify prefix/domain clusters before making keep decisions. Prefix
     clustering is a required discovery pass, not an optional hint.
   - Use first words, repeated nouns, and workflow domains. For Codex
     self-improvement, expected examples include:
     `skill-update-*`, `skill-curation-*`, `skill-runtime-*`, `memory-*`,
     `hook-*`, `mcp-*`, `workflow-*`, `repo-*`, `project-*`, `browser-*`,
     `docs-*`, `test-*`, and `setup-*`.
   - Treat skills without a clear prefix/domain as orphan naming candidates.
     Decide whether they should be renamed, absorbed into an umbrella, or kept
     because their responsibility is genuinely standalone.
   - For each cluster with 2+ members, do not ask only whether the pairwise
     content overlaps. Ask what umbrella class the cluster serves and whether a
     maintainer would keep one class-level skill with labeled subsections.
   - Different triggers are not enough to keep siblings separate. Keep them
     separate only when they have different operational boundaries, mutation
     targets, approval/safety models, or package dependencies that make a shared
     umbrella misleading.

5. Choose one consolidation method per cluster.
   - Merge into an existing umbrella skill when one member is already broad.
   - Create a new umbrella `SKILL.md` when no existing member is broad enough.
   - Demote narrow but valuable details into the umbrella's `references/`,
     `templates/`, or `scripts/` directory.

6. Preserve package integrity.
   - Inspect each source skill as a full directory package.
   - Use `cluster_review.package_integrity` and
     `package_integrity_warnings` as the first deterministic warning set.
   - If the source has `references/`, `templates/`, `scripts/`, `assets/`, or
     relative links to them, do not flatten only `SKILL.md`.
   - Either keep the source skill, fully re-home all needed support files and
     rewrite paths, or archive the entire package unchanged.

7. Archive absorbed sources.
   - Add archive metadata before moving when possible:
     `absorbed_into: <umbrella>` for consolidation, or an empty/absent target
     for pure pruning.
   - Move the complete source directory into `.archive`.
   - Update telemetry state to `archived` and set `archived_at`.

8. Reconcile results.
   - Treat explicit `absorbed_into` metadata as the strongest signal.
   - Use the structured summary as the second signal.
   - Use filesystem/content audit as the fallback signal.
   - If a claimed umbrella does not exist after the run, do not classify the
     source as consolidated.

9. Write reports.
   - Write a machine-readable `run.json`.
   - Write a human-readable `REPORT.md`.
   - Include counts for checked, stale, archived, consolidated, pruned, added,
     and state transitions.
   - For each cluster reviewed, include `cluster_prefix`,
     `umbrella_candidate`, `decision`, and `why_not_merge` when keeping
     multiple siblings.

## Output Format

End with a human summary and this exact structured block:

```yaml
consolidations:
  - from: <old-skill-name>
    into: <umbrella-skill-name>
    reason: <why merged>
clusters:
  - cluster_prefix: <prefix-or-domain>
    umbrella_candidate: <skill-name-or-new-name>
    decision: merge | create_umbrella | demote_support_file | keep_separate
    why_not_merge: <required when decision is keep_separate>
prunings:
  - name: <skill-name>
    reason: <why archived without merge>
```

Every archived source must appear in exactly one list.

## Safety

- Prefer a dry-run report when the requested scope is broad or ambiguous.
- Ask for explicit approval before a live curation pass.
- Use `--apply` for live deterministic stale/archive transitions; it creates a
  `backup-skills` snapshot under the run report directory before moving skills.
- Keep archives recoverable by directory move.
- Do not rely on usage counters alone; judge overlap by content.
- Do not stop after the first cluster if obvious umbrella opportunities remain.
