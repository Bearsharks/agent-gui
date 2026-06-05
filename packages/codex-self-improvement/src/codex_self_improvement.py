#!/usr/bin/env python3
"""Codex global self-improvement runtime.

Provides:
- MCP tools: skill_list, skill_view, skill_manage
- Codex hooks: SessionStart, UserPromptSubmit

The implementation is intentionally stdlib-only so it can run from Codex hooks
without a project virtualenv.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import sys
import tempfile
import textwrap
import uuid
from pathlib import Path
from typing import Any, Callable

from codex_self_improvement_curation import run_curation
from codex_self_improvement_review import run_review


STATE_VERSION = 1
MAX_CONTEXT_CHARS = 12000
VALID_SKILL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
ALLOWED_SUPPORT_DIRS = {"references", "templates", "scripts", "assets"}


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")


def root_dir() -> Path:
    return codex_home() / "self-improvement"


def skills_dir() -> Path:
    return root_dir() / "skills"


def archive_dir() -> Path:
    return skills_dir() / ".archive"


def logs_dir() -> Path:
    return root_dir() / "logs"


def reviews_dir() -> Path:
    return root_dir() / "reviews"


def session_state_dir() -> Path:
    return root_dir() / "session-state"


def usage_path() -> Path:
    return skills_dir() / ".usage.json"


def state_path() -> Path:
    return root_dir() / "state.json"


def changes_path() -> Path:
    return root_dir() / "changes.jsonl"


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def ensure_layout() -> None:
    for p in (skills_dir(), archive_dir(), logs_dir(), reviews_dir(), session_state_dir()):
        p.mkdir(parents=True, exist_ok=True)
    if not state_path().exists():
        atomic_write_json(state_path(), {"version": STATE_VERSION, "next_change_seq": 1})
    if not usage_path().exists():
        atomic_write_json(usage_path(), {})


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


def append_jsonl(path: Path, obj: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False, sort_keys=True) + "\n")


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_.-]+", "-", name.strip().lower()).strip("-._")
    return slug or f"skill-{uuid.uuid4().hex[:8]}"


def validate_skill_name(name: str) -> str | None:
    if not name:
        return "name is required"
    if len(name) > 64:
        return "name exceeds 64 characters"
    if not VALID_SKILL_NAME_RE.match(name):
        return "name must use lowercase letters, numbers, hyphens, underscores, or dots and start with a letter or digit"
    return None


def validate_support_file_path(file_path: str) -> str | None:
    if not file_path:
        return "file_path is required"
    candidate = Path(file_path)
    if candidate.is_absolute() or ".." in candidate.parts:
        return "file_path must be relative and may not contain '..'"
    if not candidate.parts or candidate.parts[0] not in ALLOWED_SUPPORT_DIRS:
        allowed = ", ".join(sorted(ALLOWED_SUPPORT_DIRS))
        return f"file_path must be under one of: {allowed}"
    if len(candidate.parts) < 2:
        return "file_path must include a file name under the support directory"
    return None


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


def validate_skill_doc(text: str) -> str | None:
    fm, body = parse_frontmatter(text)
    if not fm:
        return "SKILL.md must start with frontmatter"
    if not fm.get("name"):
        return "frontmatter must include name"
    if validate_skill_name(fm.get("name", "")):
        return f"invalid frontmatter name: {validate_skill_name(fm.get('name', ''))}"
    if not fm.get("description"):
        return "frontmatter must include description"
    if not body.strip():
        return "SKILL.md body must not be empty"
    return None


def validate_skill_doc_for_name(text: str, expected_name: str) -> str | None:
    validation_error = validate_skill_doc(text)
    if validation_error:
        return validation_error
    fm, _body = parse_frontmatter(text)
    if fm.get("name") != expected_name:
        return f"frontmatter name must match target skill name '{expected_name}'"
    return None


def render_skill_doc(
    *,
    name: str,
    description: str,
    purpose: str,
    body: str,
    skill_id: str | None = None,
    version: int = 1,
    created_by: str = "agent",
    absorbed_into: str | None = None,
) -> str:
    skill_id = skill_id or str(uuid.uuid4())
    purpose_hash = hash_purpose(purpose or description or body[:200])
    lines = [
        "---",
        f"name: {name}",
        f"description: {description or purpose or 'Codex self-improvement skill.'}",
        f"id: {skill_id}",
        f"version: {version}",
        f"created_by: {created_by}",
        f"purpose: {purpose or description or ''}",
        f"purpose_hash: {purpose_hash}",
    ]
    if absorbed_into:
        lines.append(f"absorbed_into: {absorbed_into}")
    lines.extend(["---", "", body.strip(), ""])
    return "\n".join(lines)


def hash_purpose(text: str) -> str:
    return hashlib.sha256((text or "").strip().encode("utf-8")).hexdigest()[:16]


def hash_content(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def iter_skill_files(include_archived: bool = False) -> list[Path]:
    ensure_layout()
    roots = [skills_dir()]
    if include_archived:
        roots.append(archive_dir())
    files: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("SKILL.md"):
            if any(part in {".archive", ".hub", ".git", "__pycache__"} for part in path.parts):
                if not include_archived or ".archive" not in path.parts:
                    continue
            files.append(path)
    return sorted(files)


def find_skill(name_or_id: str, *, include_archived: bool = False) -> Path | None:
    wanted = (name_or_id or "").strip()
    if not wanted:
        return None
    direct = skills_dir() / slugify(wanted) / "SKILL.md"
    if direct.exists():
        return direct
    for path in iter_skill_files(include_archived=include_archived):
        fm, _body = parse_frontmatter(path.read_text(encoding="utf-8", errors="replace"))
        if wanted in {fm.get("name"), fm.get("id"), path.parent.name}:
            return path
    return None


def load_usage() -> dict[str, dict[str, Any]]:
    ensure_layout()
    data = read_json(usage_path(), {})
    return data if isinstance(data, dict) else {}


def save_usage(data: dict[str, dict[str, Any]]) -> None:
    atomic_write_json(usage_path(), data)


def empty_record(*, created_by: str = "agent") -> dict[str, Any]:
    return {
        "created_by": created_by,
        "use_count": 0,
        "view_count": 0,
        "patch_count": 0,
        "last_used_at": None,
        "last_viewed_at": None,
        "last_patched_at": None,
        "last_activity_at": None,
        "created_at": now_iso(),
        "state": "active",
        "pinned": False,
        "archived_at": None,
    }


def mutate_usage(name: str, fn: Callable[[dict[str, Any]], None]) -> None:
    data = load_usage()
    rec = data.get(name)
    if not isinstance(rec, dict):
        rec = empty_record()
    fn(rec)
    data[name] = rec
    save_usage(data)


def bump(name: str, kind: str) -> None:
    def _apply(rec: dict[str, Any]) -> None:
        ts = now_iso()
        if kind == "view":
            rec["view_count"] = int(rec.get("view_count") or 0) + 1
            rec["last_viewed_at"] = ts
        elif kind == "use":
            rec["use_count"] = int(rec.get("use_count") or 0) + 1
            rec["last_used_at"] = ts
        elif kind == "patch":
            rec["patch_count"] = int(rec.get("patch_count") or 0) + 1
            rec["last_patched_at"] = ts
        rec["last_activity_at"] = ts

    mutate_usage(name, _apply)


def set_agent_created(name: str) -> None:
    mutate_usage(name, lambda rec: rec.update({"created_by": "agent", "last_activity_at": now_iso()}))


def set_created_by(name: str, created_by: str) -> None:
    created_by = "user" if created_by == "user" else "agent"
    mutate_usage(name, lambda rec: rec.update({"created_by": created_by, "last_activity_at": now_iso()}))


def read_state() -> dict[str, Any]:
    ensure_layout()
    state = read_json(state_path(), {})
    if not isinstance(state, dict):
        state = {}
    state.setdefault("version", STATE_VERSION)
    state.setdefault("next_change_seq", 1)
    return state


def record_change(action: str, name: str, *, summary: str, version: int | None = None, absorbed_into: str | None = None) -> dict[str, Any]:
    state = read_state()
    seq = int(state.get("next_change_seq") or 1)
    state["next_change_seq"] = seq + 1
    atomic_write_json(state_path(), state)
    change = {
        "seq": seq,
        "ts": now_iso(),
        "action": action,
        "name": name,
        "version": version,
        "absorbed_into": absorbed_into,
        "summary": summary,
    }
    append_jsonl(changes_path(), change)
    return change


def read_changes_after(seq: int) -> list[dict[str, Any]]:
    if not changes_path().exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in changes_path().read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if int(row.get("seq") or 0) > seq:
            rows.append(row)
    return rows


def skill_summary_from_file(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    fm, body = parse_frontmatter(text)
    usage = load_usage().get(fm.get("name") or path.parent.name, {})
    archived = ".archive" in path.parts
    return {
        "name": fm.get("name") or path.parent.name,
        "id": fm.get("id"),
        "description": fm.get("description", ""),
        "purpose": fm.get("purpose", ""),
        "purpose_hash": fm.get("purpose_hash") or hash_purpose(fm.get("purpose", "")),
        "version": int(fm.get("version") or 1),
        "created_by": fm.get("created_by") or usage.get("created_by") or "agent",
        "state": "archived" if archived else usage.get("state", "active"),
        "absorbed_into": fm.get("absorbed_into"),
        "pinned": bool(usage.get("pinned", False)),
        "path": str(path),
        "content_hash": hash_content(text),
        "body_preview": " ".join(body.strip().split())[:240],
    }


def list_skills(*, include_archived: bool = False, agent_created_only: bool = True) -> dict[str, Any]:
    rows = []
    usage = load_usage()
    for path in iter_skill_files(include_archived=include_archived):
        row = skill_summary_from_file(path)
        rec = usage.get(row["name"], {})
        if agent_created_only and not (row.get("created_by") == "agent" or rec.get("created_by") == "agent"):
            continue
        row.update(
            {
                "use_count": int(rec.get("use_count") or 0),
                "view_count": int(rec.get("view_count") or 0),
                "patch_count": int(rec.get("patch_count") or 0),
                "last_used_at": rec.get("last_used_at"),
                "last_viewed_at": rec.get("last_viewed_at"),
                "last_patched_at": rec.get("last_patched_at"),
                "last_activity_at": rec.get("last_activity_at"),
                "archived_at": rec.get("archived_at"),
            }
        )
        rows.append(row)
    return {"success": True, "skills": rows, "count": len(rows)}


def view_skill(name: str, *, file_path: str | None = None, expected_version: int | None = None, expected_purpose_hash: str | None = None) -> dict[str, Any]:
    path = find_skill(name, include_archived=False)
    if path is None:
        archived = find_skill(name, include_archived=True)
        result: dict[str, Any] = {
            "success": False,
            "error": f"Skill '{name}' not found in active skills.",
            "available": [s["name"] for s in list_skills(agent_created_only=True)["skills"][:20]],
        }
        if archived is not None:
            fm, _ = parse_frontmatter(archived.read_text(encoding="utf-8", errors="replace"))
            result["archived"] = True
            result["absorbed_into"] = fm.get("absorbed_into")
            result["hint"] = "This skill was archived. Load absorbed_into if present, otherwise inspect active skills."
        return result

    skill_dir = path.parent
    text_path = path
    if file_path:
        candidate = (skill_dir / file_path).resolve()
        try:
            candidate.relative_to(skill_dir.resolve())
        except ValueError:
            return {"success": False, "error": "file_path escapes the skill directory"}
        if not candidate.exists() or not candidate.is_file():
            return {"success": False, "error": f"File '{file_path}' not found in skill '{name}'."}
        text_path = candidate

    text = text_path.read_text(encoding="utf-8", errors="replace")
    fm, _body = parse_frontmatter(path.read_text(encoding="utf-8", errors="replace"))
    skill_name = fm.get("name") or path.parent.name
    bump(skill_name, "view")
    bump(skill_name, "use")
    current_version = int(fm.get("version") or 1)
    current_purpose_hash = fm.get("purpose_hash") or hash_purpose(fm.get("purpose", ""))
    warnings: list[str] = []
    if expected_version is not None and expected_version != current_version:
        warnings.append(f"version changed: expected {expected_version}, current {current_version}")
    if expected_purpose_hash and expected_purpose_hash != current_purpose_hash:
        warnings.append(
            f"purpose hash changed: expected {expected_purpose_hash}, current {current_purpose_hash}"
        )
    supporting = []
    for sub in ("references", "templates", "scripts", "assets"):
        d = skill_dir / sub
        if d.exists():
            supporting.extend(str(p.relative_to(skill_dir)) for p in sorted(d.rglob("*")) if p.is_file())
    return {
        "success": True,
        "name": skill_name,
        "id": fm.get("id"),
        "version": current_version,
        "purpose": fm.get("purpose", ""),
        "purpose_hash": current_purpose_hash,
        "path": str(path),
        "file": file_path or "SKILL.md",
        "content": text,
        "supporting_files": supporting,
        "warnings": warnings,
    }


def increment_version_in_text(text: str) -> tuple[str, int]:
    fm, body = parse_frontmatter(text)
    current = int(fm.get("version") or 1)
    new_version = current + 1
    fm["version"] = str(new_version)
    purpose = fm.get("purpose") or fm.get("description") or ""
    fm["purpose_hash"] = hash_purpose(purpose)
    lines = ["---"] + [f"{k}: {v}" for k, v in fm.items()] + ["---", "", body.strip(), ""]
    return "\n".join(lines), new_version


def validate_expected_identity(path: Path, args: dict[str, Any]) -> str | None:
    expected_version = args.get("expected_version")
    expected_purpose_hash = args.get("expected_purpose_hash")
    if expected_version is None and not expected_purpose_hash:
        return None
    fm, _body = parse_frontmatter(path.read_text(encoding="utf-8", errors="replace"))
    current_version = int(fm.get("version") or 1)
    current_purpose_hash = fm.get("purpose_hash") or hash_purpose(fm.get("purpose", ""))
    if expected_version is not None and int(expected_version) != current_version:
        return f"version changed: expected {expected_version}, current {current_version}; reload with skill_view"
    if expected_purpose_hash and str(expected_purpose_hash) != current_purpose_hash:
        return (
            f"purpose hash changed: expected {expected_purpose_hash}, "
            f"current {current_purpose_hash}; reload with skill_view"
        )
    return None


def manage_skill(args: dict[str, Any]) -> dict[str, Any]:
    ensure_layout()
    action = str(args.get("action") or "").strip()
    name = str(args.get("name") or "").strip()
    if not action:
        return {"success": False, "error": "action is required"}
    if action not in {"create", "edit", "patch", "write_file"}:
        return {"success": False, "error": f"unsupported action: {action}"}
    name_error = validate_skill_name(name)
    if name_error:
        return {"success": False, "error": name_error}

    if action == "create":
        if find_skill(name):
            return {"success": False, "error": f"skill '{name}' already exists"}
        body = str(args.get("content") or "").strip()
        if not body:
            return {"success": False, "error": "content is required for create"}
        description = str(args.get("description") or "").strip()
        purpose = str(args.get("purpose") or description).strip()
        created_by = str(args.get("created_by") or "agent").strip()
        doc = body if body.startswith("---\n") else render_skill_doc(
            name=name,
            description=description,
            purpose=purpose,
            body=body,
            created_by=created_by,
        )
        validation_error = validate_skill_doc_for_name(doc, name)
        if validation_error:
            return {"success": False, "error": validation_error}
        target = skills_dir() / slugify(name) / "SKILL.md"
        atomic_write_text(target, doc)
        set_created_by(name, created_by)
        version = int(parse_frontmatter(doc)[0].get("version") or 1)
        change = record_change("create", name, summary=f"Created skill '{name}'.", version=version)
        return {"success": True, "message": "created", "path": str(target), "change": change}

    path = find_skill(name)
    if path is None:
        return {"success": False, "error": f"skill '{name}' not found"}
    identity_error = validate_expected_identity(path, args)
    if identity_error:
        return {"success": False, "error": identity_error}

    if action == "edit":
        content = str(args.get("content") or "").strip()
        if not content:
            return {"success": False, "error": "content is required for edit"}
        current_fm, _ = parse_frontmatter(path.read_text(encoding="utf-8", errors="replace"))
        if not content.startswith("---\n"):
            content = render_skill_doc(
                name=current_fm.get("name") or name,
                description=str(args.get("description") or current_fm.get("description") or ""),
                purpose=str(args.get("purpose") or current_fm.get("purpose") or ""),
                body=content,
                skill_id=current_fm.get("id"),
                version=int(current_fm.get("version") or 1) + 1,
                created_by=current_fm.get("created_by") or "agent",
            )
            version = int(parse_frontmatter(content)[0].get("version") or 1)
        else:
            content, version = increment_version_in_text(content)
        validation_error = validate_skill_doc_for_name(content, name)
        if validation_error:
            return {"success": False, "error": validation_error}
        atomic_write_text(path, content)
        bump(name, "patch")
        change = record_change("edit", name, summary=f"Edited skill '{name}'.", version=version)
        return {"success": True, "message": "edited", "path": str(path), "change": change}

    if action == "patch":
        find = str(args.get("find") or "")
        replace = str(args.get("replace") or "")
        if not find:
            return {"success": False, "error": "find is required for patch"}
        text = path.read_text(encoding="utf-8", errors="replace")
        if find not in text:
            return {"success": False, "error": "find text not present"}
        text = text.replace(find, replace, 1)
        text, version = increment_version_in_text(text)
        validation_error = validate_skill_doc_for_name(text, name)
        if validation_error:
            return {"success": False, "error": validation_error}
        atomic_write_text(path, text)
        bump(name, "patch")
        change = record_change("patch", name, summary=f"Patched skill '{name}'.", version=version)
        return {"success": True, "message": "patched", "path": str(path), "change": change}

    if action == "write_file":
        file_path = str(args.get("file_path") or "").strip()
        content = str(args.get("file_content") or args.get("content") or "")
        path_error = validate_support_file_path(file_path)
        if path_error:
            return {"success": False, "error": path_error}
        target = (path.parent / file_path).resolve()
        try:
            target.relative_to(path.parent.resolve())
        except ValueError:
            return {"success": False, "error": "file_path escapes the skill directory"}
        atomic_write_text(target, content)
        text, version = increment_version_in_text(path.read_text(encoding="utf-8", errors="replace"))
        atomic_write_text(path, text)
        bump(name, "patch")
        change = record_change("write_file", name, summary=f"Wrote {file_path} in skill '{name}'.", version=version)
        return {"success": True, "message": "file written", "path": str(target), "change": change}

    return {"success": False, "error": "unhandled action"}


def session_file(session_id: str) -> Path:
    return session_state_dir() / f"{re.sub(r'[^a-zA-Z0-9_.-]', '_', session_id)}.json"


def compact_skill_index(*, include_archived: bool = True) -> list[dict[str, Any]]:
    rows = list_skills(include_archived=include_archived, agent_created_only=True)["skills"]
    out: list[dict[str, Any]] = []
    for row in sorted(rows, key=lambda r: str(r.get("name", ""))):
        out.append({
            "name": row.get("name"),
            "description": row.get("description", ""),
            "version": row.get("version"),
            "purpose_hash": row.get("purpose_hash"),
            "state": row.get("state", "active"),
            "absorbed_into": row.get("absorbed_into"),
            "pinned": bool(row.get("pinned", False)),
            "created_by": row.get("created_by", "agent"),
            "content_hash": row.get("content_hash"),
            "path": row.get("path"),
        })
    return out


def summarize_index_diff(previous: list[dict[str, Any]], current: list[dict[str, Any]]) -> list[str]:
    prev = {str(row.get("name")): row for row in previous if row.get("name")}
    cur = {str(row.get("name")): row for row in current if row.get("name")}
    lines: list[str] = []

    for name in sorted(cur.keys() - prev.keys()):
        row = cur[name]
        lines.append(
            f"- added {name} v{row.get('version')} [{row.get('purpose_hash')}]: {row.get('description', '')}"
        )

    for name in sorted(prev.keys() - cur.keys()):
        old = prev[name]
        absorbed = f"; absorbed_into={old.get('absorbed_into')}" if old.get("absorbed_into") else ""
        lines.append(f"- removed from index {name}{absorbed}; call skill_list(include_archived=true) before assuming it is gone.")

    for name in sorted(prev.keys() & cur.keys()):
        old = prev[name]
        new = cur[name]
        changes: list[str] = []
        for key in ("version", "purpose_hash", "description", "state", "absorbed_into", "pinned", "content_hash"):
            if old.get(key) != new.get(key):
                changes.append(f"{key}: {old.get(key)} -> {new.get(key)}")
        if changes:
            lines.append(f"- changed {name}: " + "; ".join(changes))

    return lines


def build_skill_index_context() -> str:
    rows = compact_skill_index(include_archived=False)
    if not rows:
        return textwrap.dedent(
            """
            <codex_self_improvement>
            No agent-created Codex self-improvement skills are currently registered.
            You may use the skill_list and skill_view MCP tools when they are available.
            Create or update durable, class-level skills with skill_manage only when a workflow is likely to recur.
            </codex_self_improvement>
            """
        ).strip()
    lines = [
        "<codex_self_improvement>",
        "Agent-created skills available for progressive loading:",
    ]
    for row in rows[:80]:
        lines.append(
            f"- {row['name']} v{row['version']} [{row['purpose_hash']}]: "
            f"{row.get('description') or row.get('purpose') or ''}"
        )
    if len(rows) > 80:
        lines.append(f"- ... {len(rows) - 80} more skills omitted; call skill_list.")
    lines.extend(
        [
            "Rules:",
            "- If a listed skill may apply, call skill_view before relying on it.",
            "- Treat name+version+purpose_hash as the identity guard; reload if it changed.",
            "- Use skill_manage only for durable skill creation, editing, patching, and support-file writes.",
            "- Skill curation, consolidation, and archive are handled outside MCP by the curation workflow.",
            "</codex_self_improvement>",
        ]
    )
    return "\n".join(lines)


def hook_output(event: str, additional_context: str | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {"continue": True, "suppressOutput": True}
    if additional_context:
        out["hookSpecificOutput"] = {
            "hookEventName": event,
            "additionalContext": additional_context[:MAX_CONTEXT_CHARS],
        }
    return out


def read_hook_input() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def handle_session_start(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_layout()
    session_id = str(payload.get("session_id") or "unknown")
    index = compact_skill_index(include_archived=True)
    atomic_write_json(
        session_file(session_id),
        {
            "session_id": session_id,
            "skill_index": index,
            "last_seen_at": now_iso(),
        },
    )
    return hook_output("SessionStart", build_skill_index_context())


def handle_user_prompt_submit(payload: dict[str, Any]) -> dict[str, Any]:
    ensure_layout()
    session_id = str(payload.get("session_id") or "unknown")
    sf = session_file(session_id)
    state = read_json(sf, {}) if sf.exists() else {}
    previous = state.get("skill_index") if isinstance(state.get("skill_index"), list) else []
    current = compact_skill_index(include_archived=True)
    diff_lines = summarize_index_diff(previous, current)
    state.update({"session_id": session_id, "skill_index": current, "last_seen_at": now_iso()})
    atomic_write_json(sf, state)
    if not diff_lines:
        return hook_output("UserPromptSubmit")
    lines = [
        "<codex_self_improvement_skill_changes>",
        "The Codex self-improvement skill index changed since this session last saw it.",
        "Before using a changed skill, call skill_view and verify version/purpose_hash.",
    ]
    lines.extend(diff_lines[-40:])
    lines.append("</codex_self_improvement_skill_changes>")
    return hook_output("UserPromptSubmit", "\n".join(lines))


TOOLS: list[dict[str, Any]] = [
    {
        "name": "skill_list",
        "description": "List Codex self-improvement skills.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "include_archived": {"type": "boolean"},
                "agent_created_only": {"type": "boolean"},
            },
        },
    },
    {
        "name": "skill_view",
        "description": "Load a Codex self-improvement skill or one of its linked files.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "file_path": {"type": "string"},
                "expected_version": {"type": "integer"},
                "expected_purpose_hash": {"type": "string"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "skill_manage",
        "description": "Create, patch, edit, or write support files for Codex self-improvement skills.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["create", "edit", "patch", "write_file"],
                },
                "name": {"type": "string"},
                "description": {"type": "string"},
                "purpose": {"type": "string"},
                "content": {"type": "string"},
                "find": {"type": "string"},
                "replace": {"type": "string"},
                "file_path": {"type": "string"},
                "file_content": {"type": "string"},
                "created_by": {"type": "string", "enum": ["agent", "user"]},
                "expected_version": {"type": "integer"},
                "expected_purpose_hash": {"type": "string"},
            },
            "required": ["action", "name"],
        },
    },
]


def call_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "skill_list":
        return list_skills(
            include_archived=bool(args.get("include_archived", False)),
            agent_created_only=bool(args.get("agent_created_only", True)),
        )
    if name == "skill_view":
        return view_skill(
            str(args.get("name") or ""),
            file_path=args.get("file_path"),
            expected_version=args.get("expected_version"),
            expected_purpose_hash=args.get("expected_purpose_hash"),
        )
    if name == "skill_manage":
        return manage_skill(args)
    return {"success": False, "error": f"unknown tool: {name}"}


def run_curate_command(args: argparse.Namespace) -> None:
    result = run_curation(
        dry_run=not bool(args.apply),
        stale_after_days=int(args.stale_after_days),
        archive_after_days=int(args.archive_after_days),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


def run_review_command(args: argparse.Namespace) -> None:
    if args.transcript:
        transcript = Path(args.transcript).read_text(encoding="utf-8", errors="replace")
    else:
        transcript = sys.stdin.read()
    result = run_review(transcript)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


def mcp_respond(req_id: Any, result: Any = None, error: Any = None) -> None:
    msg: dict[str, Any] = {"jsonrpc": "2.0", "id": req_id}
    if error is not None:
        msg["error"] = error
    else:
        msg["result"] = result
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def run_mcp() -> None:
    ensure_layout()
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        method = req.get("method")
        req_id = req.get("id")
        if method == "initialize":
            mcp_respond(req_id, {
                "protocolVersion": "2025-06-18",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "codex-self-improvement", "version": "0.1.0"},
            })
        elif method == "notifications/initialized":
            continue
        elif method == "tools/list":
            mcp_respond(req_id, {"tools": TOOLS})
        elif method == "tools/call":
            params = req.get("params") or {}
            name = params.get("name")
            args = params.get("arguments") or {}
            result = call_tool(str(name), args if isinstance(args, dict) else {})
            mcp_respond(req_id, {
                "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}],
                "structuredContent": result,
                "isError": not bool(result.get("success", True)),
            })
        elif method in {"resources/list", "prompts/list"}:
            key = "resources" if method == "resources/list" else "prompts"
            mcp_respond(req_id, {key: []})
        else:
            if req_id is not None:
                mcp_respond(req_id, error={"code": -32601, "message": f"Method not found: {method}"})


def run_hook(event: str) -> None:
    try:
        payload = read_hook_input()
        if event == "session-start":
            out = handle_session_start(payload)
        elif event == "user-prompt-submit":
            out = handle_user_prompt_submit(payload)
        else:
            out = {"continue": True, "suppressOutput": True}
        sys.stdout.write(json.dumps(out, ensure_ascii=False))
    except Exception as exc:
        append_jsonl(logs_dir() / "hook-errors.jsonl", {"ts": now_iso(), "event": event, "error": str(exc)})
        sys.stdout.write(json.dumps({"continue": True, "suppressOutput": True}))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("mcp")
    hook = sub.add_parser("hook")
    hook.add_argument("event", choices=["session-start", "user-prompt-submit"])
    curate = sub.add_parser("curate")
    curate.add_argument("--apply", action="store_true", help="perform live curation; default is dry-run")
    curate.add_argument("--stale-after-days", type=int, default=30)
    curate.add_argument("--archive-after-days", type=int, default=90)
    review = sub.add_parser("review")
    review.add_argument("--transcript", help="completed session transcript path; reads stdin when omitted")
    sub.add_parser("init")
    args = parser.parse_args(argv)
    if args.cmd == "mcp":
        run_mcp()
    elif args.cmd == "hook":
        run_hook(args.event)
    elif args.cmd == "curate":
        run_curate_command(args)
    elif args.cmd == "review":
        run_review_command(args)
    elif args.cmd == "init":
        ensure_layout()
        print(json.dumps({"success": True, "root": str(root_dir())}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
