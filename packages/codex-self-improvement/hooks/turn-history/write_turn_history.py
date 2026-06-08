#!/usr/bin/env python3
"""Validate and append turn-history records for self-improvement evidence."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 2
DEFAULT_HISTORY_ROOT = "self-improvement/turn-history"
HOOK_OWNED_FIELDS = {"schema_version", "ts", "session_id", "turn_id", "cwd"}
CONTENT_FIELDS = (
    "user_intent",
    "user_decisions",
    "user_corrections",
    "memory_requests",
    "agent_workflow",
    "troubleshooting",
    "agent_issues",
    "successful_patterns",
    "lesson_candidate",
    "evidence",
)
ALLOWED_FIELDS = HOOK_OWNED_FIELDS | set(CONTENT_FIELDS)


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex").expanduser()


def safe_id(value: str) -> str:
    value = value.strip()
    value = re.sub(r"^rollout-", "", value)
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", value)
    return value[:160]


def resolve_history_root(history_root: str | None) -> Path:
    raw = (history_root or os.environ.get("AGENT_TURN_HISTORY_ROOT") or "").strip()
    if raw:
        path = Path(raw).expanduser()
        if not path.is_absolute():
            path = codex_home() / path
        return path.resolve()
    return (codex_home() / DEFAULT_HISTORY_ROOT).resolve()


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def response(ok: bool, **kwargs: Any) -> dict[str, Any]:
    payload = {"ok": ok}
    payload.update(kwargs)
    return payload


def error(field: str, message: str, repair_hint: str) -> dict[str, str]:
    return {"field": field, "message": message, "repair_hint": repair_hint}


def load_record(args: argparse.Namespace) -> dict[str, Any]:
    if args.record_json:
        data = json.loads(args.record_json)
    elif args.record_file:
        data = json.loads(Path(args.record_file).read_text(encoding="utf-8"))
    else:
        data = json.loads(sys.stdin.read() or "{}")
    if not isinstance(data, dict):
        raise ValueError("turn history record must be a JSON object")
    return data


def validate_content(record: dict[str, Any]) -> tuple[dict[str, str], list[dict[str, str]]]:
    errors: list[dict[str, str]] = []
    errors.extend(
        error(field, "unknown field", "Remove fields outside the turn-history schema.")
        for field in record
        if field not in ALLOWED_FIELDS
    )
    errors.extend(
        error(field, "hook-owned field is not accepted", f"Remove `{field}`; the append helper injects it.")
        for field in HOOK_OWNED_FIELDS
        if field in record
    )

    normalized: dict[str, str] = {}
    for field in CONTENT_FIELDS:
        value = record.get(field, "")
        if value is None:
            value = ""
        if not isinstance(value, str):
            errors.append(error(field, "must be a string", f"Set `{field}` to a string or empty string."))
            value = ""
        normalized[field] = value.strip()

    return normalized, errors


def append_turn_history(
    *,
    history_root: Path,
    session_id: str,
    turn_id: str,
    cwd: str,
    transcript_path: str,
    record: dict[str, Any],
    dry_run: bool,
) -> dict[str, Any]:
    safe_session = safe_id(session_id)
    if not safe_session:
        return response(False, errors=[error("session_id", "required non-empty session id", "Pass a stable session id.")])
    if not turn_id.strip():
        return response(False, errors=[error("turn_id", "required non-empty turn id", "Pass a stable turn id.")])

    content, errors = validate_content(record)
    if errors:
        return response(False, errors=errors, repair_hint="Fix the reported fields and retry. No turn history was appended.")

    session_dir = history_root / "sessions" / safe_session
    session_file = session_dir / "session.json"
    turns_file = session_dir / "turns.jsonl"
    ts = now_iso()
    session_record: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "session_id": safe_session,
        "created_at": ts,
        "cwd": cwd,
    }
    if transcript_path.strip():
        session_record["transcript_path"] = transcript_path.strip()

    full_record: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "ts": ts,
        "turn_id": turn_id.strip(),
    }
    for field in CONTENT_FIELDS:
        full_record[field] = content[field]

    if not dry_run:
        session_dir.mkdir(parents=True, exist_ok=True)
        if not session_file.exists():
            session_file.write_text(json.dumps(session_record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        with turns_file.open("a", encoding="utf-8") as f:
            f.write(json.dumps(full_record, ensure_ascii=False, separators=(",", ":")))
            f.write("\n")

    return response(
        True,
        appended=0 if dry_run else 1,
        record=full_record,
        session_file=display_path(session_file),
        turns_file=display_path(turns_file),
        dry_run=dry_run,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history-root", default="")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--turn-id", required=True)
    parser.add_argument("--cwd", default="")
    parser.add_argument("--transcript-path", default="")
    parser.add_argument("--record-json", default="")
    parser.add_argument("--record-file", default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        record = load_record(args)
    except Exception as exc:
        sys.stdout.write(
            json.dumps(
                response(False, errors=[error("input", f"invalid JSON input: {exc}", "Pass a valid JSON object.")]),
                ensure_ascii=False,
            )
            + "\n"
        )
        return 1

    result = append_turn_history(
        history_root=resolve_history_root(args.history_root),
        session_id=args.session_id,
        turn_id=args.turn_id,
        cwd=args.cwd,
        transcript_path=args.transcript_path,
        record=record,
        dry_run=args.dry_run,
    )
    sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2 if not result.get("ok") else None) + "\n")
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
