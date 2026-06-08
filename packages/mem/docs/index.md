# mem Documentation

This directory keeps the local documentation for the `mem` search engine package.
`mem` is maintained as a separate dependency-style project inside this repository;
inAX consumes it instead of treating its documents as inAX product documentation.

The retained documents are upstream `mem` references that are still useful
for Phase 10 because `mem` intentionally preserves the core search behavior while
removing non-search features.

## Core References

- [Architecture](architecture.md): chunking, deduplication, Milvus schema, hybrid search, and RRF.
- [CLI Reference](cli.md): index, search, expand, stats, reset, and config command contracts.
- [Python API](python-api.md): `Mem` API shape and result structure.
- [Design Philosophy](design-philosophy.md): hybrid search and Milvus rationale.
- [Getting Started](getting-started.md): setup, Milvus backend, and embedding provider notes.
- [Troubleshooting](troubleshooting.md): rebuild, dimension mismatch, API key, and inspection guidance.
- [FAQ](faq.md): common operational questions.
- [Embedding Model Evaluation](home/embedding-evaluation.md): bge-m3 selection rationale.

## Scope Notes

The removed upstream docs covered platform plugins, marketplace installation,
live watch workflows, compact/summarization workflows, broad integrations, and
marketing pages. Those areas are outside the Phase 10 search-engine parity goal.

## Metadata Notes

`mem`은 프로젝트별 metadata 의미를 내장하지 않습니다. 프로젝트가
metadata extractor와 field schema를 설정으로 주입하면, `mem`은 인덱싱 시
extractor를 호출하고 반환된 dict를 chunk record에 저장합니다. filterable field는
Milvus scalar field `meta_<field>`로 materialize되어 검색 필터에 사용됩니다.

inAX의 경로 기반 metadata 규칙은 `.mem/metadata.py`에 있으며, 이 파일은
`mem` 패키지의 일부가 아니라 inAX adapter입니다. extractor 규칙이나 metadata
schema를 바꾸면 기존 index를 reset/reindex해야 합니다.
