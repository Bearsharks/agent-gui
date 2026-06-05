#!/usr/bin/env python3
"""Deterministic curation runtime for Codex self-improvement skills."""

from __future__ import annotations

import datetime as _dt
import json
import os
import re
import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from codex_self_improvement_curation_clusters import analyze_clusters


STATE_ACTIVE = "active"
STATE_STALE = "stale"
STATE_ARCHIVED = "archived"
VALID_STATES = {STATE_ACTIVE, STATE_STALE, STATE_ARCHIVED}


def now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def now_iso() -> str:
    return now().isoformat()


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")


def root_dir() -> Path:
    return codex_home() / "self-improvement"


def skills_dir() -> Path:
    return root_dir() / "skills"


def archive_dir() -> Path:
    return skills_dir() / ".archive"


def usage_path() -> Path:
    return skills_dir() / ".usage.json"


def curation_reports_dir() -> Path:
    return root_dir() / "reviews" / "curation"


def curation_state_path() -> Path:
    return root_dir() / "curation-state.json"


def changes_path() -> Path:
    return root_dir() / "changes.jsonl"


@contextmanager
def usage_lock():
    lock_path = usage_path().with_suffix(".json.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        import fcntl  # type: ignore
    except ImportError:  # pragma: no cover - non-Unix fallback
        yield
        return
    with lock_path.open("a+", encoding="utf-8") as fd:
        fcntl.flock(fd, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def atomic_write_json(path: Path, data: Any) -> None:
    atomic_write_text(path, json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text
    raw = text[4:end].strip()
    body = text[text.find("\n", end + 1) + 1 :]
    fm: dict[str, str] = {}
    for line in raw.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fm[key.strip()] = value.strip().strip("\"'")
    return fm, body


def render_frontmatter(fm: dict[str, str], body: str) -> str:
    lines = ["---"]
    lines.extend(f"{key}: {value}" for key, value in fm.items() if value is not None)
    lines.extend(["---", "", body.strip(), ""])
    return "\n".join(lines)


def parse_iso(value: Any) -> _dt.datetime | None:
    if not value:
        return None
    try:
        parsed = _dt.datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_dt.timezone.utc)
    return parsed


def load_usage() -> dict[str, dict[str, Any]]:
    data = read_json(usage_path(), {})
    if not isinstance(data, dict):
        return {}
    return {str(k): v for k, v in data.items() if isinstance(v, dict)}


def save_usage(data: dict[str, dict[str, Any]]) -> None:
    atomic_write_json(usage_path(), data)


def is_excluded_skill_path(path: Path) -> bool:
    return any(part in {".archive", ".hub", ".git", "__pycache__"} for part in path.parts)


def skill_name_from_path(path: Path, fm: dict[str, str]) -> str:
    return fm.get("name") or path.parent.name


def latest_activity(record: dict[str, Any]) -> str | None:
    latest_dt: _dt.datetime | None = None
    latest_raw: str | None = None
    for key in ("last_used_at", "last_viewed_at", "last_patched_at", "last_activity_at"):
        raw = record.get(key)
        parsed = parse_iso(raw)
        if parsed is not None and (latest_dt is None or parsed > latest_dt):
            latest_dt = parsed
            latest_raw = str(raw)
    return latest_raw


def is_agent_created(fm: dict[str, str], record: dict[str, Any]) -> bool:
    return fm.get("created_by") == "agent" or record.get("created_by") == "agent" or record.get("agent_created") is True


def iter_active_skill_rows() -> list[dict[str, Any]]:
    base = skills_dir()
    usage = load_usage()
    rows: list[dict[str, Any]] = []
    if not base.exists():
        return rows
    for skill_md in sorted(base.rglob("SKILL.md")):
        if is_excluded_skill_path(skill_md):
            continue
        text = skill_md.read_text(encoding="utf-8", errors="replace")
        fm, body = parse_frontmatter(text)
        name = skill_name_from_path(skill_md, fm)
        record = usage.get(name, {})
        if not is_agent_created(fm, record):
            continue
        last_activity = latest_activity(record)
        rows.append(
            {
                "name": name,
                "path": str(skill_md),
                "skill_dir": str(skill_md.parent),
                "description": fm.get("description", ""),
                "body_preview": " ".join(body.split())[:1200],
                "absorbed_into": fm.get("absorbed_into"),
                "created_by": fm.get("created_by") or record.get("created_by") or "agent",
                "state": record.get("state", STATE_ACTIVE),
                "pinned": bool(record.get("pinned", False)),
                "created_at": record.get("created_at"),
                "last_activity_at": last_activity,
                "use_count": int(record.get("use_count") or 0),
                "view_count": int(record.get("view_count") or 0),
                "patch_count": int(record.get("patch_count") or 0),
            }
        )
    return rows


def unique_archive_dir(name: str) -> Path:
    base = archive_dir() / re.sub(r"[^a-zA-Z0-9_.-]+", "-", name.strip().lower()).strip("-._")
    if not base.exists():
        return base
    stamp = now().strftime("%Y%m%d-%H%M%S")
    candidate = archive_dir() / f"{base.name}-{stamp}"
    i = 2
    while candidate.exists():
        candidate = archive_dir() / f"{base.name}-{stamp}-{i}"
        i += 1
    return candidate


def snapshot_skills(run_id: str) -> Path | None:
    source = skills_dir()
    if not source.exists():
        return None
    target = curation_reports_dir() / run_id / "backup-skills"
    shutil.copytree(
        source,
        target,
        ignore=shutil.ignore_patterns(".usage.json.lock", "__pycache__"),
    )
    return target


def set_usage_record(name: str, updates: dict[str, Any]) -> dict[str, Any]:
    usage = load_usage()
    record = usage.get(name)
    if not isinstance(record, dict):
        record = {
            "created_by": "agent",
            "use_count": 0,
            "view_count": 0,
            "patch_count": 0,
            "created_at": now_iso(),
            "state": STATE_ACTIVE,
            "pinned": False,
            "archived_at": None,
        }
    record.update(updates)
    usage[name] = record
    save_usage(usage)
    return record


def append_change(action: str, name: str, summary: str, extra: dict[str, Any] | None = None) -> None:
    row = {"ts": now_iso(), "action": action, "name": name, "summary": summary}
    if extra:
        row.update(extra)
    changes_path().parent.mkdir(parents=True, exist_ok=True)
    with changes_path().open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def archive_skill(row: dict[str, Any], *, reason: str) -> dict[str, Any]:
    name = str(row["name"])
    source_dir = Path(str(row["skill_dir"]))
    target_dir = unique_archive_dir(name)
    target_dir.parent.mkdir(parents=True, exist_ok=True)

    skill_md = source_dir / "SKILL.md"
    if skill_md.exists():
        text = skill_md.read_text(encoding="utf-8", errors="replace")
        fm, body = parse_frontmatter(text)
        fm.setdefault("name", name)
        fm["state"] = STATE_ARCHIVED
        fm["archived_at"] = now_iso()
        atomic_write_text(skill_md, render_frontmatter(fm, body))

    shutil.move(str(source_dir), str(target_dir))
    set_usage_record(
        name,
        {
            "state": STATE_ARCHIVED,
            "archived_at": now_iso(),
            "archive_path": str(target_dir),
            "archive_reason": reason,
        },
    )
    append_change("archive", name, f"Archived skill '{name}' during curation.", {"archive_path": str(target_dir)})
    return {"name": name, "from": str(source_dir), "to": str(target_dir), "reason": reason}


def reconcile_archived_sources() -> dict[str, Any]:
    active_names = {str(row["name"]) for row in iter_active_skill_rows()}
    consolidated: list[dict[str, str]] = []
    pruned: list[str] = []
    invalid_consolidations: list[dict[str, str]] = []
    if not archive_dir().exists():
        return {
            "consolidated": consolidated,
            "pruned": pruned,
            "invalid_consolidations": invalid_consolidations,
        }
    for skill_md in sorted(archive_dir().rglob("SKILL.md")):
        text = skill_md.read_text(encoding="utf-8", errors="replace")
        fm, _body = parse_frontmatter(text)
        name = skill_name_from_path(skill_md, fm)
        target = fm.get("absorbed_into")
        if target:
            if target in active_names:
                consolidated.append({"from": name, "into": target})
            else:
                invalid_consolidations.append({"from": name, "into": target, "reason": "absorbed_into target is not active"})
        else:
            pruned.append(name)
    return {
        "consolidated": consolidated,
        "pruned": sorted(pruned),
        "invalid_consolidations": invalid_consolidations,
    }


def classify_transition(row: dict[str, Any], *, at: _dt.datetime, stale_after_days: int, archive_after_days: int) -> str:
    if row.get("pinned"):
        return "skip_pinned"
    anchor = parse_iso(row.get("last_activity_at")) or parse_iso(row.get("created_at")) or at
    stale_cutoff = at - _dt.timedelta(days=stale_after_days)
    archive_cutoff = at - _dt.timedelta(days=archive_after_days)
    state = row.get("state") or STATE_ACTIVE
    if anchor <= archive_cutoff and state != STATE_ARCHIVED:
        return STATE_ARCHIVED
    if anchor <= stale_cutoff and state == STATE_ACTIVE:
        return STATE_STALE
    if anchor > stale_cutoff and state == STATE_STALE:
        return STATE_ACTIVE
    return "keep"


def apply_transitions(*, dry_run: bool, stale_after_days: int, archive_after_days: int) -> dict[str, Any]:
    at = now()
    rows = iter_active_skill_rows()
    result: dict[str, Any] = {
        "checked": len(rows),
        "marked_stale": [],
        "archived": [],
        "reactivated": [],
        "skipped_pinned": [],
        "kept": [],
    }
    with usage_lock():
        for row in rows:
            transition = classify_transition(
                row,
                at=at,
                stale_after_days=stale_after_days,
                archive_after_days=archive_after_days,
            )
            name = str(row["name"])
            if transition == "skip_pinned":
                result["skipped_pinned"].append(name)
            elif transition == STATE_ARCHIVED:
                if dry_run:
                    result["archived"].append({"name": name, "planned": True})
                else:
                    result["archived"].append(archive_skill(row, reason=f"inactive for at least {archive_after_days} days"))
            elif transition == STATE_STALE:
                result["marked_stale"].append(name)
                if not dry_run:
                    set_usage_record(name, {"state": STATE_STALE, "last_activity_at": row.get("last_activity_at")})
                    append_change("stale", name, f"Marked skill '{name}' stale during curation.")
            elif transition == STATE_ACTIVE:
                result["reactivated"].append(name)
                if not dry_run:
                    set_usage_record(name, {"state": STATE_ACTIVE, "archived_at": None})
                    append_change("reactivate", name, f"Reactivated skill '{name}' during curation.")
            else:
                result["kept"].append(name)
    return result


def write_report(run: dict[str, Any]) -> Path:
    report_dir = curation_reports_dir() / str(run["run_id"])
    report_dir.mkdir(parents=True, exist_ok=True)
    atomic_write_json(report_dir / "run.json", run)
    lines = [
        "# Codex Skill Curation Report",
        "",
        f"- run_id: {run['run_id']}",
        f"- mode: {'dry-run' if run['dry_run'] else 'live'}",
        f"- checked: {run['transitions']['checked']}",
        f"- marked_stale: {len(run['transitions']['marked_stale'])}",
        f"- archived: {len(run['transitions']['archived'])}",
        f"- reactivated: {len(run['transitions']['reactivated'])}",
        f"- skipped_pinned: {len(run['transitions']['skipped_pinned'])}",
    ]
    backup_path = run.get("backup_path")
    if backup_path:
        lines.append(f"- backup_path: {backup_path}")
    for key in ("marked_stale", "reactivated", "skipped_pinned"):
        values = run["transitions"][key]
        if values:
            lines.extend(["", f"## {key}"])
            lines.extend(f"- {name}" for name in values)
    archived = run["transitions"]["archived"]
    if archived:
        lines.extend(["", "## archived"])
        for item in archived:
            if isinstance(item, dict):
                lines.append(f"- {item.get('name')}: {item.get('to') or 'planned'}")
            else:
                lines.append(f"- {item}")
    clusters = run.get("cluster_review", {}).get("clusters", [])
    if clusters:
        lines.extend(["", "## prefix/domain clusters"])
        for cluster in clusters:
            members = ", ".join(cluster.get("members", []))
            lines.append(
                f"- {cluster.get('cluster_prefix')}: umbrella_candidate="
                f"{cluster.get('umbrella_candidate')} members={members}"
            )
            warnings = cluster.get("package_integrity_warnings") or []
            if warnings:
                lines.append(f"  - package_integrity_warnings: {', '.join(warnings)}")
            for plan in cluster.get("package_merge_plans") or []:
                move_count = len(plan.get("moves") or [])
                rewrite_count = len(plan.get("rewrites") or [])
                conflict = " conflicts" if plan.get("has_conflicts") else ""
                lines.append(
                    f"  - merge_plan {plan.get('from')} -> {plan.get('into')}: "
                    f"moves={move_count} rewrites={rewrite_count}{conflict}"
                )
    orphans = run.get("cluster_review", {}).get("orphan_naming_candidates", [])
    if orphans:
        lines.extend(["", "## orphan naming candidates"])
        lines.extend(f"- {name}" for name in orphans)
    narrow = run.get("cluster_review", {}).get("narrow_name_candidates", [])
    if narrow:
        lines.extend(["", "## narrow name candidates"])
        lines.extend(f"- {name}" for name in narrow)
    reconciliation = run.get("reconciliation", {})
    if reconciliation:
        lines.extend(["", "## archive reconciliation"])
        lines.append(f"- consolidated: {len(reconciliation.get('consolidated', []))}")
        lines.append(f"- pruned: {len(reconciliation.get('pruned', []))}")
        invalid = reconciliation.get("invalid_consolidations", [])
        lines.append(f"- invalid_consolidations: {len(invalid)}")
        for item in invalid:
            lines.append(f"  - {item.get('from')} -> {item.get('into')}: {item.get('reason')}")
    atomic_write_text(report_dir / "REPORT.md", "\n".join(lines) + "\n")
    return report_dir


def run_curation(*, dry_run: bool = True, stale_after_days: int = 30, archive_after_days: int = 90) -> dict[str, Any]:
    if stale_after_days <= 0:
        raise ValueError("stale_after_days must be positive")
    if archive_after_days <= stale_after_days:
        raise ValueError("archive_after_days must be greater than stale_after_days")
    for path in (skills_dir(), archive_dir(), curation_reports_dir()):
        path.mkdir(parents=True, exist_ok=True)

    run_id = now().strftime("%Y%m%d-%H%M%S")
    backup_path = None
    if not dry_run:
        backup = snapshot_skills(run_id)
        backup_path = str(backup) if backup is not None else None
    transitions = apply_transitions(
        dry_run=dry_run,
        stale_after_days=stale_after_days,
        archive_after_days=archive_after_days,
    )
    cluster_review = analyze_clusters(iter_active_skill_rows())
    reconciliation = reconcile_archived_sources()
    run = {
        "run_id": run_id,
        "started_at": now_iso(),
        "dry_run": dry_run,
        "stale_after_days": stale_after_days,
        "archive_after_days": archive_after_days,
        "backup_path": backup_path,
        "transitions": transitions,
        "cluster_review": cluster_review,
        "reconciliation": reconciliation,
    }
    report_dir = write_report(run)
    state = read_json(curation_state_path(), {})
    if not isinstance(state, dict):
        state = {}
    if not dry_run:
        state["last_run_at"] = run["started_at"]
        state["run_count"] = int(state.get("run_count") or 0) + 1
    state["last_report_path"] = str(report_dir)
    state["last_run_summary"] = (
        f"{'dry-run ' if dry_run else ''}checked={transitions['checked']} "
        f"stale={len(transitions['marked_stale'])} "
        f"archived={len(transitions['archived'])} "
        f"reactivated={len(transitions['reactivated'])} "
        f"clusters={len(cluster_review['clusters'])} "
        f"invalid_consolidations={len(reconciliation['invalid_consolidations'])}"
    )
    atomic_write_json(curation_state_path(), state)
    run["report_path"] = str(report_dir)
    return {"success": True, **run}
