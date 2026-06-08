"""Phase 10 pruning contract for mem-backed mem."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
import tomllib

from mem.cli import cli
from mem.config import MemConfig, config_to_dict

REPO_ROOT = Path(__file__).resolve().parents[2]
BASELINE_PATH = Path(__file__).parent / "fixtures" / "phase10_docgen_baseline.json"


def test_phase10_cli_surface_keeps_search_engine_commands() -> None:
    assert {"index", "search", "expand", "stats", "reset", "config"}.issubset(cli.commands)
    assert "session" in cli.commands


def test_phase10_cli_surface_removes_non_search_commands() -> None:
    assert "watch" not in cli.commands
    assert "compact" not in cli.commands
    assert "init" not in cli.commands["config"].commands


def test_phase10_config_schema_removes_non_search_sections() -> None:
    payload = config_to_dict(MemConfig())

    for removed in ["compact", "watch", "llm", "prompts"]:
        assert removed not in payload

    assert {"milvus", "embedding", "chunking", "reranker"}.issubset(payload)
    assert "debounce_ms" not in json.dumps(payload)
    assert "llm_provider" not in json.dumps(payload)
    assert "summarize" not in json.dumps(payload)


def test_phase10_public_package_interface_is_mem() -> None:
    pyproject = tomllib.loads((REPO_ROOT / "mem" / "pyproject.toml").read_text(encoding="utf-8"))

    assert pyproject["project"]["name"] == "mem"
    assert pyproject["project"]["scripts"] == {
        "mem": "mem.cli:cli",
        "mem-session-mcp": "mem.session_mcp:main",
    }
    assert pyproject["tool"]["hatch"]["build"]["targets"]["wheel"]["packages"] == ["src/mem"]


def test_phase10_docs_generated_search_baseline() -> None:
    if os.environ.get("RUN_MEM_PHASE10_DOCGEN_REGRESSION") != "1":
        pytest.skip("set RUN_MEM_PHASE10_DOCGEN_REGRESSION=1 to compare against the docs_generated Milvus baseline")

    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    index_path = REPO_ROOT / baseline["milvus_uri"]
    assert index_path.exists(), f"Phase 10 baseline index is missing: {index_path}"

    for item in baseline["queries"]:
        observed = _run_search(
            item["query"],
            top_k=baseline["top_k"],
            milvus_uri=baseline["milvus_uri"],
            collection=baseline["collection"],
            provider=baseline["provider"],
            model=baseline["model"],
        )
        assert _projection(observed) == item["results"]


def _run_search(query: str, *, top_k: int, milvus_uri: str, collection: str, provider: str, model: str) -> list[dict]:
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "mem",
            "search",
            query,
            "--top-k",
            str(top_k),
            "--json-output",
            "--milvus-uri",
            milvus_uri,
            "--collection",
            collection,
            "--provider",
            provider,
            "--model",
            model,
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    return json.loads(proc.stdout)


def _projection(results: list[dict]) -> list[dict]:
    projected = []
    for result in results:
        source = Path(result["source"])
        try:
            source_text = source.resolve().relative_to(REPO_ROOT).as_posix()
        except ValueError:
            source_text = result["source"]
        projected.append(
            {
                "chunk_hash": result["chunk_hash"],
                "source": source_text,
                "heading": result.get("heading", ""),
                "start_line": result["start_line"],
                "end_line": result["end_line"],
            }
        )
    return projected
