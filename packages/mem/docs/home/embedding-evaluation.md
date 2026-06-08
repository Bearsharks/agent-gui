# Embedding Model Evaluation

This page preserves the upstream benchmark used to justify **ONNX bge-m3 int8** as a strong local embedding model for memory retrieval. `mem` keeps this document as model-selection evidence, not as platform plugin documentation.

If you just want the answer: on our real-world memory-retrieval benchmark (955 chunks / 2172 bilingual queries), `gpahal/bge-m3-onnx-int8` lost only ~1% recall to the full-precision PyTorch model while cutting the on-disk model size from 2.2 GB to 558 MB and dropping the `torch` dependency entirely. It also outperforms OpenAI `text-embedding-3-small` on Chinese retrieval (Recall@5 0.776 vs 0.717), so we can ship a zero-config default that is better than the old API-key default on real user data.

---

## Goal

Pick a default local embedding model for memory search that is:

- **Good at bilingual retrieval** — mem users write memory in both Chinese and English; a model that crashes on one language is unusable.
- **Local and zero-config** — no API key, no GPU requirement, no `torch` install.
- **Small enough to auto-download** on first use without scaring users.
- **Cheap on a loaded CPU** — indexing may run repeatedly during development.

## Dataset

We built the evaluation set from real mem memory logs (`.mem/memory/*.md`) collected across 12 projects, so the domain matches what users actually index.

1. **Collect** — Scan markdown memory files, chunk by heading using mem's `chunk_markdown()`.
2. **Clean** — Remove HTML comments, drop short chunks (<50 chars), sanitize sensitive data (paths, IPs, tokens).
3. **Annotate** with `gpt-4o-mini`:
    - **Simple** (1 per chunk) — straightforward factual questions.
    - **Complex** (1 per substantial chunk) — reasoning-required questions.
    - **Multi-hop** (group related chunks by project + date) — questions needing 2+ chunks to answer.
4. **Translate** — Chinese ↔ English for bilingual coverage.

Final dataset: **955 chunks × 2172 queries** (955 simple + 926 complex + 291 multi-hop), available in both Chinese and English.

## Models evaluated

12 models across four categories, plus two ONNX variants of bge-m3:

| # | Provider | Model | Size |
|---|----------|-------|------|
| 1 | openai | `text-embedding-3-small` | API |
| 2 | openai | `text-embedding-3-large` | API |
| 3 | local | `BAAI/bge-m3` (PyTorch) | 1.7 GB |
| 4 | local | `sentence-transformers/all-MiniLM-L6-v2` | 91 MB |
| 5 | local | `intfloat/multilingual-e5-small` | 471 MB |
| 6 | local | `intfloat/multilingual-e5-base` | 1.1 GB |
| 7 | local | `Qwen/Qwen3-Embedding-0.6B` | ~1.2 GB |
| 8 | local | `paraphrase-multilingual-MiniLM-L12-v2` | 471 MB |
| 9 | local | `paraphrase-multilingual-mpnet-base-v2` | 1.1 GB |
| 10 | ollama | `nomic-embed-text` | 274 MB |
| 11 | ollama | `mxbai-embed-large` | 669 MB |
| 12 | ollama | `dengcao/Qwen3-Embedding-8B` (Q5_K_M) | 5.4 GB |
| — | onnx | `bge-m3` ONNX fp32 | 2.2 GB |
| — | onnx | `gpahal/bge-m3-onnx-int8` | 558 MB |

## Metrics

For each model we measured retrieval quality using:

- **Recall@K** (K = 1, 5, 10) — does the correct chunk appear in the top-K results?
- **MRR** — Mean Reciprocal Rank; average position of the first correct result.
- **NDCG@10** — normalized discounted cumulative gain.

For agent memory recall, where callers usually surface only a few chunks, **Recall@5** is the primary metric and MRR is secondary.

## Results

Ranked by Chinese Recall@5 (our primary metric — English is easy mode for most multilingual models):

