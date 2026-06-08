#!/usr/bin/env python3
"""Turn-history evidence helpers for Codex self-improvement review."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

IMPORTANT_TURN_HISTORY = {"high", "critical"}
CONTEXT_TURN_HISTORY = {"medium"}
VALID_TURN_HISTORY_IMPORTANCE = {"low", "medium", "high", "critical"}


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")


def turn_history_dir() -> Path:
    return codex_home() / "self-improvement" / "turn-history"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        with path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(value, dict):
                    rows.append(value)
    except FileNotFoundError:
        return []
    except Exception:
        return []
    return rows


def resolve_turn_history_file(*, session_id: str | None = None, file_path: str | Path | None = None) -> Path | None:
    if file_path:
        return Path(file_path).expanduser()
    if not session_id:
        return None
    safe_session = re.sub(r"[^A-Za-z0-9_.-]+", "-", session_id.strip())[:160]
    if not safe_session:
        return None
    return turn_history_dir() / "sessions" / safe_session / "turns.jsonl"


def load_turn_history(*, session_id: str | None = None, file_path: str | Path | None = None) -> list[dict[str, Any]]:
    path = resolve_turn_history_file(session_id=session_id, file_path=file_path)
    if path is None:
        return []
    return read_jsonl(path)


def turn_history_summary(record: dict[str, Any]) -> str:
    parts = [
        record.get("user_corrections"),
        record.get("memory_requests"),
        record.get("agent_issues"),
        record.get("lesson_candidate"),
        record.get("evidence"),
    ]
    return " ".join(str(part).strip() for part in parts if str(part or "").strip())


def select_turn_history_signals(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for record in records:
        importance = str(record.get("importance") or "low").strip()
        if importance not in VALID_TURN_HISTORY_IMPORTANCE:
            importance = "low"
        if importance not in IMPORTANT_TURN_HISTORY:
            continue
        summary = turn_history_summary(record)
        if not summary:
            continue
        signals.append(
            {
                "type": "turn_history",
                "importance": importance,
                "turn_id": record.get("turn_id", ""),
                "user_intent": record.get("user_intent", ""),
                "user_decisions": record.get("user_decisions", ""),
                "user_corrections": record.get("user_corrections", ""),
                "memory_requests": record.get("memory_requests", ""),
                "agent_issues": record.get("agent_issues", ""),
                "lesson_candidate": record.get("lesson_candidate", ""),
                "evidence": record.get("evidence", ""),
            }
        )
    return signals


def build_contextual_candidates(
    transcript: str,
    turn_history_records: list[dict[str, Any]],
    regex_signals: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    regex_evidence = {str(signal.get("evidence", "")) for signal in regex_signals}
    for record in turn_history_records:
        importance = str(record.get("importance") or "low").strip()
        if importance not in IMPORTANT_TURN_HISTORY:
            continue
        lesson = str(record.get("lesson_candidate") or "").strip()
        evidence = str(record.get("evidence") or "").strip()
        if not lesson and not evidence:
            continue
        source = "turn_history_with_regex" if evidence in regex_evidence else "turn_history_context"
        candidates.append(
            {
                "type": "contextual_candidate",
                "importance": importance,
                "turn_id": record.get("turn_id", ""),
                "source": source,
                "reason": "Important turn-history memo indicates a reusable behavior candidate after reviewing the session context.",
                "evidence": [
                    item
                    for item in (
                        evidence,
                        record.get("user_corrections"),
                        record.get("memory_requests"),
                        record.get("agent_issues"),
                    )
                    if item
                ],
                "suggested_skill_rule": lesson,
            }
        )

    if not candidates and regex_signals and transcript.strip():
        candidates.append(
            {
                "type": "contextual_candidate",
                "importance": "medium",
                "turn_id": "",
                "source": "regex_context",
                "reason": "Regex signals exist, but no high-importance turn-history memo confirms a durable lesson; review the full transcript before proposing a skill change.",
                "evidence": [str(signal.get("evidence", "")) for signal in regex_signals[:3] if signal.get("evidence")],
                "suggested_skill_rule": "",
            }
        )
    return candidates


def build_rejected_candidates(turn_history_records: list[dict[str, Any]], signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rejected: list[dict[str, Any]] = []
    for record in turn_history_records:
        importance = str(record.get("importance") or "low").strip()
        if importance in CONTEXT_TURN_HISTORY and not str(record.get("lesson_candidate") or "").strip():
            rejected.append(
                {
                    "type": "turn_history_context_only",
                    "importance": importance,
                    "turn_id": record.get("turn_id", ""),
                    "reason": "Useful for reconstructing session flow but not enough by itself for a skill update.",
                    "evidence": record.get("evidence", ""),
                }
            )
    for signal in signals:
        if signal["type"] in {"transient_failure_only", "secret_or_private_data_risk", "one_off_task"}:
            rejected.append(
                {
                    "type": signal["type"],
                    "importance": "low",
                    "turn_id": "",
                    "reason": "Excluded by self-improvement safety rubric.",
                    "evidence": signal.get("evidence", ""),
                }
            )
    return rejected
