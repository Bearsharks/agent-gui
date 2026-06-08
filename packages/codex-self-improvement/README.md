# Codex Self-Improvement

Codex 전역에서 동작하는 수동 승인형 스킬 자가개선 런타임입니다.

목표는 Hermes의 백그라운드 리뷰와 큐레이션 아이디어를 Codex 단독 구조로 옮기되, 자동 post-turn 수정은 제거하는 것입니다. 스킬 변경은 사용자가 명시적으로 요청하고 승인한 경우에만 수행합니다.

주요 사용 시나리오는 Codex 세션에서 작업을 끝낸 뒤 사용자가
`codex-self-improvement` 스킬을 수동 실행하는 것입니다. 이 수동 리뷰는
Hermes background review처럼 전체 세션 대화, 사용자 correction, 로드/조회한
스킬, 실패 후 성공한 절차를 검토합니다. 차이는 Codex에서는 자동 fork가 아니라
사용자 승인 후 MCP `skill_manage`로만 변경한다는 점입니다.

## 구성 요소

설치 시 다음 항목을 등록합니다.

- MCP 서버: `codex-self-improvement`
- MCP 도구:
  - `skill_list`
  - `skill_view`
  - `skill_manage`
- Codex 훅:
  - `SessionStart`: 세션 시작 시 현재 사용 가능한 스킬 인덱스만 짧게 주입
  - `UserPromptSubmit`: 세션별 이전 스킬 인덱스와 현재 인덱스를 비교해 변경점만 주입
  - `Stop`: 마지막 턴을 짧은 turn-history 메모로 저장
- Review runtime:
  - `codex_self_improvement.py review`: completed-session deterministic review report
- Curation runtime:
  - `codex_self_improvement.py curate`: 기본 dry-run curation report
  - `codex_self_improvement.py curate --apply`: live stale/archive transition
- Codex 스킬:
  - `codex-self-improvement`: 세션 리뷰 기반 스킬 생성/수정
  - `codex-skill-curation`: 스킬 병합, 통합, stale/archive 정리

`Stop` hook 기반 자동 리뷰는 설치하지 않습니다. 전체 대화 이력이 보장되지 않는 상태에서 자동으로 스킬을 수정하지 않기 위한 선택입니다.

## 설치

레포 루트에서 실행합니다.

```bash
pnpm --filter @agent-gui/codex-self-improvement install:codex
```

설치 시 다음 파일과 디렉터리가 갱신됩니다.

- `~/.codex/config.toml`
- `~/.codex/hooks.json`
- `~/.codex/self-improvement/codex_self_improvement_curation.py`
- `~/.codex/self-improvement/codex_self_improvement_curation_clusters.py`
- `~/.codex/self-improvement/codex_self_improvement.py`
- `~/.codex/self-improvement/codex_self_improvement_review.py`
- `~/.codex/self-improvement/hooks/self-improvement/`
- `~/.codex/self-improvement/hooks/turn-history/`
- `~/.codex/skills/codex-self-improvement/SKILL.md`
- `~/.codex/skills/codex-skill-curation/SKILL.md`

설치 스크립트는 `config.toml`의 관리 블록만 교체하고, `hooks.json`에서는
`codex_self_improvement.py`, `hooks/self-improvement/self_improvement_hook.py`,
`hooks/turn-history/stop.sh`를 가리키는 기존 self-improvement 훅만 교체합니다.
이전 실험용 `codex-manual-skill-update` 스킬은 제거합니다.

## 설치 확인

MCP 서버가 등록됐는지 확인합니다.

```bash
codex mcp list | rg codex-self-improvement
```

패키지 검증은 다음 명령으로 실행합니다.

```bash
pnpm --filter @agent-gui/codex-self-improvement test
```

실제 Codex 세션에서 훅 주입을 확인하려면 테스트 세션을 실행합니다.

```bash
codex --dangerously-bypass-hook-trust --enable hooks --no-alt-screen
```

세션 시작 시 `SessionStart hook (completed)` 메시지와 `<codex_self_improvement>` 컨텍스트가 보이면 정상입니다.

## 역할 분리

### MCP 런타임

MCP 런타임은 세 도구만 제공합니다.

- `skill_list`: 스킬 목록과 telemetry 조회
- `skill_view`: 스킬 본문 또는 연결 파일 조회, view/use telemetry 갱신
- `skill_manage`: 스킬 생성, 전체 수정, 부분 패치, support file 작성

`skill_manage`는 생성/수정 전용입니다. archive, restore, pin, unpin, delete, merge, curation은 MCP에서 하지 않습니다. Support file은 `references/`, `templates/`, `scripts/`, `assets/` 아래에만 쓸 수 있습니다.

Telemetry는 `~/.codex/self-improvement/skills/.usage.json`에 저장됩니다. MCP는 `skill_list`, `skill_view`, `skill_manage` 동작 중 사용량과 변경 정보를 계속 기록합니다.

### 훅

`SessionStart` 훅은 `hooks/self-improvement/self_improvement_hook.py`를 통해
실행됩니다. 세션 ID별 snapshot을 만들고 현재 스킬 인덱스만 주입합니다. 스킬 본문은
주입하지 않습니다.

`UserPromptSubmit` 훅은 같은 세션의 이전 snapshot과 현재 스킬 인덱스를 비교합니다. 변경이 없으면 아무것도 주입하지 않고, 변경이 있으면 다음 항목만 짧게 주입합니다.

