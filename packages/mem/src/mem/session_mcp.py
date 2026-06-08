"""MCP server for portable mem session state."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

from .config import resolve_config
from . import session_state as state_api


def create_server(*, session_id: str | None = None, cwd: str | None = None) -> FastMCP:
    mcp = FastMCP("mem-session-state", json_response=True)

    def load(sessionId: str) -> tuple[Path, dict[str, Any]]:
        active_session_id = sessionId or session_id
        path = state_api.resolve_state_path(session_id=active_session_id, cwd=cwd)
        state = state_api.load_state(path, session_id=active_session_id)
        cfg = resolve_config(project_config_path=Path(cwd or ".") / ".mem" / "mem.toml")
        state = state_api.filter_state_referenced_docs_by_include_paths(
            state,
            cfg.session.referenced_doc_include_paths,
        )
        return path, state

    def save(path: Path, state: dict[str, Any]) -> dict[str, Any]:
        return state_api.save_state(state, path)

    @mcp.tool(name="state.get")
    def state_get(sessionId: str) -> dict[str, Any]:
        """Return state for the specified Codex session. Always pass the current Codex session/thread id; do not use default."""
        _path, state = load(sessionId)
        return state

    @mcp.tool(name="state.set_goal")
    def state_set_goal(sessionId: str, goal: str) -> dict[str, Any]:
        """Set the goal for the specified Codex session. Always pass the current Codex session/thread id; do not use default."""
        path, state = load(sessionId)
        return save(path, state_api.set_goal(state, goal))

    @mcp.tool(name="docs.list")
    def docs_list(sessionId: str) -> list[dict[str, Any]]:
        """List referenced documents for the specified Codex session. Always pass the current Codex session/thread id."""
        _path, state = load(sessionId)
        return state_api.list_docs(state)

    @mcp.tool(name="verification.get")
    def verification_get(sessionId: str) -> dict[str, Any]:
        """Return verification status for the specified Codex session. Status is one of not_run, running, passed, failed, or error."""
        _path, state = load(sessionId)
        return state_api.get_verification_status(state)

    @mcp.tool(name="verification.set_status")
    def verification_set_status(sessionId: str, status: str, reportPath: str | None = None) -> dict[str, Any]:
        """Record verification status for the specified Codex session. Accepts not_run/running/passed/failed/error or Korean aliases 검증전/검증중/통과/실패/에러."""
        path, state = load(sessionId)
        updated = state_api.set_verification_status(state, status, report_path=reportPath)
        return state_api.get_verification_status(save(path, updated))

    return mcp


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the mem session state MCP server.")
    parser.add_argument("--session-id", default=None)
    parser.add_argument("--cwd", default=None)
    parser.add_argument("--transport", default="stdio", choices=["stdio", "streamable-http", "sse"])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = create_server(session_id=args.session_id, cwd=args.cwd)
    if args.transport == "stdio":
        server.run(transport="stdio")
    else:
        server.run(transport=args.transport, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