| Rank | Model | Size | zh R@5 | en R@5 | zh MRR | en MRR |
|------|-------|------|--------|--------|--------|--------|
| 1 | **BAAI/bge-m3** (PyTorch) | 1.7 GB | **0.783** | **0.815** | 0.637 | 0.661 |
| 2 | **bge-m3 ONNX int8** | 558 MB | **0.776** | 0.814 | 0.642 | — |
| 3 | `text-embedding-3-large` | API | 0.750 | 0.797 | 0.603 | 0.636 |
| 4 | `Qwen3-Embedding-0.6B` | ~1.2 GB | 0.739 | 0.733 | 0.588 | 0.573 |
| 5 | `text-embedding-3-small` | API | 0.717 | 0.767 | 0.574 | 0.615 |
| 6 | `multilingual-e5-small` | 471 MB | 0.653 | 0.741 | 0.520 | 0.586 |
| 7 | `multilingual-e5-base` | 1.1 GB | 0.644 | 0.733 | 0.512 | 0.586 |
| 8 | `paraphrase-multilingual-mpnet` | 1.1 GB | 0.548 | 0.672 | 0.413 | 0.519 |
| 9 | `paraphrase-multilingual-MiniLM` | 471 MB | 0.550 | 0.640 | 0.412 | 0.498 |
| 10 | `nomic-embed-text` | 274 MB | 0.402 | 0.756 | 0.287 | 0.608 |
| 11 | `mxbai-embed-large` | 669 MB | 0.377 | 0.743 | 0.269 | 0.597 |
| 12 | `all-MiniLM-L6-v2` | 91 MB | 0.203 | 0.651 | 0.129 | 0.503 |
| 13 | `Qwen3-Embedding-8B` (Q5) | 5.4 GB | 0.201 | 0.230 | 0.140 | 0.166 |

### ONNX vs PyTorch, same bge-m3 weights

| Variant | Model size | zh R@5 | Quality vs PyTorch baseline | Runtime deps |
|---------|-----------|--------|------------------------------|--------------|
| PyTorch fp32 (GPU) | 2.2 GB | 0.783 | baseline | `torch` + `sentence-transformers` (~2 GB+) |
| ONNX fp32 (CPU) | 2.2 GB | 0.791 | +1.1 % | `onnxruntime` (~200 MB) |
| ONNX int8 (CPU) | 558 MB | 0.776 | −1.1 % | `onnxruntime` (~200 MB) |

## Key findings

1. **bge-m3 is the best model overall** — it beats all 12 competitors on both Chinese and English.
2. **ONNX int8 quantization costs only ~1 %** while shrinking the model from 2.2 GB to 558 MB and the runtime deps from ~2 GB to ~200 MB.
3. **CPU is enough** — no GPU required, so any development machine can run it.
4. **Ollama English-centric models collapse on Chinese** — `nomic-embed-text` and `mxbai-embed-large` score well on English but zh R@5 < 0.40. Not safe as a bilingual default.
5. **Q5 quantization destroys embedding quality.** `Qwen3-Embedding-8B` at Q5 ranked last despite being 5.4 GB. Quantization is not free at the 5-bit level for embeddings.
6. **OpenAI large is barely better than small** — +3–4 % at double the cost. Not worth it for memory retrieval.

## Why we switched to ONNX bge-m3

Compared with OpenAI `text-embedding-3-small`, ONNX bge-m3 int8 is useful as a local default candidate because:

- **No API key required** — works without hosted embedding credentials.
- **CPU-only** — no GPU needed, accessible on every laptop.
- **Small enough to auto-download** — 558 MB on first use, cached at `~/.cache/huggingface/hub/`.
- **Comparable or better quality** — roughly equal to OpenAI `text-embedding-3-small` on English, and **meaningfully better on Chinese** (0.776 vs 0.717 Recall@5 on our data).
- **Completely free** — no per-token API cost; everything runs locally.
- **Lightweight deps** — `onnxruntime` + `tokenizers` + `huggingface-hub` (~200 MB) instead of `torch` + `sentence-transformers` (~2 GB+).

## Re-indexing after provider changes

- Existing OpenAI-indexed collections need to be re-indexed after switching, because the embedding dimensions differ (1024 vs 1536):

  ```bash
  mem config set embedding.provider onnx
  mem index .mem/memory/ --force
  ```

- Existing `embedding.provider` config still wins over defaults.

To pre-download the ONNX model instead of waiting for the first-use download:

```bash
uvx --from 'mem[onnx]' mem search --provider onnx "warmup" 2>/dev/null || true
```

## Conclusion

`gpahal/bge-m3-onnx-int8` remains the strongest local default candidate in this benchmark because it simultaneously hits **top-tier bilingual quality, zero-config install, CPU-only execution, a <600 MB on-disk footprint, and no `torch` dependency**. Every other model in the evaluation failed on at least one of those axes.

The original upstream raw data, annotation scripts, and reproduction steps were
kept outside the retained `mem` search-engine package. This document preserves
the evaluation result needed for model-selection decisions.
