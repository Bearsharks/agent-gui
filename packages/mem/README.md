# mem

`mem`은 이 저장소 안에서 별도 의존성처럼 관리하는 markdown 검색 엔진
패키지입니다. 목표는 inAX가 안정적인 문서 검색 레이어에 의존할 수 있도록
검색 품질에 필요한 핵심만 보수적으로 유지하는 것입니다.

## 범위

유지하는 검색 엔진 기능:

- markdown 파일 스캔과 heading 기반 chunking
- content hash 기반 중복 방지와 stale chunk 정리
- embedding provider 추상화
- Milvus dense vector + BM25 sparse hybrid indexing
- RRF 기반 검색 결과 병합
- 선택적 reranker 설정
- CLI 명령: `index`, `search`, `expand`, `stats`, `reset`, `config get`,
  `config set`, `config list`

제거하거나 외부로 분리한 기능:

- 파일 watch
- LLM compact/summarization
- platform plugin packaging
- prompt 배포
- interactive config wizard
- marketplace/release asset

## Metadata 흐름

`mem`은 inAX 문서 체계를 직접 알지 않습니다. 대신 프로젝트가 설정으로
metadata extractor를 주입하면, `mem`은 그 extractor contract만 사용합니다.

```toml
[metadata.extractor]
path = "scripts/docs_metadata.py"
function = "metadata_for_path"
```

인덱싱 흐름은 다음과 같습니다.

```text
markdown 문서
  -> mem chunking
  -> 각 chunk의 source path를 extractor 함수에 전달
  -> extractor가 dict 반환
  -> mem이 설정된 metadata field에 맞게 정규화
  -> metadata_json / meta_<field>를 chunk record에 저장
  -> embedding + metadata를 Milvus에 upsert
```

inAX의 경우 `scripts/docs_metadata.py`가 경로 기반 규칙을 담습니다. 예를 들어
`docs_generated/domains/skills-system/prd.md`는 `authority_layer=generated`,
`doc_domain=skills-system`, `doc_kind=prd`로 추출됩니다. `mem`은 이 의미를
해석하지 않고 반환된 값을 저장하고 필터링할 뿐입니다.

검색 시 `filterable = true`인 metadata field는 Milvus scalar field
`meta_<field>`로 검색 조건에 사용됩니다. metadata는 인덱싱 시점에 materialize
되므로 extractor 규칙이나 field 정의를 바꾸면 reset/reindex가 필요합니다.

## 개발

`mem/` 디렉터리에서 전체 테스트를 실행합니다.

```bash
uv run python -m pytest -q
```

저장소 루트에서는 다음 명령을 사용합니다.

```bash
uv run --project mem python -m pytest -q mem/tests
```

오래된 entrypoint 문제를 피하기 위해 bare `pytest` 대신 `python -m pytest`를
사용합니다.

## Embedding And Milvus Backend

`mem`은 embedding provider와 Milvus backend를 설정으로 전환합니다. 현재
repository-local project config는 `.mem/mem.toml`이며, CLI가 실제로 읽는 section은
`[embedding]`과 `[milvus]`입니다.

Embedding provider 예:

```bash
uv run --project mem --extra ollama mem config set embedding.provider ollama --project
uv run --project mem --extra ollama mem config set embedding.model bge-m3 --project
```

Milvus backend는 `milvus.uri` 값으로 전환합니다.

Milvus Lite:

```bash
uv run --project mem mem config set milvus.uri .mem/index/milvus.db --project
```

Docker 또는 remote Milvus Server:

```bash
uv run --project mem mem config set milvus.uri http://localhost:19530 --project
```

Collection은 provider/model별로 분리하는 편이 안전합니다. Embedding model을
바꾸면 기존 collection을 재사용하지 말고 새 collection을 쓰거나 reset 후
reindex합니다.

```bash
uv run --project mem --extra ollama mem config set milvus.collection inax_docs_ollama_bge_m3 --project
uv run --project mem --extra ollama mem reset --yes
uv run --project mem --extra ollama mem index docs_canonical docs_generated --force
```

Ollama를 사용할 때 macOS app bundle에만 CLI가 있는 경우 다음 경로를 직접 사용할
수 있습니다.

```bash
/Applications/Ollama.app/Contents/Resources/ollama pull bge-m3
```

## Phase 10 Regression

Phase 10 회귀 테스트는 docs-generated baseline index가 이미 존재한다고
가정합니다. 테스트 중에는 재인덱싱하지 않습니다.

```bash
RUN_MEM_PHASE10_DOCGEN_REGRESSION=1 \
uv run --project mem --extra local python -m pytest -q \
  mem/tests/test_phase10_pruning_contract.py
```

## 문서

패키지 문서는 [docs](docs/)에 있습니다. inAX migration plan과 final state
spec은 패키지 바깥의 `../docs/mem/` 아래에 있습니다.

주요 문서:

- [Architecture](docs/architecture.md)
- [CLI Reference](docs/cli.md)
- [Python API](docs/python-api.md)
- [Getting Started](docs/getting-started.md)
- [Embedding Model Evaluation](docs/home/embedding-evaluation.md)

## 라이선스

이 패키지는 [zilliztech/memsearch](https://github.com/zilliztech/memsearch)를
이 저장소의 local agent memory workflow에 맞게 수정한 것입니다.

Upstream MIT license와 copyright notice는 [LICENSE](LICENSE)에 보존합니다.
