"""Extract referenced document facts from raw agent transcript JSONL."""

from __future__ import annotations

import json
import shlex
from pathlib import Path
from typing import Any

from .session_state import ACCESS_CONTENT_READ, ACCESS_PATH_SEEN, utc_now


def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with Path(path).open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                records.append(obj)
    return records


def extract_referenced_docs_from_transcript(
    transcript_path: str | Path,
    *,
    repo_root: str | Path | None = None,
    cwd: str | Path | None = None,
    turn_id: str = "",
) -> list[dict[str, Any]]:
    records = read_jsonl(transcript_path)
    root = Path(repo_root or cwd or ".").expanduser().resolve()
    return extract_referenced_docs(records, repo_root=root, cwd=Path(cwd or root), turn_id=turn_id)


def extract_referenced_docs(
    records: list[dict[str, Any]],
    *,
    repo_root: str | Path,
    cwd: str | Path | None = None,
    turn_id: str = "",
) -> list[dict[str, Any]]:
    root = Path(repo_root).expanduser().resolve()
    command_cwd = Path(cwd or root).expanduser()
    if not command_cwd.is_absolute():
        command_cwd = root / command_cwd
    turn_records = _last_turn_records(records)
    calls = _pair_codex_calls(turn_records) + _pair_claude_calls(turn_records)
    docs: list[dict[str, Any]] = []
    for call in calls:
        docs.extend(_docs_from_call(call, repo_root=root, cwd=command_cwd, turn_id=turn_id))
    return docs


def _last_turn_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for idx in range(len(records) - 1, -1, -1):
        if _is_user_turn_record(records[idx]):
            return records[idx + 1 :]
    return records


def _is_user_turn_record(obj: dict[str, Any]) -> bool:
    if _is_claude_tool_result_only_user_record(obj):
        return False
    if str(obj.get("role") or "").lower() == "user":
        return True
    if str(obj.get("type") or "").lower() in {"user", "user_message"}:
        return True
    payload = obj.get("payload")
    if isinstance(payload, dict):
        if str(payload.get("role") or "").lower() == "user":
            return True
        if str(payload.get("type") or "").lower() in {"user", "user_message"}:
            return True
    return False


def _is_claude_tool_result_only_user_record(obj: dict[str, Any]) -> bool:
    if str(obj.get("type") or obj.get("role") or "").lower() != "user":
        return False
    message = obj.get("message")
    if not isinstance(message, dict):
        return False
    content = message.get("content")
    if not isinstance(content, list) or not content:
        return False
    return all(isinstance(block, dict) and block.get("type") == "tool_result" for block in content)


