# Design Philosophy

`mem` keeps the parts of `mem` that directly affect search quality and
portability.

## Markdown as Source of Truth

Markdown files remain the durable source. The vector database is only a derived
index. This keeps memory reviewable, versionable, and rebuildable.

## Search Quality First

The core value is hybrid retrieval:

- Dense vectors capture semantic similarity.
- BM25 sparse retrieval captures exact terms, symbols, and file-specific names.
- RRF combines the two rankings without requiring fragile score calibration.

Phase 10 treats this behavior as a parity target with upstream `mem`.

## Milvus Backend

Milvus is retained because it supports dense vectors, sparse vectors, BM25
functions, metadata fields, and local Milvus Lite usage behind one API surface.
That keeps development usage and server-backed usage close enough to test with
the same search contract.

## Conservative Pruning

Removed features are not considered bad features; they are simply not part of
the search engine package boundary.

Removed or separated areas:

- file watching and automatic indexing loops
- LLM compaction and summarization
- platform plugin packaging
- prompt distribution
- interactive setup wizards

Those responsibilities belong to the outer memory system or to project-specific
integration code.