- 새 스킬
- 제거되거나 archive로 이동된 스킬
- version 변경
- `purpose_hash` 변경
- description 변경
- state/pinned/content hash 변경

스킬이 변경된 같은 세션에서 사용자가 다음 질문을 하면, 이 훅이 변경점을 알려주고 Codex가 `skill_view`로 다시 확인하게 합니다.

`Stop` 훅은 마지막 턴을 self-improvement 근거 메모로 저장합니다. 이 훅은 스킬을
자동 수정하지 않고, 나중에 수동 review가 긴 세션의 중간 correction을 놓치지 않도록
세션별 JSONL을 append합니다.

기본 저장 위치:

```text
~/.codex/self-improvement/turn-history/sessions/<session_id>/turns.jsonl
```

각 record는 다음 고정 필드를 갖습니다.

```json
{
  "schema_version": 1,
  "ts": "...",
  "session_id": "...",
  "turn_id": "...",
  "cwd": "...",
  "user_request": "...",
  "agent_action": "...",
  "went_well": "...",
  "went_wrong": "...",
  "lesson_candidate": "...",
  "evidence": "..."
}
```

성공한 tool output 원문은 저장하지 않고 길이만 남깁니다. 실패/error 신호가 있는
tool output만 짧은 excerpt로 포함하며, token/secret 계열은 redaction합니다.

### `codex-self-improvement` 스킬

사용자가 “이번 세션을 스킬에 반영”처럼 명시적으로 요청했을 때 사용합니다.

이 스킬은 반드시 MCP를 사용합니다. 직접 파일을 수정하지 않습니다. 담당 범위는 다음뿐입니다.

- 새 class-level 스킬 생성
- 기존 스킬 패치
- 기존 스킬 전체 수정
- references/templates/scripts 같은 support file 작성

Transcript 파일이 있으면 먼저 deterministic review report를 만듭니다.

```bash
python3 ~/.codex/self-improvement/codex_self_improvement.py review --transcript <path>
```

파일이 없고 active conversation이 완전하면 같은 rubric을 수동으로 적용합니다. Report는 mutation을 하지 않으며, 항상 사용자 승인이 필요합니다.

Hermes background review와 같은 우선순위를 따릅니다.

1. 세션에서 로드하거나 조회한 스킬을 먼저 패치합니다.
2. 맞는 loaded skill이 없으면 기존 broad/umbrella 스킬을 패치합니다.
3. 상세한 세션 증거, 템플릿, 스크립트는 support file로 demotion합니다.
4. 기존 스킬이 없을 때만 새 class-level umbrella 스킬을 만듭니다.

병합, 통합, stale/archive 정리가 필요하면 직접 수행하지 않고 `codex-skill-curation` 사용을 제안합니다.

### `codex-skill-curation` 스킬

사용자가 명시적으로 스킬 정리, 병합, 통합, archive를 요청했을 때 사용합니다.

큐레이션은 MCP를 쓰지 않습니다. 먼저 runtime dry-run report로 대상과 결과를 확인하고, 사용자가 승인한 경우에만 live apply를 수행합니다.

```bash
python3 ~/.codex/self-improvement/codex_self_improvement.py curate
python3 ~/.codex/self-improvement/codex_self_improvement.py curate --apply
```

live apply는 실행 전 `reviews/curation/<run-id>/backup-skills` snapshot을 만들고, `.usage.json` telemetry sidecar와 `changes.jsonl` 변경 이력을 함께 갱신합니다.

큐레이션 범위는 다음을 포함합니다.

- agent-created 스킬의 stale/archive 판단
- prefix/domain cluster 분석을 `cluster_review`로 report
- Codex self-improvement용 prefix/domain cluster 예시 기반 umbrella 후보 검토
- source package의 support file/relative link integrity warning
- 기존 umbrella 스킬로 병합
- 새 umbrella 스킬 생성
- narrow skill 내용을 references/templates/scripts로 demotion
- source skill directory를 `.archive`로 이동
- `absorbed_into` 기반 결과 분류
- `run.json`과 `REPORT.md` 작성
- live apply 전 skill store snapshot
- pinned skill 자동 transition skip
- `created_by=agent` skill만 curation 대상

현재 Codex 구조에는 Hermes cron job이 없으므로 cron reference rewrite 단계는 포함하지 않습니다.

## 저장소

설치 후 상태 파일은 다음 위치에 저장됩니다.

```text
~/.codex/self-improvement/
  skills/
  skills/.archive/
  skills/.usage.json
  changes.jsonl
  logs/
  reviews/curation/
  session-state/
  turn-history/
```

## 제거

기본 제거는 MCP 등록, 훅 등록, 설치된 스킬 사본만 제거합니다. `~/.codex/self-improvement`의 telemetry와 runtime 상태는 보존합니다.

```bash
pnpm --filter @agent-gui/codex-self-improvement uninstall:codex
```

실행 전 변경 내용을 확인하려면 다음을 사용합니다.

```bash
pnpm --filter @agent-gui/codex-self-improvement exec python3 scripts/uninstall.py --dry-run
```

runtime 상태까지 모두 삭제하려면 `--purge`를 사용합니다.

```bash
pnpm --filter @agent-gui/codex-self-improvement exec python3 scripts/uninstall.py --purge
```

`--purge`는 `~/.codex/self-improvement` 전체를 삭제하므로 `.usage.json`, `changes.jsonl`, `session-state/`, archive 등을 함께 제거합니다.
