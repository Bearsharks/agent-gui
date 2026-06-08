# Python API

The Python API exposes the same search-engine operations as the retained CLI.

## `Mem`

```python
from mem import Mem

mem = Mem(
    paths=["./docs"],
    embedding_provider="local",
    milvus_uri=".mem/index.db",
    collection="project_docs",
)
```

Important constructor inputs:

| Parameter | Description |
| --- | --- |
| `paths` | Markdown files or directories used by `index()`. |
| `embedding_provider` | Provider used for indexing and searching. |
| `embedding_model` | Optional provider model override. |
| `embedding_base_url` | Optional OpenAI-compatible endpoint. |
| `embedding_api_key` | Optional provider API key. |
| `milvus_uri` | Milvus Lite file path or server URI. |
| `milvus_token` | Milvus auth token. |
| `collection` | Collection name. |
| `max_chunk_size` | Heading section split threshold. |
| `overlap_lines` | Line overlap for oversized paragraph splits. |
| `reranker_model` | Optional reranker model. |

## `index`

```python
await mem.index(force=False)
```

Scans configured paths, chunks markdown, embeds new or changed chunks, upserts
them into Milvus, and removes stale chunks for deleted or changed files.

## `search`

```python
results = await mem.search("current document system", top_k=10)
```

Returns ranked chunk dictionaries. Typical fields:

| Field | Description |
| --- | --- |
| `content` | Chunk text. |
| `source` | Source path. |
| `heading` | Nearest heading. |
| `chunk_hash` | Primary key used by `expand`. |
| `heading_level` | Heading depth. |
| `start_line` | Source start line. |
| `end_line` | Source end line. |
| `score` | Final ranking score. |

## `expand`

```python
context = await mem.expand(chunk_hash, section=True)
```

Reads the source file and returns the surrounding section or a requested line
window for a stored chunk hash.

## `stats`

```python
stats = await mem.stats()
```

Returns collection statistics such as indexed chunk count.

## `reset`

```python
await mem.reset()
```

Drops the selected Milvus collection. Source markdown files are not modified.

## Lifecycle

Call `mem.close()` when the instance is no longer needed, or use an async context
manager if available in the current package version.

```python
mem.close()
```

## Scope

The Phase 10 API reference intentionally excludes upstream `compact()` and
`watch()` methods because those features are removed from `mem`.
