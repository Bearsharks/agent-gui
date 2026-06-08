from __future__ import annotations

import json
from pathlib import Path

import pytest

from mem.session_state import (
    ACCESS_CONTENT_READ,
    ACCESS_PATH_SEEN,
    filter_referenced_docs_by_include_paths,
    filter_state_referenced_docs_by_include_paths,
    get_verification_status,
    list_docs,
    merge_referenced_docs,
    new_state,
    normalize_state,
    resolve_state_path,
    save_state,
    set_verification_status,
)


def test_new_state_contains_schema_v1_fields() -> None:
    state = new_state("session-1", goal="ship session state")

    assert state["schema_version"] == 1
    assert state["session_id"] == "session-1"
    assert state["goal"] == "ship session state"
    assert state["verification_status"] == "not_run"
    assert state["verification_updated_at"] == ""
    assert state["verification_report_path"] == ""
    assert state["referenced_docs"] == []
    assert state["checklist"] == {"current_item_id": None, "items": []}
    assert state["external_checks"]["verification_agent"]["required"] is True
    assert state["external_checks"]["verification_agent"]["called"] is False


def test_invalid_checklist_status_is_rejected() -> None:
    state = new_state("session-1")
    state["checklist"]["items"].append({"id": "a", "text": "bad", "status": "blocked"})

    with pytest.raises(ValueError, match="invalid checklist status"):
        normalize_state(state)


def test_verification_status_can_be_updated_with_report_path() -> None:
    state = new_state("session-1")

    state = set_verification_status(state, "running", report_path=".agents/verification/reports/demo.md")
    status = get_verification_status(state)

    assert status["verification_status"] == "running"
    assert status["verification_updated_at"]
    assert status["verification_report_path"] == ".agents/verification/reports/demo.md"


def test_verification_status_accepts_korean_aliases() -> None:
    state = set_verification_status(new_state("session-1"), "통과")

    assert get_verification_status(state)["verification_status"] == "passed"


def test_invalid_verification_status_is_rejected() -> None:
    with pytest.raises(ValueError, match="invalid verification status"):
        set_verification_status(new_state("session-1"), "unknown")


def test_referenced_docs_merge_keeps_content_read_and_counts() -> None:
    state = new_state("session-1")
    state = merge_referenced_docs(
        state,
        [
            {
                "path": "docs/a.md",
                "last_read_at": "2026-05-12T01:00:00+00:00",
                "access": ACCESS_PATH_SEEN,
                "operation": "rg",
                "read_count": 1,
                "turn_id": "t1",
            },
            {
                "path": "docs/a.md",
                "last_read_at": "2026-05-12T01:01:00+00:00",
                "access": ACCESS_CONTENT_READ,
                "operation": "sed",
                "read_count": 1,
                "turn_id": "t1",
            },
        ],
    )

    docs = list_docs(state)

    assert docs == [
        {
            "path": "docs/a.md",
            "last_read_at": "2026-05-12T01:01:00+00:00",
            "access": ACCESS_CONTENT_READ,
            "operation": "sed",
            "read_count": 1,
            "turn_id": "t1",
        }
    ]


def test_referenced_docs_merge_ignores_replayed_old_event() -> None:
    state = new_state("session-1")
    state = merge_referenced_docs(
        state,
        [
            {
                "path": "docs/a.md",
                "last_read_at": "2026-05-12T01:01:00+00:00",
                "access": ACCESS_CONTENT_READ,
                "operation": "sed",
                "read_count": 1,
                "turn_id": "t1",
            }
        ],
    )
    state = merge_referenced_docs(
        state,
        [
            {
                "path": "docs/a.md",
                "last_read_at": "2026-05-12T01:01:00+00:00",
                "access": ACCESS_CONTENT_READ,
                "operation": "sed",
                "read_count": 1,
                "turn_id": "t1",
            },
            {
                "path": "docs/a.md",
                "last_read_at": "2026-05-12T01:02:00+00:00",
                "access": ACCESS_CONTENT_READ,
                "operation": "sed",
                "read_count": 1,
                "turn_id": "t2",
            },
        ],
    )

    assert list_docs(state)[0]["read_count"] == 2
    assert list_docs(state)[0]["turn_id"] == "t2"


