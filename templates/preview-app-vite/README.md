# Agent GUI Preview Template Guide

이 폴더는 npm 배포 없이 프로젝트 안에 preview app을 임시로 복사해 쓰기 위한 template copy 대상입니다.

## Ownership

- 이 폴더를 복사한 프로젝트가 preview app 코드, 디자인시스템 연결, mock data, 상태 fixture를 소유합니다.
- Agent GUI는 이 preview app을 생성하거나 해석하지 않습니다.
- Agent GUI에는 이 preview app이 제공하는 local HTTP URL을 `GraphPlanNode.iframes[].url`로 등록합니다.
- URL을 만든 source entry 파일을 에이전트가 나중에 읽어야 한다면 `GraphPlanNode.iframes[].entryPath`에 workspace 기준 경로를 함께 등록합니다.

## Basic Flow

1. 이 폴더를 사용하는 프로젝트 안으로 복사합니다.
2. 프로젝트의 디자인시스템과 실제 컴포넌트를 preview app에서 import합니다.
3. 필요한 화면 상태를 route, query string, fixture data 중 프로젝트에 맞는 방식으로 구성합니다.
4. 프로젝트 dev server를 실행해 explicit port가 있는 local HTTP URL을 만듭니다.
5. Graph plan node에 iframe entry를 추가합니다.

```json
{
  "id": "iframe-project-preview",
  "description": "프로젝트 preview",
  "url": "http://localhost:5173/agent-gui-preview/search-panel",
  "entryPath": "src/agent-gui-preview/search-panel.tsx"
}
```

`entryPath`에는 파일 위치만 둡니다. 화면 상태의 의미, 검토 기준, scenario 설명은 `description`이나 preview 화면 안의 컨텐츠로 표현합니다.

## PreviewShell Shape

초기 template은 최소한의 패널 구조만 전제합니다.

- `PreviewShell`: page padding, title/header, responsive grid container
- `PreviewPanel`: title과 children
- 실제 제품 컴포넌트와 디자인시스템은 panel children 안에서 직접 사용

상태 매트릭스, 전후 비교, 체크리스트, 경로/목록 자동화 보조 기능은 기본 계약에 포함하지 않습니다. 반복해서 유용하다고 확인된 패턴만 나중에 template이나 package로 회수합니다.

## Do Not Use

- Agent GUI repo의 `docs/prototypes`를 실사용 preview 작성 위치로 사용하지 마세요.
- `file://` URL을 iframe URL로 등록하지 마세요.
- 원격 `https://` URL을 기본 contract로 가정하지 마세요.

현재 iframe URL contract는 `http://localhost:<port>/...` 또는 `http://127.0.0.1:<port>/...`입니다.
