# mem Agent Notes

`mem` is maintained as a dependency-style search engine package. Keep changes
inside this directory focused on search-engine behavior unless a task explicitly
targets the surrounding memory system.

## Commands

Run tests from the repository root:

```bash
uv run --project mem python -m pytest -q mem/tests
```

Run tests from inside `mem/`:

```bash
uv run python -m pytest -q
```

Use `python -m pytest` instead of the bare `pytest` console script to avoid stale
entrypoint issues.

## Scope

Retained search surface:

- markdown scanning and chunking
- embedding provider abstraction
- Milvus dense + BM25 hybrid indexing
- RRF-ranked search
- optional reranker configuration
- `index`, `search`, `expand`, `stats`, `reset`, and non-interactive config commands
- session state/checklist MCP and CLI helpers for long-running agent recovery
- raw transcript referenced-doc extraction helpers for external Stop hooks

Removed or separated surface:

- file watching
- LLM compaction or summarization
- platform plugin packaging
- prompt distribution
- interactive config wizard

## Documentation

Local package documentation lives in `docs/`. The inAX-level migration and phase
planning documents live outside this package under `../docs/mem/`.
