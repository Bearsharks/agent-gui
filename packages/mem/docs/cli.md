# CLI Reference

`mem` keeps the `mem` search-engine CLI surface needed for indexing,
querying, expanding, inspecting, and resetting a markdown-backed Milvus index.
It also owns a small portable session state surface used by external Stop hook
adapters to preserve goals and referenced documents.

Phase 10 removes non-search-engine commands such as `watch`, `compact`, and
interactive `config init`.

## Commands

| Command | Description |
| --- | --- |
| `mem index` | Scan markdown files and index chunks into Milvus. |
| `mem search` | Run hybrid dense + BM25 search and return ranked chunks. |
| `mem expand` | Expand one chunk hash back to source-file context. |
| `mem stats` | Show collection chunk count. |
| `mem reset` | Drop the selected Milvus collection. |
| `mem config set` | Persist one dotted config key. |
| `mem config get` | Read one resolved config key. |
| `mem config list` | Print resolved, global, or project config. |
| `mem session get` | Print portable session state as JSON. |
| `mem session set-goal` | Set the session goal. |
| `mem session docs list` | List hook-owned referenced documents. |
| `mem session verification get` | Print implementation verification status. |
| `mem session verification set-status` | Record implementation verification status and report path. |
| `mem session ingest-transcript-docs` | Merge referenced docs from raw Codex transcript JSONL. |

## Configuration

Config resolution keeps the upstream layered model:

```text
defaults -> ~/.mem/config.toml -> .mem/mem.toml -> CLI flags
```

The retained config sections are:

```toml
[milvus]
uri = "~/.mem/index/milvus.db"
token = ""
collection = "mem_chunks"

[embedding]
provider = "openai"
model = ""
batch_size = 0
base_url = ""
api_key = ""

[chunking]
max_chunk_size = 1500
overlap_lines = 2

[reranker]
model = ""

[session]
referenced_doc_include_paths = []
```

## `index`

Indexes one or more files or directories. Markdown files are chunked by heading,
deduplicated by content hash and embedding model, embedded, and upserted into
Milvus. Re-indexing unchanged files should not create duplicate chunks.

Common flags:

| Flag | Description |
| --- | --- |
| `--provider` | Embedding provider. |
| `--model` | Embedding model override. |
| `--base-url` | OpenAI-compatible embedding endpoint. |
| `--api-key` | Embedding API key or value resolved by config. |
| `--collection` | Milvus collection name. |
| `--milvus-uri` | Milvus Lite file or server URI. |
| `--milvus-token` | Milvus auth token. |
| `--max-chunk-size` | Chunk size override. |
| `--overlap-lines` | Paragraph split overlap override. |
| `--force` | Re-embed all chunks even if content hash already exists. |

## `search`

Embeds the query, performs Milvus hybrid retrieval over dense vectors and BM25
sparse vectors, and returns RRF-ranked results.

Common flags:

| Flag | Description |
| --- | --- |
| `--top-k` | Number of final results. |
| `--json-output` | Return machine-readable JSON with full fields. |
| `--provider`, `--model` | Must match the indexed embedding space. |
| `--reranker` | Optional reranker model. Empty value disables reranking. |
| `--collection`, `--milvus-uri`, `--milvus-token` | Target Milvus index. |
| `--filter key=value` | Filter by a configured filterable metadata field. Repeatable. |

The provider and model used for search must match the provider and model used
for indexing. Mixing embedding spaces produces meaningless similarity scores.

## Metadata

Projects can define metadata fields and an extractor in `.mem/mem.toml`.
Metadata is stored on each chunk at index time. Filterable fields are also
stored as Milvus scalar fields and can be used by `mem search --filter`.

`mem`은 프로젝트별 문서 규칙을 직접 알지 않습니다. 인덱싱 중 각 chunk의 source
path를 설정된 extractor 함수에 넘기고, 반환된 dict를 설정 schema에 맞춰
저장합니다. 따라서 extractor script의 소유권은 각 프로젝트에 있고, `mem`은
그 결과를 index record로 materialize하는 역할만 합니다.

```toml
[metadata.extractor]
path = ".mem/metadata.py"
function = "metadata_for_path"

[metadata.fields.authority_layer]
type = "keyword"
filterable = true
default = "unknown"

[metadata.fields.doc_kind]
type = "keyword"
filterable = true
default = "unknown"
```

The extractor receives the chunk source path and returns a dictionary:

```python
def metadata_for_path(path: str) -> dict:
    return {
        "authority_layer": "generated",
        "doc_kind": "spec",
    }
```

If metadata settings or extractor behavior changes, reset and re-index the
collection so stored chunk metadata and filter fields are refreshed.

