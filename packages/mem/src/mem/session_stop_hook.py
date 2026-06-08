"""Codex Stop hook adapter for mem session state.

This adapter records referenced documents from the raw transcript. When the
latest assistant message declares completion with the magic phrase, the adapter
also gates stop on the recorded verification status.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from .config import resolve_config
from .session_state import (
    VERIFICATION_ERROR,
    VERIFICATION_PASSED,
    filter_referenced_docs_by_include_paths,
    filter_state_referenced_docs_by_include_paths,
    get_verification_status,
    load_state,
    merge_referenced_docs,
    resolve_state_path,
    save_state,
)
from .transcript_docs import extract_referenced_docs_from_transcript, read_jsonl


COMPLETION_MAGIC = "MISSION COMPLETE!!"
STOP_ALLOWED_VERIFICATION_STATUSES = {VERIFICATION_PASSED, VERIFICATION_ERROR}


def json_get(data: dict[str, Any], dotted: str, default: Any = "") -> Any:
    value: Any = data
    for part in dotted.split("."):
        if isinstance(value, dict) and part in value:
            value = value[part]
        else:
            return default
    return value


def read_stdin_json() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def load_input(args: argparse.Namespace) -> dict[str, Any]:
    if args.input:
        try:
            payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
        except Exception:
            return {}
        return payload if isinstance(payload, dict) else {}
    if args.payload_json:
        try:
            payload = json.loads(args.payload_json)
        except json.JSONDecodeError:
            return {}
        return payload if isinstance(payload, dict) else {}
    return read_stdin_json()


def git_root(cwd: Path) -> Path:
    try:
        out = subprocess.check_output(
            ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        if out:
            return Path(out)
    except Exception:
        pass
    return cwd


def safe_session_id(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    value = re.sub(r"^rollout-", "", value)
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", value)
    return value[:160]


def derive_session_id(input_data: dict[str, Any], transcript_path: str) -> str:
    for key in ("session_id", "session.id", "conversation_id"):
        value = json_get(input_data, key, "")
        if isinstance(value, str) and value.strip():
            return safe_session_id(value)
    for env_key in ("CODEX_THREAD_ID", "MEM_SESSION_ID"):
        env_value = os.environ.get(env_key, "")
        if env_value:
            return safe_session_id(env_value)
    if transcript_path:
        return safe_session_id(Path(transcript_path).stem)
    return ""


def derive_turn_id(input_data: dict[str, Any]) -> str:
    for key in ("turn_id", "turn.id", "event_id"):
        value = json_get(input_data, key, "")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def allow() -> dict[str, Any]:
    return {}


def block(reason: str) -> dict[str, Any]:
    return {"decision": "block", "reason": reason}


def completion_declared_in_transcript(transcript_path: str) -> bool:
    if not transcript_path or not Path(transcript_path).is_file():
        return False
    records = read_jsonl(transcript_path)
    messages: list[tuple[str, bool]] = []
    for record in _last_turn_records(records):
        if record.get("type") != "response_item":
            continue
        payload = record.get("payload")
        if not isinstance(payload, dict):
            continue
        if payload.get("type") != "message" or payload.get("role") != "assistant":
            continue
        text = _message_text(payload)
        if text:
            messages.append((text, payload.get("phase") == "commentary"))
    non_commentary = [text for text, is_commentary in messages if not is_commentary]
    if non_commentary:
        return _message_declares_completion(non_commentary[-1])
    if messages:
        return _message_declares_completion(messages[-1][0])

    claude_messages = _claude_assistant_messages(records)
    return bool(claude_messages) and _message_declares_completion(claude_messages[-1])


def _claude_assistant_messages(records: list[dict[str, Any]]) -> list[str]:
    messages: list[str] = []
    for record in _last_turn_records(records):
        if str(record.get("type") or record.get("role") or "").lower() != "assistant":
            continue
        message = record.get("message")
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            messages.append(content.strip())
        elif isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text = block.get("text")
                    if isinstance(text, str):
                        parts.append(text)
            if parts:
                messages.append("\n".join(parts).strip())
    return [message for message in messages if message]


def _message_declares_completion(text: str) -> bool:
    return text.strip() == COMPLETION_MAGIC


def _last_turn_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for idx in range(len(records) - 1, -1, -1):
        if _is_user_turn_record(records[idx]):
            return records[idx + 1 :]
    return records


def _is_user_turn_record(record: dict[str, Any]) -> bool:
    if _is_claude_tool_result_only_user_record(record):
        return False
    if str(record.get("role") or "").lower() == "user":
        return True
    if str(record.get("type") or "").lower() in {"user", "user_message"}:
        return True
    payload = record.get("payload")
    if isinstance(payload, dict):
        if str(payload.get("role") or "").lower() == "user":
            return True
        if str(payload.get("type") or "").lower() in {"user", "user_message"}:
            return True
    return False


def _is_claude_tool_result_only_user_record(record: dict[str, Any]) -> bool:
    if str(record.get("type") or record.get("role") or "").lower() != "user":
        return False
    message = record.get("message")
    if not isinstance(message, dict):
        return False
    content = message.get("content")
    if not isinstance(content, list) or not content:
        return False
    return all(isinstance(block, dict) and block.get("type") == "tool_result" for block in content)


def _message_text(payload: dict[str, Any]) -> str:
    content = payload.get("content")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        if isinstance(text, str):
            parts.append(text)
    return "\n".join(parts)


def build_verification_block_reason(status: str, report_path: str) -> str:
    lines = [
        f"mem session-state stop gate blocked: completion was declared with {COMPLETION_MAGIC}.",
        f"Stop is allowed only when verification_status is '{VERIFICATION_PASSED}' or '{VERIFICATION_ERROR}'.",
        f"Current verification_status is '{status}', so the agent cannot stop yet.",
    ]
    if report_path:
        lines.append(f"Current verification_report_path: {report_path}")
    lines.append("Run the verification workflow, update memstatus through verification.set_status, then stop again.")
    return "\n".join(lines)


def process_payload(input_data: dict[str, Any], *, project_root: Path | None = None) -> dict[str, Any]:
    cwd = Path(str(json_get(input_data, "cwd", os.getcwd()) or os.getcwd()))
    root = project_root or git_root(cwd if cwd.exists() else Path.cwd())
    transcript_path = str(json_get(input_data, "transcript_path", "") or "")
    session_id = derive_session_id(input_data, transcript_path)
    if not session_id:
        return block("mem session-state stop gate blocked: session id is required but was not provided by hook input or environment.")
    turn_id = derive_turn_id(input_data)
    state_path = resolve_state_path(session_id=session_id, cwd=root)
    state = load_state(state_path, session_id=session_id)
    cfg = resolve_config(project_config_path=root / ".mem" / "mem.toml")
    state = filter_state_referenced_docs_by_include_paths(state, cfg.session.referenced_doc_include_paths)

    # Always update referenced_docs when a transcript is available.
    if transcript_path and Path(transcript_path).is_file():
        docs = extract_referenced_docs_from_transcript(
            transcript_path,
            repo_root=root,
            cwd=str(json_get(input_data, "cwd", root) or root),
            turn_id=turn_id,
        )
        docs = filter_referenced_docs_by_include_paths(docs, cfg.session.referenced_doc_include_paths)
        if docs:
            state = merge_referenced_docs(state, docs)
            save_state(state, state_path)

    if completion_declared_in_transcript(transcript_path):
        verification = get_verification_status(state)
        status = str(verification["verification_status"])
        if status not in STOP_ALLOWED_VERIFICATION_STATUSES:
            return block(build_verification_block_reason(status, str(verification["verification_report_path"])))

    return allow()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="Path to hook input JSON.")
    parser.add_argument("--payload-json", help="Hook input JSON payload.")
    parser.add_argument("--repo-root", help="Repository root override.")
    args = parser.parse_args()

    input_data = load_input(args)
    project_root = Path(args.repo_root).resolve() if args.repo_root else None
    try:
        result = process_payload(input_data, project_root=project_root)
    except Exception as exc:
        result = block(f"mem session-state stop hook failed internally: {type(exc).__name__}: {exc}")
    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
