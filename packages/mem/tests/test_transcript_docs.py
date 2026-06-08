from __future__ import annotations

import json
from pathlib import Path

from mem.session_state import ACCESS_CONTENT_READ, ACCESS_PATH_SEEN
from mem.transcript_docs import extract_referenced_docs


def _call(call_id: str, cmd: str, output: str, *, workdir: str | None = None) -> list[dict]:
    args = {"cmd": cmd}
    if workdir:
        args["workdir"] = workdir
    return [
        {
            "type": "response_item",
            "payload": {
                "type": "function_call",
                "call_id": call_id,
                "name": "exec_command",
                "arguments": json.dumps(args),
            },
        },
        {
            "type": "response_item",
            "payload": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": output,
            },
        },
    ]


def test_extracts_shell_content_read_from_sed(tmp_path: Path) -> None:
    repo = tmp_path
    doc = repo / "docs" / "guide.md"
    doc.parent.mkdir()
    doc.write_text("content")

    docs = extract_referenced_docs(
        _call("c1", "sed -n '1,20p' docs/guide.md", "content"),
        repo_root=repo,
        turn_id="turn-1",
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_CONTENT_READ
    assert docs[0]["operation"] == "sed"
    assert docs[0]["turn_id"] == "turn-1"


def test_extracts_shell_path_seen_from_rg_files(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content")

    docs = extract_referenced_docs(
        _call("c1", "rg --files docs", "docs/guide.md\n"),
        repo_root=repo,
    )

    assert docs == [
        {
            "path": "docs/guide.md",
            "last_read_at": docs[0]["last_read_at"],
            "access": ACCESS_PATH_SEEN,
            "operation": "rg",
            "read_count": 1,
            "turn_id": "",
        }
    ]


def test_extracts_content_read_from_rg_body_output(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("needle")

    docs = extract_referenced_docs(
        _call("c1", "rg needle docs", "docs/guide.md:needle\n"),
        repo_root=repo,
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_CONTENT_READ


def test_extracts_only_last_user_turn_docs(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "old.md").write_text("old")
    (repo / "docs" / "new.md").write_text("new")

    records = [
        {"type": "message", "payload": {"role": "user", "content": "old turn"}},
        *_call("c1", "sed -n '1,20p' docs/old.md", "old"),
        {"type": "message", "payload": {"role": "user", "content": "new turn"}},
        *_call("c2", "sed -n '1,20p' docs/new.md", "new"),
    ]

    docs = extract_referenced_docs(records, repo_root=repo)

    assert [doc["path"] for doc in docs] == ["docs/new.md"]


def test_rg_line_number_output_ignores_long_match_body(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("needle")
    long_body = "x" * 400

    docs = extract_referenced_docs(
        _call("c1", "rg -n needle docs", f"docs/guide.md:382:{long_body}\n"),
        repo_root=repo,
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_CONTENT_READ


def test_rg_single_file_body_output_infers_file_arg(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("needle")

    docs = extract_referenced_docs(
        _call("c1", "rg needle docs/guide.md", "needle\n"),
        repo_root=repo,
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_CONTENT_READ


def test_extracts_content_read_from_rg_heading_output(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("needle")

    docs = extract_referenced_docs(
        _call("c1", "rg --heading needle docs", "docs/guide.md\n1:needle\n"),
        repo_root=repo,
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_CONTENT_READ


def test_rg_without_body_output_does_not_infer_content_read_from_args(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("needle")

    docs = extract_referenced_docs(
        _call("c1", "rg missing docs/guide.md", ""),
        repo_root=repo,
    )

    assert docs == []


def test_head_n_records_only_document_path(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content")

    docs = extract_referenced_docs(
        _call("c1", "head -n 20 docs/guide.md", "content"),
        repo_root=repo,
    )

    assert [doc["path"] for doc in docs] == ["docs/guide.md"]
    assert docs[0]["access"] == ACCESS_CONTENT_READ
    assert docs[0]["operation"] == "head"


def test_cat_n_records_document_path(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content")

    docs = extract_referenced_docs(
        _call("c1", "cat -n docs/guide.md", "     1\tcontent"),
        repo_root=repo,
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_CONTENT_READ
    assert docs[0]["operation"] == "cat"


def test_ls_directory_listing_records_children_under_listed_directory(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content")

    docs = extract_referenced_docs(
        _call("c1", "ls docs", "guide.md\n"),
        repo_root=repo,
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_PATH_SEEN
    assert docs[0]["operation"] == "ls"


def test_ls_long_listing_records_children_under_listed_directory(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content")

    docs = extract_referenced_docs(
        _call("c1", "ls -l docs", "-rw-r--r--  1 user  staff  7 May 12 10:00 guide.md\n"),
        repo_root=repo,
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_PATH_SEEN
    assert docs[0]["operation"] == "ls"


def test_extracts_docs_search_results_as_content_read(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content")
    output = json.dumps({"results": [{"source": "docs/guide.md", "content": "content"}]})

    docs = extract_referenced_docs(
        _call("c1", ".mem/docs-search search query --json", output),
        repo_root=repo,
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_CONTENT_READ
    assert docs[0]["operation"] == "docs_search_search"


def test_extracts_docs_search_expand_as_content_read(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content")
    output = json.dumps({"source": "docs/guide.md", "content": "expanded"})

    docs = extract_referenced_docs(
        _call("c1", ".mem/docs-search expand abc123 --json", output),
        repo_root=repo,
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_CONTENT_READ
    assert docs[0]["operation"] == "docs_search_expand"


def test_unwraps_shell_lc_commands(tmp_path: Path) -> None:
    repo = tmp_path
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("content")

    docs = extract_referenced_docs(
        _call("c1", "/bin/zsh -lc \"sed -n '1,5p' docs/guide.md\"", "content"),
        repo_root=repo,
    )

    assert docs[0]["path"] == "docs/guide.md"
    assert docs[0]["access"] == ACCESS_CONTENT_READ
