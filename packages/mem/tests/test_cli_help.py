"""Tests for CLI help and version commands."""

from __future__ import annotations

import pytest
from click.testing import CliRunner

from mem.cli import cli


@pytest.mark.parametrize(
    ("args", "expected_text"),
    [
        pytest.param(["--help"], "Usage:", id="main-help"),
        pytest.param(["config", "--help"], "Usage:", id="config-help"),
        pytest.param(["config", "set", "--help"], "Usage:", id="config-set-help"),
        pytest.param(["config", "get", "--help"], "Usage:", id="config-get-help"),
        pytest.param(["config", "list", "--help"], "Usage:", id="config-list-help"),
        pytest.param(["index", "--help"], "Usage:", id="index-help"),
        pytest.param(["search", "--help"], "Usage:", id="search-help"),
        pytest.param(["expand", "--help"], "Usage:", id="expand-help"),
        pytest.param(["stats", "--help"], "Usage:", id="stats-help"),
        pytest.param(["reset", "--help"], "Usage:", id="reset-help"),
        pytest.param(["session", "--help"], "Usage:", id="session-help"),
        pytest.param(["session", "docs", "--help"], "Usage:", id="session-docs-help"),
        pytest.param(["session", "verification", "--help"], "Usage:", id="session-verification-help"),
        pytest.param(["--version"], "version", id="version"),
    ],
)
def test_cli_help_and_version_commands(args: list[str], expected_text: str) -> None:
    """CLI entrypoints should expose stable help/version output."""
    runner = CliRunner()
    result = runner.invoke(cli, args)

    assert result.exit_code == 0
    assert expected_text in result.output


@pytest.mark.parametrize("args", [["index", "--help"]])
def test_chunk_size_flag_appears_in_help(args: list[str]) -> None:
    runner = CliRunner()
    result = runner.invoke(cli, args)

    assert result.exit_code == 0
    assert "--max-chunk-size" in result.output


def test_metadata_filter_flag_appears_in_search_help() -> None:
    runner = CliRunner()
    result = runner.invoke(cli, ["search", "--help"])

    assert result.exit_code == 0
    assert "--filter" in result.output


@pytest.mark.parametrize(
    "args",
    [
        ["watch", "--help"],
        ["compact", "--help"],
        ["config", "init", "--help"],
        ["session", "checklist", "--help"],
        ["session", "external", "--help"],
        ["session", "stop-gate", "--help"],
    ],
)
def test_phase10_removed_commands_are_not_available(args: list[str]) -> None:
    runner = CliRunner()
    result = runner.invoke(cli, args)

    assert result.exit_code != 0
