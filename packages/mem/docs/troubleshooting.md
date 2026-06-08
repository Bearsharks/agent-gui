# Troubleshooting

This page covers common `mem` search-engine issues that affect the Python library and CLI.

## Search returns no results

Start with basic index health checks:

```bash
mem stats
mem search "your query here" --top-k 5
```

If `stats` shows 0 or the count is unexpectedly low, rebuild the index:

```bash
mem index . --force
```

Common causes:

- the relevant markdown files were never indexed
- the index is stale and needs re-indexing
- the query is too short or vague
- the embedding provider/model changed after the collection was created

## Dimension mismatch

A dimension mismatch means the existing Milvus collection was created with one embedding dimension, but your current embedding provider/model is producing a different vector size.

Typical fix:

```bash
mem reset --yes
mem index .
```

This is safe because your markdown files are the source of truth; resetting only drops the vector index.

## API key missing

If you use a hosted embedding provider, make sure the expected API key is present.

Common environment variables:

- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `VOYAGE_API_KEY`

If you do not want to manage API keys, switch to a local provider such as ONNX, Ollama, or `local` sentence-transformers.

## Windows + Milvus Lite

Milvus Lite (the default local `.db` backend) does not provide Windows binaries.

On Windows, use one of these options instead:

- Milvus Server via Docker
- Zilliz Cloud
- WSL2 if you specifically want the local Milvus Lite workflow

See [Getting Started — Milvus Backends](getting-started.md#milvus-backends).

## Rebuild from source markdown

To wipe the current collection and rebuild from markdown files:

```bash
mem reset --yes
mem index .
```

Useful when:

- you switched embedding providers/models
- search quality looks wrong after a configuration change
- you want to confirm the stored vectors match the current source markdown

## Inspect what is indexed

Use `stats` for a quick count:

```bash
mem stats
```

Then inspect actual content with progressive disclosure:

```bash
mem search "redis ttl"
mem expand <chunk_id>
```

## Remote Milvus stats look stale

On remote Milvus Server / Zilliz Cloud, `stats` may lag immediately after upserts because collection stats update after flush/compaction.

Search results are still the better source of truth for "is my content searchable right now?"

## First local model download is slow

Local embedding setups such as ONNX may need to download model artifacts on first use. That initial run can feel slow compared with later runs.

If you want to warm the cache ahead of time, run a dummy command once:

```bash
mem search "warmup"
```
