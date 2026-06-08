"""Portable session state for mem checklist and recovery workflows."""

from __future__ import annotations

import json
import os
import re
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
STATUS_PENDING = "pending"
STATUS_DONE = "done"
STATUS_SKIPPED = "skipped"
VALID_CHECKLIST_STATUSES = {STATUS_PENDING, STATUS_DONE, STATUS_SKIPPED}
ACCESS_PATH_SEEN = "path_seen"
ACCESS_CONTENT_READ = "content_read"
VALID_DOC_ACCESS = {ACCESS_PATH_SEEN, ACCESS_CONTENT_READ}
VERIFICATION_NOT_RUN = "not_run"
VERIFICATION_RUNNING = "running"
VERIFICATION_PASSED = "passed"
VERIFICATION_FAILED = "failed"
VERIFICATION_ERROR = "error"
VALID_VERIFICATION_STATUSES = {
    VERIFICATION_NOT_RUN,
    VERIFICATION_RUNNING,
    VERIFICATION_PASSED,
    VERIFICATION_FAILED,
    VERIFICATION_ERROR,
}
VERIFICATION_STATUS_ALIASES = {
    "검증전": VERIFICATION_NOT_RUN,
    "검증중": VERIFICATION_RUNNING,
    "통과": VERIFICATION_PASSED,
    "실패": VERIFICATION_FAILED,
    "에러": VERIFICATION_ERROR,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_session_id(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return "default"
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", raw)
    return cleaned[:160] or "default"


def resolve_session_id(value: str | None = None) -> str:
    sid = safe_session_id(value or os.environ.get("CODEX_THREAD_ID") or os.environ.get("MEM_SESSION_ID"))
    if sid == "default":
        raise ValueError("session id is required; pass --session-id or set CODEX_THREAD_ID/MEM_SESSION_ID")
    return sid


def resolve_state_path(
    *,
    session_id: str | None = None,
    cwd: str | Path | None = None,
) -> Path:
    sid = resolve_session_id(session_id)
    base = Path(cwd or ".")
    return base / ".mem" / "session-state" / f"{sid}.json"


def new_state(session_id: str | None = None, *, goal: str = "") -> dict[str, Any]:
    now = utc_now()
    return {
        "schema_version": SCHEMA_VERSION,
        "session_id": safe_session_id(session_id),
        "goal": goal,
        "updated_at": now,
        "verification_status": VERIFICATION_NOT_RUN,
        "verification_updated_at": "",
        "verification_report_path": "",
        "referenced_docs": [],
        "checklist": {
            "current_item_id": None,
            "items": [],
        },
        "external_checks": {
            "verification_agent": {
                "required": True,
                "called": False,
                "evidence": "",
                "updated_at": "",
            }
        },
    }


def load_state(path: str | Path, *, session_id: str | None = None) -> dict[str, Any]:
    p = Path(path)
    resolved_session_id = session_id or p.stem
    if not p.exists():
        return new_state(resolved_session_id)
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("session state must be a JSON object")
    return normalize_state(data, session_id=resolved_session_id)


def save_state(state: dict[str, Any], path: str | Path) -> dict[str, Any]:
    normalized = normalize_state(state)
    normalized["updated_at"] = utc_now()
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(normalized, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return normalized


def normalize_state(state: dict[str, Any], *, session_id: str | None = None) -> dict[str, Any]:
    result = deepcopy(state)
    result["schema_version"] = SCHEMA_VERSION
    result["session_id"] = safe_session_id(result.get("session_id") or session_id)
    result.setdefault("goal", "")
    result.setdefault("updated_at", utc_now())
    result["verification_status"] = normalize_verification_status(result.get("verification_status"))
    result["verification_updated_at"] = str(result.get("verification_updated_at") or "")
    result["verification_report_path"] = str(result.get("verification_report_path") or "")
    result["referenced_docs"] = _normalize_docs(result.get("referenced_docs", []))

    checklist = result.get("checklist")
    if not isinstance(checklist, dict):
        checklist = {}
    checklist.setdefault("current_item_id", None)
    checklist["items"] = [_normalize_item(item) for item in checklist.get("items", []) if isinstance(item, dict)]
    result["checklist"] = checklist

    external = result.get("external_checks")
    if not isinstance(external, dict):
        external = {}
    verification = external.get("verification_agent")
    if not isinstance(verification, dict):
        verification = {}
    verification.setdefault("required", True)
    verification.setdefault("called", False)
    verification.setdefault("evidence", "")
    verification.setdefault("updated_at", "")
    verification["required"] = bool(verification["required"])
    verification["called"] = bool(verification["called"])
    external["verification_agent"] = verification
    result["external_checks"] = external
    return result


def _normalize_docs(docs: Any) -> list[dict[str, Any]]:
    if not isinstance(docs, list):
        return []
    merged: dict[str, dict[str, Any]] = {}
    for doc in docs:
        if not isinstance(doc, dict):
            continue
        path = str(doc.get("path") or "").strip()
        if not path:
            continue
        access = str(doc.get("access") or ACCESS_PATH_SEEN)
        if access != ACCESS_CONTENT_READ:
            continue
        merge_referenced_doc(
            merged,
            {
                "path": path,
                "last_read_at": str(doc.get("last_read_at") or ""),
                "access": access,
                "operation": str(doc.get("operation") or ""),
                "read_count": int(doc.get("read_count") or 1),
                "turn_id": str(doc.get("turn_id") or ""),
            },
        )
    return sorted(merged.values(), key=lambda item: item["path"])


def _normalize_item(item: dict[str, Any]) -> dict[str, Any]:
    status = str(item.get("status") or STATUS_PENDING)
    if status not in VALID_CHECKLIST_STATUSES:
        raise ValueError(f"invalid checklist status: {status}")
    return {
        "id": str(item.get("id") or new_item_id()),
        "phase": str(item.get("phase") or ""),
        "text": str(item.get("text") or ""),
        "status": status,
        "done_condition": str(item.get("done_condition") or ""),
        "evidence": str(item.get("evidence") or ""),
        "updated_at": str(item.get("updated_at") or utc_now()),
    }


def new_item_id() -> str:
    return f"item-{uuid.uuid4().hex[:12]}"


def normalize_verification_status(status: Any) -> str:
    value = str(status or VERIFICATION_NOT_RUN).strip()
    value = VERIFICATION_STATUS_ALIASES.get(value, value)
    if value not in VALID_VERIFICATION_STATUSES:
        raise ValueError(f"invalid verification status: {value}")
    return value


def merge_referenced_doc(target: dict[str, dict[str, Any]], incoming: dict[str, Any]) -> None:
    path = str(incoming.get("path") or "").strip()
    if not path:
        return
    access = str(incoming.get("access") or ACCESS_PATH_SEEN)
    if access != ACCESS_CONTENT_READ:
        return
    read_count = int(incoming.get("read_count") or 1)
    if path not in target:
        target[path] = {
            "path": path,
            "last_read_at": str(incoming.get("last_read_at") or utc_now()),
            "access": access,
            "operation": str(incoming.get("operation") or ""),
            "read_count": max(1, read_count),
            "turn_id": str(incoming.get("turn_id") or ""),
        }
        return

    existing = target[path]
    last_read_at = str(incoming.get("last_read_at") or "")
    existing_last_read_at = str(existing.get("last_read_at") or "")
    if last_read_at and existing_last_read_at and last_read_at <= existing_last_read_at:
        return

    existing["read_count"] = int(existing.get("read_count") or 0) + max(1, read_count)
    if last_read_at and last_read_at > existing_last_read_at:
        existing["last_read_at"] = last_read_at
        existing["operation"] = str(incoming.get("operation") or existing.get("operation") or "")
        existing["turn_id"] = str(incoming.get("turn_id") or existing.get("turn_id") or "")
    if existing.get("access") != ACCESS_CONTENT_READ and access == ACCESS_CONTENT_READ:
        existing["access"] = ACCESS_CONTENT_READ


def merge_referenced_docs(state: dict[str, Any], docs: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = normalize_state(state)
    merged = {doc["path"]: dict(doc) for doc in normalized["referenced_docs"]}
    for doc in docs:
        merge_referenced_doc(merged, doc)
    normalized["referenced_docs"] = sorted(merged.values(), key=lambda item: item["path"])
    normalized["updated_at"] = utc_now()
    return normalized


def filter_referenced_docs_by_include_paths(docs: list[dict[str, Any]], include_paths: list[str]) -> list[dict[str, Any]]:
    prefixes = [_normalize_include_path(path) for path in include_paths]
    prefixes = [path for path in prefixes if path]
    if not prefixes:
        return docs
    return [doc for doc in docs if _path_is_included(str(doc.get("path") or ""), prefixes)]


def filter_state_referenced_docs_by_include_paths(state: dict[str, Any], include_paths: list[str]) -> dict[str, Any]:
    normalized = normalize_state(state)
    normalized["referenced_docs"] = filter_referenced_docs_by_include_paths(normalized["referenced_docs"], include_paths)
    return normalized


def _normalize_include_path(path: str) -> str:
    normalized = str(path or "").strip().replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.strip("/")


def _path_is_included(path: str, prefixes: list[str]) -> bool:
    normalized = _normalize_include_path(path)
    return any(normalized == prefix or normalized.startswith(f"{prefix}/") for prefix in prefixes)


def set_goal(state: dict[str, Any], goal: str) -> dict[str, Any]:
    normalized = normalize_state(state)
    normalized["goal"] = goal
    normalized["updated_at"] = utc_now()
    return normalized


def list_docs(state: dict[str, Any]) -> list[dict[str, Any]]:
    return normalize_state(state)["referenced_docs"]


def get_verification_status(state: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_state(state)
    return {
        "verification_status": normalized["verification_status"],
        "verification_updated_at": normalized["verification_updated_at"],
        "verification_report_path": normalized["verification_report_path"],
    }


def set_verification_status(
    state: dict[str, Any],
    status: str,
    *,
    report_path: str | None = None,
) -> dict[str, Any]:
    normalized = normalize_state(state)
    normalized["verification_status"] = normalize_verification_status(status)
    normalized["verification_updated_at"] = utc_now()
    if report_path is not None:
        normalized["verification_report_path"] = str(report_path)
    normalized["updated_at"] = utc_now()
    return normalized