예를 들어 `--filter doc_kind=prd`는 filterable field `doc_kind`가 설정되어 있을
때 Milvus expression `meta_doc_kind == "prd"`로 변환되어 hybrid search에 직접
적용됩니다.

## `expand`

Looks up one `chunk_hash` and reads the original source markdown file to return
the surrounding section or a requested line window.

Important behavior:

- The source file must still exist.
- `--json-output` returns structured context.
- Anchor comments in the expanded section are parsed when present.

## `stats`

Returns the indexed chunk count for the selected collection. Remote Milvus stats
can lag immediately after writes, but search results are available after upsert.

## `reset`

Drops the selected collection. This deletes the derived vector index only; source
markdown files are not modified and can be re-indexed.

Use `--yes` for non-interactive scripts.

## Session State

Session state is stored as schema v1 JSON. The default path is:

```text
.mem/session-state/<session-id>.json
```

The path is derived only from the session id. The session id can be passed with
`--session-id`. In Codex, `CODEX_THREAD_ID` is used automatically when no
explicit session id is supplied. Outside Codex, `MEM_SESSION_ID` can provide the
default session id.

Core commands:

```bash
mem session set-goal "Implement portable session state" --session-id "$SESSION_ID"
mem session docs list --session-id "$SESSION_ID"
mem session verification set-status running \
  --report-path ".agents/verification/reports/demo.md" \
  --session-id "$SESSION_ID"
```

Verification status is stored with the latest update time and report path:

```json
{
  "verification_status": "not_run",
  "verification_updated_at": "",
  "verification_report_path": ""
}
```

Canonical status values are `not_run`, `running`, `passed`, `failed`, and
`error`. The CLI and MCP setter also accept Korean aliases: `검증전`, `검증중`,
`통과`, `실패`, and `에러`.

Stop hook adapters can update referenced docs from raw Codex transcript JSONL:

```bash
mem session ingest-transcript-docs \
  --transcript-path "$TRANSCRIPT_PATH" \
  --repo-root "$REPO_ROOT" \
  --turn-id "$TURN_ID" \
  --session-id "$SESSION_ID"
```

`referenced_docs` is hook-owned state. Agents can inspect it through
`mem session docs list` or MCP `docs.list`, but portable `mem` does not expose
`docs.mark_read`, `docs.remove`, or any other referenced-doc write tool.
Only `content_read` entries are persisted in `referenced_docs`; path-only
discoveries such as `rg --files`, `find`, `ls`, or `rg -l` are ignored.
Set `session.referenced_doc_include_paths` in `.mem/mem.toml` to keep only
content-read files under specific repo-relative paths:

```toml
[session]
referenced_doc_include_paths = ["docs", "docs_canonical", "docs_generated"]
```

Stop hook adapters should call `ingest-transcript-docs` on every Stop event.
The repository-local Codex Stop hook gates only explicit completion
declarations. Completion is declared only when the latest assistant message is
exactly `MISSION COMPLETE!!` after trimming whitespace. If the full message does
not match exactly, stop is allowed. If completion is declared, stop is allowed
only when `verification_status` is `passed` or `error`; otherwise the hook
blocks with a reason that includes the current `verification_status`.

The repository-local Codex Stop hook adapter lives in `mem`:

```bash
bash mem/scripts/session-state-stop.sh
```

It reads Codex Stop hook JSON from stdin, derives the session id, updates
`referenced_docs` from `transcript_path`, checks explicit completion against
verification status, and returns either `{}` or a Codex `decision:block`
response with the reason.

## Session MCP

`mcp` is a default `mem` dependency. A standard install includes the MCP server:

```bash
mem-session-mcp --session-id "$SESSION_ID"
```

The server exposes:

```text
state.get
state.set_goal
docs.list
verification.get
verification.set_status
```

MCP handlers are thin wrappers over the same state service used by the CLI.
Every MCP tool requires a `sessionId` argument. Agents should pass the current
Codex session/thread id on every MCP call, for example:

```json
{"sessionId": "019e1bb1-d94a-7e23-b9ed-811f232d9ccd"}
```

Do not call session MCP tools with `{}` and do not use `default` as a session id.
If the session id is unknown, inspect the current Codex session/thread id before
calling the tool.

## Environment Variables

Embedding providers read API keys from environment variables unless the key is
provided by config or CLI.

| Variable | Provider |
| --- | --- |
| `OPENAI_API_KEY` | `openai` |
| `GOOGLE_API_KEY` | `google` |
| `VOYAGE_API_KEY` | `voyage` |
| `JINA_API_KEY` | `jina` |
| `MISTRAL_API_KEY` | `mistral` |
| `OLLAMA_HOST` | `ollama` endpoint override |
