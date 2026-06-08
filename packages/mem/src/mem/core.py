"""Mem — main orchestrator class."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from .chunker import Chunk, chunk_markdown, clean_content_for_embedding, compute_chunk_id
from .embeddings import EmbeddingProvider, get_provider
from .metadata import (
    MetadataConfig,
    build_metadata_filter_expr,
    load_metadata_extractor,
    metadata_record_fields,
    normalize_metadata,
)
from .scanner import ScannedFile, scan_paths
from .store import MilvusStore

logger = logging.getLogger(__name__)


class Mem:
    """High-level API for semantic memory search.

    Parameters
    ----------
    paths:
        Directories / files to index.
    embedding_provider:
        Name of the embedding backend (``"openai"``, ``"google"``, etc.).
    embedding_model:
        Override the default model for the chosen provider.
    milvus_uri:
        Milvus connection URI.  A local ``*.db`` path uses Milvus Lite,
        ``http://host:port`` connects to a Milvus server, and a
        ``https://*.zillizcloud.com`` URL connects to Zilliz Cloud.
    milvus_token:
        Authentication token for Milvus server or Zilliz Cloud.
        Not needed for Milvus Lite (local).
    collection:
        Milvus collection name.  Use different names to isolate
        agents sharing the same Milvus server.
    """

    def __init__(
        self,
        paths: list[str | Path] | None = None,
        *,
        embedding_provider: str = "openai",
        embedding_model: str | None = None,
        embedding_batch_size: int = 0,
        embedding_base_url: str | None = None,
        embedding_api_key: str | None = None,
        milvus_uri: str = "~/.mem/index/milvus.db",
        milvus_token: str | None = None,
        collection: str = "mem_chunks",
        description: str = "",
        max_chunk_size: int = 1500,
        overlap_lines: int = 2,
        reranker_model: str = "",
        metadata_config: MetadataConfig | None = None,
    ) -> None:
        self._paths = [str(p) for p in (paths or [])]
        self._max_chunk_size = max_chunk_size
        self._overlap_lines = overlap_lines
        self._metadata_config = metadata_config or MetadataConfig()
        self._metadata_extractor = load_metadata_extractor(self._metadata_config)
        self._embedder: EmbeddingProvider = get_provider(
            embedding_provider,
            model=embedding_model,
            batch_size=embedding_batch_size,
            base_url=embedding_base_url,
            api_key=embedding_api_key,
        )
        self._store = MilvusStore(
            uri=milvus_uri,
            token=milvus_token,
            collection=collection,
            dimension=self._embedder.dimension,
            description=description,
            metadata_config=self._metadata_config,
        )
        self._reranker_model = reranker_model

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------

    async def index(self, *, force: bool = False) -> int:
        """Scan paths and index all markdown files.

        Returns the number of chunks indexed.  Also removes chunks for
        files that no longer exist on disk (deleted-file cleanup).
        """
        files = scan_paths(self._paths)
        total = 0
        failed = 0
        active_sources: set[str] = set()
        for f in files:
            active_sources.add(str(f.path))
            try:
                n = await self._index_file(f, force=force)
                total += n
            except Exception:
                failed += 1
                logger.exception("Failed to index %s, skipping", f.path)

        # Clean up chunks for files that no longer exist
        indexed_sources = self._store.indexed_sources()
        for source in indexed_sources:
            if source not in active_sources:
                self._store.delete_by_source(source)
                logger.info("Removed stale chunks for deleted file: %s", source)

        if failed:
            logger.warning("Indexed %d chunks from %d files (%d files failed)", total, len(files) - failed, failed)
        else:
            logger.info("Indexed %d chunks from %d files", total, len(files))
        return total

    async def index_file(self, path: str | Path) -> int:
        """Index a single file.  Returns number of chunks."""
        p = Path(path).expanduser().resolve()
        _st = p.stat()
        sf = ScannedFile(path=p, mtime=_st.st_mtime, size=_st.st_size)
        return await self._index_file(sf)

    async def _index_file(self, f: ScannedFile, *, force: bool = False) -> int:
        source = str(f.path)
        text = f.path.read_text(encoding="utf-8")
        chunks = chunk_markdown(
            text,
            source=source,
            max_chunk_size=self._max_chunk_size,
            overlap_lines=self._overlap_lines,
        )
        model = self._embedder.model_name

        # Compute composite chunk IDs (matching OpenClaw format)
        chunk_ids = {compute_chunk_id(c.source, c.start_line, c.end_line, c.content_hash, model) for c in chunks}
        old_ids = self._store.hashes_by_source(source)

        # Delete stale chunks that are no longer in the file
        stale = old_ids - chunk_ids
        if stale:
            self._store.delete_by_hashes(list(stale))

        if not chunks:
            return 0

        if not force:
            # Only embed chunks whose ID doesn't already exist
            chunks = [
                c
                for c in chunks
                if compute_chunk_id(c.source, c.start_line, c.end_line, c.content_hash, model) not in old_ids
            ]
            if not chunks:
                return 0

        return await self._embed_and_store(chunks)

    async def _embed_and_store(self, chunks: list[Chunk]) -> int:
        if not chunks:
            return 0

        model = self._embedder.model_name
        # Clean content for embedding: strip HTML comments and metadata noise
        # so the embedding vector captures semantics, not UUIDs/paths.
        # The original content is preserved in the Milvus record below.
        contents = [clean_content_for_embedding(c.content) for c in chunks]
        embeddings = await self._embedder.embed(contents)

        records: list[dict[str, Any]] = []
        for i, chunk in enumerate(chunks):
            chunk_id = compute_chunk_id(
                chunk.source,
                chunk.start_line,
                chunk.end_line,
                chunk.content_hash,
                model,
            )
            records.append(
                {
                    "chunk_hash": chunk_id,
                    "embedding": embeddings[i],
                    "content": chunk.content,
                    "source": chunk.source,
                    "heading": chunk.heading,
                    "heading_level": chunk.heading_level,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    **self._metadata_fields(chunk.source),
                }
            )

        return self._store.upsert(records)

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    async def search(
        self,
        query: str,
        *,
        top_k: int = 10,
        source_prefix: str | Path | None = None,
        filters: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        """Semantic search across indexed chunks.

        Parameters
        ----------
        query:
            Natural-language query.
        top_k:
            Maximum results to return.
        source_prefix:
            Optional path prefix to scope results. Only chunks whose
            ``source`` starts with this prefix are returned.

        Returns
        -------
        list[dict]
            Each dict contains ``content``, ``source``, ``heading``,
            ``score``, and other metadata.
        """
        filter_parts = []
        if source_prefix is not None:
            prefix = str(Path(source_prefix).expanduser().resolve())
            escaped = prefix.replace("\\", "\\\\").replace('"', '\\"')
            filter_parts.append(f'source like "{escaped}%"')
        metadata_filter = build_metadata_filter_expr(filters, self._metadata_config)
        if metadata_filter:
            filter_parts.append(metadata_filter)
        filter_expr = " && ".join(filter_parts)

        embeddings = await self._embedder.embed([query])
        fetch_k = top_k * 3 if self._reranker_model else top_k
        results = self._store.search(embeddings[0], query_text=query, top_k=fetch_k, filter_expr=filter_expr)
        if self._reranker_model and results:
            from .reranker import rerank

            results = rerank(query, results, model_name=self._reranker_model, top_k=top_k)
        return results

    def _metadata_fields(self, source: str) -> dict[str, Any]:
        metadata_config = getattr(self, "_metadata_config", MetadataConfig())
        if not metadata_config.enabled:
            return {}
        metadata_extractor = getattr(self, "_metadata_extractor", None)
        raw = metadata_extractor(source) if metadata_extractor is not None else {}
        metadata = normalize_metadata(raw, metadata_config)
        return metadata_record_fields(metadata, metadata_config)

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    @property
    def store(self) -> MilvusStore:
        return self._store

    def close(self) -> None:
        """Release resources."""
        self._store.close()

    def __enter__(self) -> Mem:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
