"""CLI interface for mem."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import click

from .config import (
    GLOBAL_CONFIG_PATH,
    PROJECT_CONFIG_PATH,
    ConfigEnvVarError,
    MemConfig,
    config_to_dict,
    get_config_value,
    load_config_file,
    resolve_config,
    set_config_value,
)

try:
    from pymilvus.exceptions import MilvusException
except ImportError:
    MilvusException = Exception


def _run(coro):
    """Run an async coroutine synchronously."""
    return asyncio.run(coro)


def _safe_resolve_config(overrides: dict | None = None, *, project_config_path: str | Path | None = None):
    """Resolve config with user-friendly error for missing env vars."""
    try:
        if project_config_path is None:
            return resolve_config(overrides)
        return resolve_config(overrides, project_config_path=project_config_path)
    except ConfigEnvVarError as e:
        click.echo(f"Configuration error: {e}", err=True)
        raise SystemExit(1) from None


# -- CLI param name → dotted config key mapping --
_PARAM_MAP = {
    "provider": "embedding.provider",
    "model": "embedding.model",
    "batch_size": "embedding.batch_size",
    "base_url": "embedding.base_url",
    "api_key": "embedding.api_key",
    "collection": "milvus.collection",
    "milvus_uri": "milvus.uri",
    "milvus_token": "milvus.token",
    "max_chunk_size": "chunking.max_chunk_size",
    "overlap_lines": "chunking.overlap_lines",
    "reranker_model": "reranker.model",
}


def _build_cli_overrides(**kwargs) -> dict:
    """Map flat CLI params to a nested config override dict.

    Only non-None values are included (None means "not set by user").
    """
    result: dict = {}
    for param, dotted_key in _PARAM_MAP.items():
        val = kwargs.get(param)
        if val is None:
            continue
        section, field = dotted_key.split(".")
        result.setdefault(section, {})[field] = val
    return result


def _cfg_to_mem_kwargs(cfg: MemConfig) -> dict:
    """Extract Mem constructor kwargs from a resolved config."""
    return {
        "embedding_provider": cfg.embedding.provider,
        "embedding_model": cfg.embedding.model or None,
        "embedding_batch_size": cfg.embedding.batch_size,
        "embedding_base_url": cfg.embedding.base_url or None,
        "embedding_api_key": cfg.embedding.api_key or None,
        "milvus_uri": cfg.milvus.uri,
        "milvus_token": cfg.milvus.token or None,
        "collection": cfg.milvus.collection,
        "max_chunk_size": cfg.chunking.max_chunk_size,
        "overlap_lines": cfg.chunking.overlap_lines,
        "reranker_model": cfg.reranker.model,
        "metadata_config": cfg.metadata,
    }


# -- Common CLI options --


def _common_options(f):
    """Shared options for commands that create a Mem instance."""
    f = click.option("--provider", "-p", default=None, help="Embedding provider.")(f)
    f = click.option("--model", "-m", default=None, help="Override embedding model.")(f)
    f = click.option("--batch-size", default=None, type=int, help="Embedding batch size (0 = provider default).")(f)
    f = click.option("--base-url", default=None, help="OpenAI-compatible API base URL.")(f)
    f = click.option("--api-key", default=None, help="API key for the embedding provider.")(f)
    f = click.option("--collection", "-c", default=None, help="Milvus collection name.")(f)
    f = click.option("--milvus-uri", default=None, help="Milvus connection URI.")(f)
    f = click.option("--milvus-token", default=None, help="Milvus auth token.")(f)
    return f


@click.group()
@click.version_option(package_name="mem")
def cli() -> None:
    """mem — semantic memory search for markdown knowledge bases."""


@cli.command()
@click.argument("paths", nargs=-1, required=True, type=click.Path(exists=True))
@_common_options
@click.option("--force", is_flag=True, help="Re-index all files.")
@click.option(
    "--max-chunk-size", default=None, type=click.IntRange(min=1), help="Max chunk size in characters (must be >= 1)."
)
@click.option("--description", default=None, help="Collection description (written on creation only).")
def index(
    paths: tuple[str, ...],
    provider: str | None,
    model: str | None,
    batch_size: int | None,
    base_url: str | None,
    api_key: str | None,
    collection: str | None,
    milvus_uri: str | None,
    milvus_token: str | None,
    force: bool,
    max_chunk_size: int | None,
    description: str | None,
) -> None:
    """Index markdown files from PATHS."""
    from .core import Mem

    cfg = _safe_resolve_config(
        _build_cli_overrides(
            provider=provider,
            model=model,
            batch_size=batch_size,
            base_url=base_url,
            api_key=api_key,
            collection=collection,
            milvus_uri=milvus_uri,
            milvus_token=milvus_token,
            max_chunk_size=max_chunk_size,
        )
    )
    ms = None
    try:
        ms = Mem(list(paths), **_cfg_to_mem_kwargs(cfg), description=description or "")
        n = _run(ms.index(force=force))
        click.echo(f"Indexed {n} chunks.")
    except MilvusException as e:
        click.echo(f"Milvus error (code {e.code}): {e.message}", err=True)
        raise SystemExit(1) from None
    finally:
        if ms is not None:
            ms.close()


@cli.command()
@click.argument("query")
@click.option("--top-k", "-k", default=None, type=int, help="Number of results.")
@click.option(
    "--source-prefix",
    default=None,
    type=click.Path(),
    help="Only search chunks whose source path starts with this prefix.",
)
@_common_options
@click.option("--reranker-model", default=None, help="Cross-encoder model for reranking (empty string disables).")
@click.option("--filter", "metadata_filters", multiple=True, help="Metadata filter as key=value. Repeatable.")
@click.option("--json-output", "-j", is_flag=True, help="Output as JSON.")
def search(
    query: str,
    top_k: int | None,
    source_prefix: str | None,
    provider: str | None,
    model: str | None,
    batch_size: int | None,
    base_url: str | None,
    api_key: str | None,
    collection: str | None,
    milvus_uri: str | None,
    milvus_token: str | None,
    reranker_model: str | None,
    metadata_filters: tuple[str, ...],
    json_output: bool,
) -> None:
    """Search indexed memory for QUERY."""
    from .core import Mem

    cfg = _safe_resolve_config(
        _build_cli_overrides(
            provider=provider,
            model=model,
            batch_size=batch_size,
            base_url=base_url,
            api_key=api_key,
            collection=collection,
            milvus_uri=milvus_uri,
            milvus_token=milvus_token,
            reranker_model=reranker_model,
        )
    )
    ms = None
    try:
        ms = Mem(**_cfg_to_mem_kwargs(cfg))
        results = _run(
            ms.search(query, top_k=top_k or 5, source_prefix=source_prefix, filters=_parse_metadata_filters(metadata_filters))
        )
        if json_output:
            click.echo(json.dumps(results, indent=2, ensure_ascii=False))
        else:
            if not results:
                click.echo("No results found.")
                return
            for i, r in enumerate(results, 1):
                score = r.get("score", 0)
                source = r.get("source", "?")
                heading = r.get("heading", "")
                content = r.get("content", "")
                click.echo(f"\n--- Result {i} (score: {score:.4f}) ---")
                click.echo(f"Source: {source}")
                if heading:
                    click.echo(f"Heading: {heading}")
                if len(content) > 500:
                    click.echo(content[:500])
                    chunk_hash = r.get("chunk_hash", "")
                    click.echo(f"  ... [truncated, run 'mem expand {chunk_hash}' for full content]")
                else:
                    click.echo(content)
    except MilvusException as e:
        click.echo(f"Milvus error (code {e.code}): {e.message}", err=True)
        raise SystemExit(1) from None
    finally:
        if ms is not None:
            ms.close()


def _parse_metadata_filters(items: tuple[str, ...]) -> dict[str, str]:
    filters: dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise click.BadParameter(f"metadata filter must be key=value: {item!r}")
        key, value = item.split("=", 1)
        if not key:
            raise click.BadParameter(f"metadata filter key is empty: {item!r}")
        filters[key] = value
    return filters


# ======================================================================
# Expand command (progressive disclosure L2)
#
# Shows the full heading section around a chunk, used by the Claude Code
# plugin's progressive disclosure workflow:
#   L1: `search` returns chunk snippets
#   L2: `expand` shows the full heading section around a chunk
#
# Works with mem's anchor comments embedded in memory files:
#   <!-- session:UUID turn:UUID transcript:PATH -->
# ======================================================================


@cli.command()
@click.argument("chunk_hash")
@click.option("--section/--no-section", default=True, help="Show full heading section (default).")
@click.option("--lines", "-n", default=None, type=int, help="Show N lines before/after instead of full section.")
@click.option("--json-output", "-j", is_flag=True, help="Output as JSON.")
@_common_options
def expand(
    chunk_hash: str,
    section: bool,
    lines: int | None,
    json_output: bool,
    provider: str | None,
    model: str | None,
    batch_size: int | None,
    base_url: str | None,
    api_key: str | None,
    collection: str | None,
    milvus_uri: str | None,
    milvus_token: str | None,
) -> None:
    """Expand a memory chunk to show full context. [Claude Code plugin: L2]

    Look up CHUNK_HASH in the index, then read the source markdown file
    to return the surrounding context (full heading section by default).

    Part of the progressive disclosure workflow (search -> expand -> transcript).
    """
    from .store import MilvusStore

    cfg = _safe_resolve_config(
        _build_cli_overrides(
            provider=provider,
            model=model,
            batch_size=batch_size,
            base_url=base_url,
            api_key=api_key,
            collection=collection,
            milvus_uri=milvus_uri,
            milvus_token=milvus_token,
        )
    )
    store = None
    try:
        store = MilvusStore(
            uri=cfg.milvus.uri,
            token=cfg.milvus.token or None,
            collection=cfg.milvus.collection,
            dimension=None,
        )
        chunks = store.query(filter_expr=f'chunk_hash == "{chunk_hash}"')
        if not chunks:
            click.echo(f"Chunk not found: {chunk_hash}", err=True)
            sys.exit(1)

        chunk = chunks[0]
        source = chunk["source"]
        start_line = chunk["start_line"]
        end_line = chunk["end_line"]
        heading = chunk.get("heading", "")
        heading_level = chunk.get("heading_level", 0)

        source_path = Path(source)
        if not source_path.exists():
            click.echo(f"Source file not found: {source}", err=True)
            sys.exit(1)

        all_lines = source_path.read_text(encoding="utf-8").splitlines()

        if lines is not None:
            # Show N lines before/after the chunk
            ctx_start = max(0, start_line - 1 - lines)
            ctx_end = min(len(all_lines), end_line + lines)
            expanded = "\n".join(all_lines[ctx_start:ctx_end])
            expanded_start = ctx_start + 1
            expanded_end = ctx_end
        else:
            # Show full section under the same heading
            expanded, expanded_start, expanded_end = _extract_section(
                all_lines,
                start_line,
                heading_level,
            )

        # Parse any anchor comments in the expanded text
        import re

        anchor_match = re.search(
            r"<!--\s*session:(\S+)\s+turn:(\S+)\s+transcript:(\S+)\s*-->",
            expanded,
        )
        anchor = {}
        if anchor_match:
            anchor = {
                "session": anchor_match.group(1),
                "turn": anchor_match.group(2),
                "transcript": anchor_match.group(3),
            }

        if json_output:
            result = {
                "chunk_hash": chunk_hash,
                "source": source,
                "heading": heading,
                "start_line": expanded_start,
                "end_line": expanded_end,
                "content": expanded,
            }
            if anchor:
                result["anchor"] = anchor
            click.echo(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            click.echo(f"Source: {source} (lines {expanded_start}-{expanded_end})")
            if heading:
                click.echo(f"Heading: {heading}")
            if anchor:
                click.echo(f"Session: {anchor['session']}  Turn: {anchor['turn']}")
                click.echo(f"Transcript: {anchor['transcript']}")
            click.echo(f"\n{expanded}")
    except MilvusException as e:
        click.echo(f"Milvus error (code {e.code}): {e.message}", err=True)
        raise SystemExit(1) from None
    finally:
        if store is not None:
            store.close()


def _extract_section(
    all_lines: list[str],
    start_line: int,
    heading_level: int,
) -> tuple[str, int, int]:
    """Extract the full section containing the chunk.

    Walks backward to find the section heading, then forward to the next
    heading of equal or higher level (or EOF).
    """
    # Find section start — walk backward to the heading
    section_start = start_line - 1  # 0-indexed
    if heading_level > 0:
        for i in range(start_line - 2, -1, -1):
            line = all_lines[i]
            if line.startswith("#"):
                level = len(line) - len(line.lstrip("#"))
                if level <= heading_level:
                    section_start = i
                    break

    # Find section end — walk forward to the next heading of same or higher level
    section_end = len(all_lines)
    if heading_level > 0:
        for i in range(start_line, len(all_lines)):
            line = all_lines[i]
            if line.startswith("#"):
                level = len(line) - len(line.lstrip("#"))
                if level <= heading_level:
                    section_end = i
                    break

    content = "\n".join(all_lines[section_start:section_end])
    return content, section_start + 1, section_end


@cli.command()
@click.option("--collection", "-c", default=None, help="Milvus collection name.")
@click.option("--milvus-uri", default=None, help="Milvus connection URI.")
@click.option("--milvus-token", default=None, help="Milvus auth token.")
def stats(
    collection: str | None,
    milvus_uri: str | None,
    milvus_token: str | None,
) -> None:
    """Show statistics about the index."""
    from .store import MilvusStore

    cfg = _safe_resolve_config(
        _build_cli_overrides(
            collection=collection,
            milvus_uri=milvus_uri,
            milvus_token=milvus_token,
        )
    )
    store = None
    try:
        store = MilvusStore(
            uri=cfg.milvus.uri,
            token=cfg.milvus.token or None,
            collection=cfg.milvus.collection,
            dimension=None,
        )
        count = store.count()
        click.echo(f"Total indexed chunks: {count}")
    except MilvusException as e:
        click.echo(f"Milvus error (code {e.code}): {e.message}", err=True)
        raise SystemExit(1) from None
    finally:
        if store is not None:
            store.close()


@cli.command()
@click.option("--collection", "-c", default=None, help="Milvus collection name.")
@click.option("--milvus-uri", default=None, help="Milvus connection URI.")
@click.option("--milvus-token", default=None, help="Milvus auth token.")
@click.confirmation_option(prompt="This will delete all indexed data. Continue?")
def reset(
    collection: str | None,
    milvus_uri: str | None,
    milvus_token: str | None,
) -> None:
    """Drop all indexed data."""
    from .store import MilvusStore

    cfg = _safe_resolve_config(
        _build_cli_overrides(
            collection=collection,
            milvus_uri=milvus_uri,
            milvus_token=milvus_token,
        )
    )
    store = None
    try:
        store = MilvusStore(
            uri=cfg.milvus.uri,
            token=cfg.milvus.token or None,
            collection=cfg.milvus.collection,
            dimension=None,
        )
        store.drop()
        click.echo("Dropped collection.")
    except MilvusException as e:
        click.echo(f"Milvus error (code {e.code}): {e.message}", err=True)
        raise SystemExit(1) from None
    finally:
        if store is not None:
            store.close()


# ======================================================================
# Config command group
# ======================================================================


@cli.group("config")
def config_group() -> None:
    """Manage mem configuration."""


@config_group.command("set")
@click.argument("key")
@click.argument("value")
@click.option("--project", is_flag=True, help="Write to project config.")
def config_set(key: str, value: str, project: bool) -> None:
    """Set a config value (e.g. mem config set milvus.uri http://host:19530)."""
    try:
        set_config_value(key, value, project=project)
        target = PROJECT_CONFIG_PATH if project else GLOBAL_CONFIG_PATH
        click.echo(f"Set {key} = {value} in {target}")
    except (KeyError, ValueError) as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@config_group.command("get")
@click.argument("key")
def config_get(key: str) -> None:
    """Get a resolved config value (e.g. mem config get milvus.uri)."""
    try:
        val = get_config_value(key)
        click.echo(val)
    except KeyError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@config_group.command("list")
@click.option("--resolved", "mode", flag_value="resolved", default=True, help="Show fully resolved config (default).")
@click.option("--global", "mode", flag_value="global", help="Show global config file only.")
@click.option("--project", "mode", flag_value="project", help="Show project config file only.")
def config_list(mode: str) -> None:
    """Show configuration."""
    import tomli_w

    if mode == "global":
        data = load_config_file(GLOBAL_CONFIG_PATH)
        label = f"Global ({GLOBAL_CONFIG_PATH})"
    elif mode == "project":
        data = load_config_file(PROJECT_CONFIG_PATH)
        label = f"Project ({PROJECT_CONFIG_PATH})"
    else:
        cfg = resolve_config()
        data = config_to_dict(cfg)
        label = "Resolved (all sources merged)"

    click.echo(f"# {label}\n")
    if data:
        click.echo(tomli_w.dumps(data))
    else:
        click.echo("(empty)")


# ======================================================================
# Session state command group
# ======================================================================


def _json_echo(value: object) -> None:
    click.echo(json.dumps(value, indent=2, ensure_ascii=False))


def _session_state_path(session_id: str | None) -> Path:
    from .session_state import resolve_state_path

    return resolve_state_path(session_id=session_id)


def _load_session_state(session_id: str | None) -> tuple[Path, dict]:
    from .session_state import load_state

    path = _session_state_path(session_id)
    state = load_state(path, session_id=session_id)
    cfg = _safe_resolve_config()
    from .session_state import filter_state_referenced_docs_by_include_paths

    return path, filter_state_referenced_docs_by_include_paths(state, cfg.session.referenced_doc_include_paths)


def _session_options(f):
    f = click.option("--session-id", default=None, help="Session id for default state path.")(f)
    return f


@cli.group("session")
def session_group() -> None:
    """Manage portable session state."""


@session_group.command("get")
@_session_options
def session_get(session_id: str | None) -> None:
    """Return full session state as JSON."""
    _path, state = _load_session_state(session_id)
    _json_echo(state)


@session_group.command("set-goal")
@click.argument("goal")
@_session_options
def session_set_goal(goal: str, session_id: str | None) -> None:
    """Set the session goal."""
    from .session_state import save_state, set_goal

    path, state = _load_session_state(session_id)
    _json_echo(save_state(set_goal(state, goal), path))


@session_group.command("ingest-transcript-docs")
@click.option("--transcript-path", required=True, type=click.Path(exists=True), help="Raw transcript JSONL path.")
@click.option("--repo-root", default=".", type=click.Path(), help="Repository root for path normalization.")
@click.option("--cwd", default=None, type=click.Path(), help="Command cwd fallback.")
@click.option("--turn-id", default="", help="Turn id to record on referenced docs.")
@_session_options
def session_ingest_transcript_docs(
    transcript_path: str,
    repo_root: str,
    cwd: str | None,
    turn_id: str,
    session_id: str | None,
) -> None:
    """Extract referenced docs from raw transcript JSONL and merge into state."""
    from .session_state import filter_referenced_docs_by_include_paths, merge_referenced_docs, save_state
    from .transcript_docs import extract_referenced_docs_from_transcript

    path, state = _load_session_state(session_id)
    cfg = _safe_resolve_config(project_config_path=Path(repo_root) / ".mem" / "mem.toml")
    docs = extract_referenced_docs_from_transcript(transcript_path, repo_root=repo_root, cwd=cwd, turn_id=turn_id)
    docs = filter_referenced_docs_by_include_paths(docs, cfg.session.referenced_doc_include_paths)
    updated = save_state(merge_referenced_docs(state, docs), path)
    _json_echo({"referenced_docs": updated["referenced_docs"], "added_count": len(docs)})


@session_group.group("docs")
def session_docs_group() -> None:
    """Inspect session referenced documents."""


@session_docs_group.command("list")
@_session_options
def session_docs_list(session_id: str | None) -> None:
    """List referenced documents as JSON."""
    from .session_state import list_docs

    _path, state = _load_session_state(session_id)
    _json_echo(list_docs(state))


@session_group.group("verification")
def session_verification_group() -> None:
    """Inspect or update implementation verification status."""


@session_verification_group.command("get")
@_session_options
def session_verification_get(session_id: str | None) -> None:
    """Return verification status as JSON."""
    from .session_state import get_verification_status

    _path, state = _load_session_state(session_id)
    _json_echo(get_verification_status(state))


@session_verification_group.command("set-status")
@click.argument("status")
@click.option("--report-path", default=None, help="Verification report path.")
@_session_options
def session_verification_set_status(status: str, report_path: str | None, session_id: str | None) -> None:
    """Set verification status."""
    from .session_state import get_verification_status, save_state, set_verification_status

    path, state = _load_session_state(session_id)
    updated = save_state(set_verification_status(state, status, report_path=report_path), path)
    _json_echo(get_verification_status(updated))