def test_referenced_docs_merge_ignores_path_seen() -> None:
    state = new_state("session-1")
    state = merge_referenced_docs(
        state,
        [
            {
                "path": "docs/a.md",
                "last_read_at": "2026-05-12T01:00:00+00:00",
                "access": ACCESS_PATH_SEEN,
                "operation": "rg",
                "read_count": 1,
                "turn_id": "t1",
            }
        ],
    )

    assert list_docs(state) == []


def test_normalize_state_filters_existing_path_seen_docs() -> None:
    state = new_state("session-1")
    state["referenced_docs"] = [
        {
            "path": "docs/a.md",
            "last_read_at": "2026-05-12T01:00:00+00:00",
            "access": ACCESS_PATH_SEEN,
            "operation": "rg",
            "read_count": 1,
            "turn_id": "t1",
        },
        {
            "path": "docs/b.md",
            "last_read_at": "2026-05-12T01:01:00+00:00",
            "access": ACCESS_CONTENT_READ,
            "operation": "sed",
            "read_count": 1,
            "turn_id": "t1",
        },
    ]

    assert [doc["path"] for doc in list_docs(state)] == ["docs/b.md"]


def test_filter_referenced_docs_by_include_paths() -> None:
    docs = [
        {"path": "docs/guide.md", "access": ACCESS_CONTENT_READ},
        {"path": "docs_canonical/guide.md", "access": ACCESS_CONTENT_READ},
        {"path": "apps/frontend/src/App.tsx", "access": ACCESS_CONTENT_READ},
    ]

    filtered = filter_referenced_docs_by_include_paths(docs, ["./docs", "docs_canonical/"])

    assert [doc["path"] for doc in filtered] == ["docs/guide.md", "docs_canonical/guide.md"]


def test_empty_include_paths_leave_referenced_docs_unfiltered() -> None:
    docs = [{"path": "apps/frontend/src/App.tsx", "access": ACCESS_CONTENT_READ}]

    assert filter_referenced_docs_by_include_paths(docs, []) == docs


def test_filter_state_referenced_docs_by_include_paths() -> None:
    state = new_state("session-1")
    state["referenced_docs"] = [
        {
            "path": "docs/guide.md",
            "last_read_at": "2026-05-12T01:00:00+00:00",
            "access": ACCESS_CONTENT_READ,
            "operation": "sed",
            "read_count": 1,
            "turn_id": "t1",
        },
        {
            "path": "apps/frontend/src/App.tsx",
            "last_read_at": "2026-05-12T01:01:00+00:00",
            "access": ACCESS_CONTENT_READ,
            "operation": "sed",
            "read_count": 1,
            "turn_id": "t1",
        },
    ]

    filtered = filter_state_referenced_docs_by_include_paths(state, ["docs"])

    assert [doc["path"] for doc in filtered["referenced_docs"]] == ["docs/guide.md"]


def test_save_state_persists_json(tmp_path: Path) -> None:
    path = tmp_path / "state.json"
    state = new_state("session-1")

    save_state(state, path)

    assert json.loads(path.read_text())["schema_version"] == 1


def test_resolve_state_path_prefers_codex_thread_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEM_SESSION_ID", "default")
    monkeypatch.setenv("CODEX_THREAD_ID", "thread-123")

    path = resolve_state_path(cwd=tmp_path)

    assert path == tmp_path / ".mem" / "session-state" / "thread-123.json"


def test_resolve_state_path_prefers_explicit_session_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CODEX_THREAD_ID", "thread-123")

    path = resolve_state_path(session_id="explicit", cwd=tmp_path)

    assert path == tmp_path / ".mem" / "session-state" / "explicit.json"


def test_resolve_state_path_rejects_missing_session_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CODEX_THREAD_ID", raising=False)
    monkeypatch.delenv("MEM_SESSION_ID", raising=False)

    with pytest.raises(ValueError, match="session id is required"):
        resolve_state_path(cwd=tmp_path)


def test_load_state_uses_path_stem_as_session_id_when_missing(tmp_path: Path) -> None:
    from mem.session_state import load_state

    state = load_state(tmp_path / ".mem" / "session-state" / "thread-123.json")

    assert state["session_id"] == "thread-123"
