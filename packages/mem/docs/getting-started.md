# 시작하기

이 문서는 `mem` 패키지를 검색 엔진 의존성으로 사용하는 방법을 설명합니다.
upstream platform plugin 설치나 agent asset 배포는 다루지 않습니다.

## 개발 환경 확인

저장소 루트에서는 다음 명령으로 테스트를 실행합니다.

```bash
uv run --project mem python -m pytest -q mem/tests
```

`mem/` 디렉터리 안에서는 다음 명령을 사용합니다.

```bash
uv run python -m pytest -q
```

## 최소 인덱싱과 검색

markdown 문서를 Milvus index로 만들려면 `mem index`를 실행합니다.

```bash
uv run --project mem mem index docs_generated \
  --provider local \
  --collection p10_docgen \
  --milvus-uri .mem/index/p10_docgen.db
```

같은 collection과 Milvus URI를 대상으로 검색합니다.

```bash
uv run --project mem mem search "current document system" \
  --provider local \
  --collection p10_docgen \
  --milvus-uri .mem/index/p10_docgen.db \
  --top-k 10
```

인덱싱과 검색은 같은 provider, model, collection, Milvus URI를 사용해야
합니다. embedding 공간이 다르면 similarity score가 의미 없어집니다.

## Milvus Backends

| 모드 | URI 형태 | 용도 |
| --- | --- | --- |
| Milvus Lite | local `.db` path | 로컬 개발과 회귀 테스트 |
| Milvus Server | `http://host:19530` | 공유 개발 환경 또는 서비스 |
| Zilliz Cloud | HTTPS endpoint | 관리형 hosted Milvus |

## Embedding Providers

upstream의 provider 추상화는 유지합니다.

| Provider | 설명 |
| --- | --- |
| `openai` | upstream config의 기본 provider |
| `google` | Gemini embedding provider |
| `voyage` | Voyage embedding provider |
| `jina` | Jina embedding provider |
| `mistral` | Mistral embedding provider |
| `ollama` | local Ollama endpoint |
| `local` | sentence-transformers local model |
| `onnx` | extra 설치 시 ONNX bge-m3 경로 |

## 설정

프로젝트 로컬 설정은 `.mem/mem.toml`에 둘 수 있습니다. 기본 검색 엔진 설정은
`milvus`, `embedding`, `chunking`, `reranker` 섹션을 사용합니다.

```toml
[milvus]
uri = ".mem/index/project.db"
collection = "project_docs"

[embedding]
provider = "local"
model = ""

[chunking]
max_chunk_size = 1500
overlap_lines = 2

[reranker]
model = ""
```

## Metadata 설정

프로젝트가 검색 facet이나 문서 계층 필터를 사용하려면 metadata 설정을 추가할 수
있습니다. `mem`은 프로젝트의 의미를 직접 알지 않고, 설정에 적힌 extractor
함수를 호출해서 나온 dict만 사용합니다.

```toml
[metadata.extractor]
path = ".mem/metadata.py"
function = "metadata_for_path"

[metadata.fields.authority_layer]
type = "keyword"
filterable = true
default = "unknown"

[metadata.fields.visibility]
type = "keyword"
filterable = true
default = "searchable"
```

extractor 함수는 source path를 받아 metadata dict를 반환해야 합니다.

```python
def metadata_for_path(source: str) -> dict[str, str]:
    return {
        "authority_layer": "generated",
        "doc_domain": "skills-system",
        "doc_kind": "prd",
        "visibility": "searchable",
    }
```

인덱싱 시 `mem`은 각 chunk의 `source` path를 extractor에 전달합니다. 반환된
metadata는 설정된 field 목록에 맞게 정규화되고, chunk record에 저장됩니다.

저장 형태:

| 필드 | 설명 |
| --- | --- |
| `metadata_json` | 전체 metadata payload |
| `meta_<field>` | `filterable = true`인 field의 Milvus scalar field |

예를 들어 `doc_kind`가 filterable이면 `meta_doc_kind`가 생성됩니다. 검색에서
`mem search --filter doc_kind=prd`를 사용하면 Milvus expression
`meta_doc_kind == "prd"`로 변환되어 hybrid search 단계에 적용됩니다.

metadata는 검색 시점이 아니라 인덱싱 시점에 materialize됩니다. extractor 규칙,
field 목록, filterable 여부를 바꾸면 기존 index에는 자동 반영되지 않으므로
reset/reindex가 필요합니다.

## inAX 어댑터 예시

inAX는 `.mem/docs-search`에서 `mem`에 metadata config를 주입하고,
`.mem/metadata.py`에 경로 기반 규칙을 둡니다.

```text
.mem/docs-search
  -> MetadataConfig(extractor=".mem/metadata.py")
  -> Mem(..., metadata_config=...)
  -> mem이 indexing 시 extractor 호출
```

예를 들어 다음 문서는:

```text
docs_generated/domains/skills-system/prd.md
```

다음 metadata로 저장됩니다.

```json
{
  "authority_layer": "generated",
  "doc_domain": "skills-system",
  "doc_kind": "prd",
  "visibility": "searchable"
}
```

`mem`은 `skills-system`이나 `prd`의 의미를 모릅니다. 이 값은 inAX extractor가
정하고, `mem`은 저장과 필터링만 담당합니다.

## 재빌드

index는 markdown 원본에서 파생된 상태입니다. provider, model, schema, corpus
범위, metadata 설정이 바뀌면 collection을 drop하고 다시 인덱싱합니다.

```bash
uv run --project mem mem reset --collection project_docs --milvus-uri .mem/index/project.db --yes
uv run --project mem mem index docs_generated --collection project_docs --milvus-uri .mem/index/project.db
```