def _pair_codex_calls(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    calls: dict[str, dict[str, Any]] = {}
    ordered: list[str] = []
    for idx, obj in enumerate(records):
        if obj.get("type") != "response_item":
            continue
        payload = obj.get("payload")
        if not isinstance(payload, dict):
            continue
        call_id = str(payload.get("call_id") or payload.get("id") or "")
        if not call_id:
            continue
        item_type = payload.get("type")
        if item_type == "function_call":
            calls[call_id] = {
                "call_id": call_id,
                "name": str(payload.get("name") or ""),
                "arguments": payload.get("arguments") or "",
                "timestamp": _record_time(obj) or utc_now(),
                "index": idx,
            }
            ordered.append(call_id)
        elif item_type == "function_call_output" and call_id in calls:
            calls[call_id]["output"] = payload.get("output") or ""
            calls[call_id]["output_timestamp"] = _record_time(obj) or calls[call_id]["timestamp"]
    return [calls[call_id] for call_id in ordered if call_id in calls and "output" in calls[call_id]]


def _pair_claude_calls(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    calls: dict[str, dict[str, Any]] = {}
    ordered: list[str] = []
    for idx, obj in enumerate(records):
        msg_type = str(obj.get("type") or obj.get("role") or "").lower()
        message = obj.get("message")
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if not isinstance(content, list):
            continue

        if msg_type == "assistant":
            for block in content:
                if not isinstance(block, dict) or block.get("type") != "tool_use":
                    continue
                call_id = str(block.get("id") or "")
                if not call_id:
                    continue
                calls[call_id] = {
                    "call_id": call_id,
                    "name": str(block.get("name") or ""),
                    "arguments": block.get("input") or {},
                    "timestamp": _record_time(obj) or utc_now(),
                    "index": idx,
                }
                ordered.append(call_id)

        elif msg_type == "user":
            for block in content:
                if not isinstance(block, dict) or block.get("type") != "tool_result":
                    continue
                call_id = str(block.get("tool_use_id") or "")
                if call_id not in calls:
                    continue
                calls[call_id]["output"] = _claude_tool_result_text(block.get("content"))
                calls[call_id]["output_timestamp"] = _record_time(obj) or calls[call_id]["timestamp"]
    return [calls[call_id] for call_id in ordered if call_id in calls and "output" in calls[call_id]]


def _claude_tool_result_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts)
    return ""


def _record_time(obj: dict[str, Any]) -> str:
    for key in ("timestamp", "ts", "created_at"):
        value = obj.get(key)
        if isinstance(value, str) and value:
            return value
    payload = obj.get("payload")
    if isinstance(payload, dict):
        for key in ("timestamp", "ts", "created_at"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
    return ""


def _docs_from_call(
    call: dict[str, Any],
    *,
    repo_root: Path,
    cwd: Path,
    turn_id: str,
) -> list[dict[str, Any]]:
    name = call["name"]
    if name == "Bash":
        args = _parse_call_arguments(call.get("arguments", ""))
        if not isinstance(args, dict):
            return []
        cmd = args.get("command") or args.get("cmd")
        workdir = args.get("workdir")
    elif name == "Read":
        args = _parse_call_arguments(call.get("arguments", ""))
        if not isinstance(args, dict):
            return []
        file_path = args.get("file_path") or args.get("path")
        if not isinstance(file_path, str) or not file_path.strip():
            return []
        path = _normalize_path(file_path, repo_root=repo_root, cwd=cwd)
        if not path:
            return []
        timestamp = str(call.get("output_timestamp") or call.get("timestamp") or utc_now())
        return [_doc(path, ACCESS_CONTENT_READ, "Read", timestamp, turn_id)]
    elif not (name == "exec_command" or name.endswith(".exec_command")):
        return []
    else:
        args = _parse_call_arguments(call.get("arguments", ""))
        if not isinstance(args, dict):
            return []
        cmd = args.get("cmd")
        workdir = args.get("workdir")
    if not isinstance(cmd, str) or not cmd.strip():
        return []
    command_cwd = Path(workdir).expanduser() if isinstance(workdir, str) and workdir else cwd
    if not command_cwd.is_absolute():
        command_cwd = repo_root / command_cwd
    return _docs_from_shell_command(
        cmd,
        output=str(call.get("output") or ""),
        repo_root=repo_root,
        cwd=command_cwd,
        timestamp=str(call.get("output_timestamp") or call.get("timestamp") or utc_now()),
        turn_id=turn_id,
    )


def _parse_call_arguments(raw: Any) -> Any:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return {}


def _docs_from_shell_command(
    cmd: str,
    *,
    output: str,
    repo_root: Path,
    cwd: Path,
    timestamp: str,
    turn_id: str,
) -> list[dict[str, Any]]:
    tokens = _split_command(cmd)
    if not tokens:
        return []
    inner = _unwrap_shell(tokens)
    if inner is not None:
        return _docs_from_shell_command(
            inner,
            output=output,
            repo_root=repo_root,
            cwd=cwd,
            timestamp=timestamp,
            turn_id=turn_id,
        )

    executable = Path(tokens[0]).name
    if _is_docs_search(tokens):
        return _docs_from_search_json(tokens, output, repo_root=repo_root, cwd=cwd, timestamp=timestamp, turn_id=turn_id)
    if executable == "mem" and len(tokens) > 1 and tokens[1] == "search" and "--json-output" in tokens:
        return _docs_from_search_json(tokens, output, repo_root=repo_root, cwd=cwd, timestamp=timestamp, turn_id=turn_id)
    if executable in {"sed", "cat", "nl", "head", "tail"}:
        return [
            _doc(path, ACCESS_CONTENT_READ, executable, timestamp, turn_id)
            for path in _content_command_paths(executable, tokens[1:], repo_root=repo_root, cwd=cwd)
        ]
    if executable == "rg":
        if _rg_is_path_only(tokens):
            paths = _paths_from_output(output, repo_root=repo_root, cwd=cwd)
            return [_doc(path, ACCESS_PATH_SEEN, "rg", timestamp, turn_id) for path in paths]
        paths = _paths_from_rg_content_output(output, repo_root=repo_root, cwd=cwd)
        if not paths and output.strip():
            paths = _rg_file_args(tokens[1:], repo_root=repo_root, cwd=cwd)
        return [_doc(path, ACCESS_CONTENT_READ, "rg", timestamp, turn_id) for path in paths]
    if executable == "find":
        paths = _paths_from_output(output, repo_root=repo_root, cwd=cwd)
        return [_doc(path, ACCESS_PATH_SEEN, executable, timestamp, turn_id) for path in paths]
    if executable == "ls":
        paths = _paths_from_ls_output(tokens[1:], output, repo_root=repo_root, cwd=cwd)
        return [_doc(path, ACCESS_PATH_SEEN, executable, timestamp, turn_id) for path in paths]
    return []


def _split_command(cmd: str) -> list[str]:
    try:
        return shlex.split(cmd)
    except ValueError:
        return []


def _unwrap_shell(tokens: list[str]) -> str | None:
    executable = Path(tokens[0]).name
    if executable not in {"bash", "sh", "zsh"}:
        return None
    for idx, token in enumerate(tokens):
        if token in {"-c", "-lc"} and idx + 1 < len(tokens):
            return tokens[idx + 1]
    return None


def _is_docs_search(tokens: list[str]) -> bool:
    executable = Path(tokens[0]).name
    return executable == "docs-search" or tokens[0].endswith("/.mem/docs-search") or tokens[0] == ".mem/docs-search"


def _docs_from_search_json(
    tokens: list[str],
    output: str,
    *,
    repo_root: Path,
    cwd: Path,
    timestamp: str,
    turn_id: str,
) -> list[dict[str, Any]]:
    if "--json" not in tokens and "--json-output" not in tokens:
        return []
    operation = "docs_search_expand" if "expand" in tokens else "docs_search_search"
    try:
        payload = json.loads(output)
    except json.JSONDecodeError:
        return []
    items: list[dict[str, Any]]
    if isinstance(payload, list):
        items = [item for item in payload if isinstance(item, dict)]
    elif isinstance(payload, dict) and isinstance(payload.get("results"), list):
        items = [item for item in payload["results"] if isinstance(item, dict)]
    elif isinstance(payload, dict):
        items = [payload]
    else:
        return []

    docs: list[dict[str, Any]] = []
    for item in items:
        source = item.get("source")
        content = item.get("content")
        if isinstance(source, str) and source and isinstance(content, str) and content:
            path = _normalize_path(source, repo_root=repo_root, cwd=cwd, must_exist=False)
            if path:
                docs.append(_doc(path, ACCESS_CONTENT_READ, operation, timestamp, turn_id))
    return docs


def _rg_is_path_only(tokens: list[str]) -> bool:
    return any(token in {"--files", "-l", "--files-with-matches"} for token in tokens)


def _command_paths(args: list[str], *, repo_root: Path, cwd: Path) -> list[str]:
    paths: list[str] = []
    skip_next = False
    for token in args:
        if skip_next:
            skip_next = False
            continue
        if token in {"-R", "-r", "-i", "-H", "--hidden", "--no-heading", "--line-number", "-n"}:
            continue
        if token in {
            "-e",
            "-g",
            "--glob",
            "--type",
            "-t",
            "--context",
            "-C",
            "-A",
            "-B",
            "--lines",
        }:
            skip_next = True
            continue
        if token.startswith("-"):
            continue
        path = _normalize_path(token, repo_root=repo_root, cwd=cwd)
        if path:
            paths.append(path)
    return _dedupe(paths)


def _content_command_paths(executable: str, args: list[str], *, repo_root: Path, cwd: Path) -> list[str]:
    if executable in {"head", "tail"}:
        return _head_tail_paths(args, repo_root=repo_root, cwd=cwd)
    if executable != "sed":
        return _command_paths(args, repo_root=repo_root, cwd=cwd)

    paths: list[str] = []
    skip_next = False
    script_seen = False
    for token in args:
        if skip_next:
            skip_next = False
            continue
        if token in {"-e", "-f"}:
            skip_next = True
            script_seen = True
            continue
        if token.startswith("-"):
            continue
        if not script_seen:
            script_seen = True
            continue
        path = _normalize_path(token, repo_root=repo_root, cwd=cwd)
        if path:
            paths.append(path)
    return _dedupe(paths)


def _head_tail_paths(args: list[str], *, repo_root: Path, cwd: Path) -> list[str]:
    paths: list[str] = []
    skip_next = False
    for token in args:
        if skip_next:
            skip_next = False
            continue
        if token in {"-n", "--lines", "-c", "--bytes"}:
            skip_next = True
            continue
        if token.startswith(("-n", "-c")) and len(token) > 2:
            continue
        if token.startswith("-"):
            continue
        path = _normalize_path(token, repo_root=repo_root, cwd=cwd)
        if path:
            paths.append(path)
    return _dedupe(paths)


def _rg_file_args(args: list[str], *, repo_root: Path, cwd: Path) -> list[str]:
    paths: list[str] = []
    skip_next = False
    pattern_seen = False
    for token in args:
        if skip_next:
            skip_next = False
            continue
        if token in {
            "-e",
            "--regexp",
            "-g",
            "--glob",
            "--type",
            "-t",
            "--context",
            "-C",
            "-A",
            "-B",
        }:
            skip_next = True
            if token in {"-e", "--regexp"}:
                pattern_seen = True
            continue
        if token.startswith("-"):
            continue
        if not pattern_seen:
            pattern_seen = True
            continue
        path = _normalize_path(token, repo_root=repo_root, cwd=cwd)
        if path:
            paths.append(path)
    return _dedupe(paths)


def _paths_from_output(output: str, *, repo_root: Path, cwd: Path) -> list[str]:
    paths: list[str] = []
    for line in output.splitlines():
        candidate = line.strip()
        if not candidate or candidate.startswith(("{", "[")):
            continue
        path = _normalize_path(candidate, repo_root=repo_root, cwd=cwd)
        if path:
            paths.append(path)
    return _dedupe(paths)


def _paths_from_ls_output(args: list[str], output: str, *, repo_root: Path, cwd: Path) -> list[str]:
    bases = _ls_base_dirs(args, repo_root=repo_root, cwd=cwd)
    current_base = bases[0] if len(bases) == 1 else cwd
    paths: list[str] = []
    for line in output.splitlines():
        candidate = line.strip()
        if not candidate or candidate.startswith(("total ", "{", "[")):
            continue
        if candidate.endswith(":"):
            heading = candidate[:-1]
            normalized_heading = _absolute_path(heading, repo_root=repo_root, cwd=cwd)
            if normalized_heading is not None and normalized_heading.is_dir():
                current_base = normalized_heading
            continue
        candidate = _ls_entry_name(candidate)
        if not candidate:
            continue
        if "/" not in candidate:
            raw_path = str(current_base / candidate)
        else:
            absolute = _absolute_path(candidate, repo_root=repo_root, cwd=cwd)
            if absolute is None:
                continue
            raw_path = str(absolute)
        path = _normalize_path(raw_path, repo_root=repo_root, cwd=cwd)
        if path:
            paths.append(path)
    return _dedupe(paths)


def _ls_entry_name(line: str) -> str:
    parts = line.split()
    if not parts:
        return ""
    if parts[0].startswith(("d", "-", "l", "b", "c", "p", "s")) and len(parts) >= 9:
        name = " ".join(parts[8:])
        if " -> " in name:
            name = name.split(" -> ", 1)[0]
        return name
    return line


def _ls_base_dirs(args: list[str], *, repo_root: Path, cwd: Path) -> list[Path]:
    bases: list[Path] = []
    skip_next = False
    for token in args:
        if skip_next:
            skip_next = False
            continue
        if token in {"-w", "--width", "-I", "--ignore"}:
            skip_next = True
            continue
        if token.startswith("-"):
            continue
        path = _absolute_path(token, repo_root=repo_root, cwd=cwd)
        if path is not None and path.is_dir():
            bases.append(path)
    return bases or [cwd]


def _paths_from_rg_content_output(output: str, *, repo_root: Path, cwd: Path) -> list[str]:
    paths: list[str] = []
    current_path = ""
    for line in output.splitlines():
        stripped = line.strip()
        if not stripped:
            current_path = ""
            continue
        if current_path and _looks_like_rg_heading_match(stripped):
            paths.append(current_path)
            continue
        if ":" in line:
            candidate = line.split(":", 1)[0].strip()
            path = _normalize_path(candidate, repo_root=repo_root, cwd=cwd)
            if path:
                paths.append(path)
                continue
        else:
            heading_path = _normalize_path(stripped, repo_root=repo_root, cwd=cwd)
            if heading_path:
                current_path = heading_path
            continue
    return _dedupe(paths)


def _looks_like_rg_heading_match(line: str) -> bool:
    head = line.split(":", 1)[0]
    return head.isdigit() or (head.startswith("-") and head[1:].isdigit())


def _absolute_path(raw: str, *, repo_root: Path, cwd: Path) -> Path | None:
    if not raw or raw.startswith("-"):
        return None
    raw = raw.strip().strip("'\"")
    if not raw:
        return None
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = cwd / path
    try:
        return path.resolve(strict=False)
    except OSError:
        return None


def _normalize_path(raw: str, *, repo_root: Path, cwd: Path, must_exist: bool = True) -> str:
    resolved = _absolute_path(raw, repo_root=repo_root, cwd=cwd)
    if resolved is None:
        return ""
    if must_exist:
        try:
            if not resolved.exists() or resolved.is_dir():
                return ""
        except OSError:
            return ""
    try:
        relative = resolved.relative_to(repo_root)
    except ValueError:
        return ""
    if not relative.parts or any(part == ".." for part in relative.parts):
        return ""
    value = relative.as_posix()
    if value == "." or value.endswith("/"):
        return ""
    return value


def _doc(path: str, access: str, operation: str, timestamp: str, turn_id: str) -> dict[str, Any]:
    return {
        "path": path,
        "last_read_at": timestamp,
        "access": access,
        "operation": operation,
        "read_count": 1,
        "turn_id": turn_id,
    }


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result
