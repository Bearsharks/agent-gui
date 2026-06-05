# Hermes Self-Improvement and Curation Summary

작성일: 2026-06-05

이 문서는 Hermes Agent의 self-improvement review, skill management,
curation 조사 결과와 `packages/codex-self-improvement`에 반영한 설계 결정을
정리한다. 원 조사 자료는
`/Users/jsp1226/MIDAS/agent-gui/hermes-agent/codex_reconstruction_hermes_skill_review_report.md`
이며, 이후 추가로 확인한 `background_review.py`, `curator.py`, curator test
invariant, Codex 패키지 구현 결과를 함께 반영했다.

## Executive Summary

Hermes의 자가개선 시스템은 "스킬을 많이 만들어 프롬프트에 넣는 시스템"이
아니다. 핵심은 다음 네 가지다.

1. 시스템 프롬프트에는 compact skill index만 넣고, 본문은 필요할 때
   `skill_view`로 점진 로딩한다.
2. 턴 종료 후 별도 background review fork가 전체 conversation snapshot을
   검토하되, memory/skill tool만 쓰도록 격리한다.
3. skill update는 class-level umbrella를 목표로 하고, 새 skill 생성은 마지막
   수단이다.
4. curator는 post-turn review가 아니라 idle/interval 기반 library maintenance다.
   stale/archive transition, prefix cluster review, package integrity,
   consolidation/pruning reconciliation을 분리한다.

Codex 재구성에서는 Hermes의 자동 background fork를 그대로 복제하지 않는다.
주요 사용 시나리오는 사용자가 Codex 작업 완료 후 `codex-self-improvement`
스킬을 수동 실행하는 것이다. 따라서 Codex 구현은 다음 방식으로 안정성을
가져간다.

- 전체 세션 또는 transcript를 기반으로 deterministic review report를 먼저 만든다.
- report는 mutation을 하지 않으며 항상 explicit approval이 필요하다.
- MCP `skill_manage`는 create/edit/patch/write_file 전용이다.
- archive, pruning, consolidation은 curation runtime과 별도 승인 흐름으로 분리한다.
- curation은 dry-run report를 먼저 만들고, live apply는 deterministic
  stale/archive transition에 한정한다.

## Hermes Self-Improvement Review

### Signal Rubric

Hermes background review prompt는 skill update 신호를 명확히 정의한다.

- 사용자가 style, tone, format, verbosity, legibility를 correction한 경우
- workflow, approach, step sequence를 correction한 경우
- 재사용 가능한 technique, fix, workaround, debugging path, tool pattern이 나온 경우
- 이번 세션에서 loaded/consulted skill이 틀렸거나 누락되었거나 outdated인 경우

중요한 점은 사용자 correction이 단순 memory signal이 아니라 skill signal이라는
점이다. 예를 들어 사용자가 "다음부터 이렇게 하라", "그 방식은 싫다",
"먼저 확인하라"처럼 작업 방식 자체를 교정하면, 관련 task skill의 본문에
반영해야 한다.

Hermes가 저장하지 않는 것도 명확하다.

- 환경 의존 실패: missing binary, command not found, fresh install, credential 없음
- tool에 대한 부정적 단정: "X tool does not work"
- retry 후 해결된 transient error 자체
- 오늘 한 번의 작업 narrative
- secret, credential, raw private data

실패에서 배울 점이 있다면 "실패 사실"이 아니라 "fix, config step, retry pattern"을
저장한다.

### Target Priority

Hermes review는 target 선택 순서를 강하게 고정한다.

1. 현재 세션에서 loaded/consulted skill을 patch한다.
2. loaded skill이 맞지 않으면 기존 class-level umbrella skill을 patch한다.
3. 세션별 detail, reproduction recipe, template, deterministic probe는
   umbrella 아래 support file로 둔다.
4. 기존 skill이 전혀 맞지 않을 때만 새 class-level umbrella skill을 만든다.

이 우선순위의 목적은 one-session-one-skill 목록이 쌓이는 것을 막는 것이다.

### Fork Isolation

Hermes background review는 메인 agent가 이어서 "한 번 더 생각"하는 구조가 아니다.
별도 forked `AIAgent`가 parent conversation snapshot 위에서 실행된다.

안정성 장치:

- parent runtime, model, provider, credentials를 상속한다.
- parent가 `codex_app_server` 경로이면 review fork는 Hermes tool dispatch가 가능한
  `codex_responses`로 전환한다.
- `skip_memory=True`로 external memory provider 오염을 막는다.
- built-in memory store만 parent store에 재바인딩한다.
- review fork의 memory/skill nudge interval을 0으로 두어 review가 다시 review를
  낳지 않게 한다.
- memory/skills tool whitelist만 허용한다.
- dangerous terminal approval은 auto-deny한다.
- stdout/stderr/status output을 숨기고, 성공한 memory/skill action summary만
  사용자에게 보여준다.
- 기존 conversation snapshot에 이미 있던 tool result는 새 action summary에서 제외한다.

Codex 패키지는 현재 자동 background fork를 구현하지 않는다. 대신 수동 review
시나리오에서 transcript 기반 deterministic report를 만들고, 그 결과를 proposal
입력으로 사용한다.

## Hermes Skill Store and Telemetry

Hermes runtime source of truth는 repo `skills/`가 아니라 profile별
`~/.hermes/skills`다. bundled skills, hub-installed skills, external dirs,
plugin skills, agent-created local skills의 provenance가 분리된다.

Telemetry는 `SKILL.md` frontmatter가 아니라 `.usage.json` sidecar에 저장된다.
주요 필드는 다음과 같다.

- `created_by`
- `use_count`
- `view_count`
- `last_used_at`
- `last_viewed_at`
- `patch_count`
- `last_patched_at`
- `created_at`
- `state`
- `pinned`
- `archived_at`

Hermes에서 `skill_view`는 단순 조회가 아니라 실제 작업용 loading으로 취급된다.
성공 시 `view_count`와 `use_count`가 모두 증가한다. slash/preload는 `use_count`
중심이고, patch/edit/write_file/remove_file은 `patch_count`를 올린다.

Curator 대상은 모든 local skill이 아니다. background self-improvement review가
`created_by=agent` 또는 `agent_created=true`로 명시 마킹한 skill만 자동 lifecycle
대상이다. 사용자가 직접 만든 skill, bundled skill, hub-installed skill은 자동
archive/consolidation 대상에서 제외한다.

Pinning의 의미도 좁다. pin은 deletion/archive/consolidation guard이고, content
patch/edit 자체를 막는 장치가 아니다.

## Hermes Curation

### Curator Scope

Curator는 post-turn review가 아니다. idle/interval 기반 skill library maintenance다.
따라서 self-improvement review와 curation은 분리해야 한다.

Curator는 크게 두 층으로 동작한다.

- Deterministic lifecycle transition: active/stale/archived, pinned skip,
  usage sidecar update, backup/report
- LLM-guided library review: umbrella consolidation, support file demotion,
  pruning decision, structured summary

### Prefix Cluster Pass

Hermes curator prompt는 prefix/domain cluster pass를 필수로 둔다. 질문은
"두 skill이 서로 중복인가?"가 아니라 "이 cluster를 사람이 하나의 umbrella class로
쓸 것인가?"이다.

Hermes prompt의 예시 cluster:

- `hermes-config-*`
- `hermes-dashboard-*`
- `gateway-*`
- `codex-*`
- `ollama-*`
- `anthropic-*`
- `gemini-*`
- `mcp-*`
- `salvage-*`
- `pr-*`
- `competitor-*`
- `python-*`
- `security-*`

Codex self-improvement용으로는 다음 prefix/domain을 expected cluster로 둔다.

- `skill-update-*`
- `skill-curation-*`
- `skill-runtime-*`
- `memory-*`
- `hook-*`
- `mcp-*`
- `workflow-*`
- `repo-*`
- `project-*`
- `browser-*`
- `docs-*`
- `test-*`
- `setup-*`
- `codex-*`

서로 trigger가 다르다는 이유만으로 sibling skill을 유지하지 않는다. 분리의 근거가
되려면 operational boundary, mutation target, approval/safety model, package
dependency가 실제로 달라야 한다.

### Consolidation Methods

Hermes curator는 cluster별로 세 가지 consolidation method를 사용한다.

1. 기존 umbrella skill로 merge한다.
2. 기존 member 중 broad enough한 skill이 없으면 새 class-level umbrella를 만든다.
3. narrow but valuable content는 umbrella의 `references/`, `templates/`,
   `scripts/`로 demote한다.

Package integrity는 필수 조건이다. source skill이 support file을 갖거나
`references/...`, `templates/...`, `scripts/...`, `assets/...` relative link를
갖는 경우 `SKILL.md`만 flatten해서 다른 skill의 reference로 넣으면 안 된다.

허용되는 선택지는 다음 중 하나다.

- standalone skill로 유지한다.
- 필요한 support file을 모두 umbrella의 canonical directory로 re-home하고 path를
  rewrite한다.
- original package 전체를 archive한다.

### Reconciliation

Hermes는 model summary를 그대로 믿지 않는다. archive/delete 후 결과 분류는
deterministic reconciliation을 거친다.

우선순위:

1. delete 시점의 `absorbed_into` declaration
2. model structured YAML summary
3. tool-call audit heuristic
4. no-evidence fallback

`absorbed_into` target이 존재하지 않으면 consolidated로 분류하지 않는다. 제거된
skill은 반드시 consolidated 또는 pruned 중 정확히 하나에 들어가야 한다.

이 invariants는 Hermes tests에서 prompt text와 reconciliation behavior로 고정되어
있다. 특히 bundled/hub untouched, delete 대신 archive, pinned skip, umbrella-first,
support-file demotion, package integrity, available tool vocabulary가 테스트된다.

## Codex Package Reflection

현재 `packages/codex-self-improvement`에 반영된 내용은 다음과 같다.

### Self-Improvement Runtime

`src/codex_self_improvement_review.py`는 manual Codex scenario용 deterministic
review rubric이다.

산출물:

- `signals`
- `loaded_skills`
- `candidate_targets`
- `rubric`
- `do_not_store`
- `reviews/self-improvement/<run-id>/run.json`
- `reviews/self-improvement/<run-id>/REPORT.md`

Rubric field:

- `has_durable_signal`
- `has_loaded_skill_candidate`
- `has_existing_umbrella_candidate`
- `contains_transient_failure_only`
- `contains_secret_or_private_data_risk`
- `contains_one_off_only`
- `recommended_operation`
- `requires_approval`

CLI:

```bash
python3 ~/.codex/self-improvement/codex_self_improvement.py review --transcript <path>
```

stdin도 지원한다. Report는 proposal aid일 뿐 mutation을 수행하지 않는다.

### MCP Runtime

`src/codex_self_improvement.py`는 MCP tool surface와 hook entrypoint를 담당한다.
자가개선 mutation은 MCP `skill_manage`로만 한다.

허용 action:

- `create`
- `edit`
- `patch`
- `write_file`

제한:

- archive/delete/merge/consolidation은 MCP에서 하지 않는다.
- skill name format을 검증한다.
- `SKILL.md` frontmatter `name`, `description`, non-empty body를 검증한다.
- frontmatter name과 target skill name mismatch를 거부한다.
- support file은 `references/`, `templates/`, `scripts/`, `assets/` 아래만 허용한다.
- `created_by=user` provenance를 보존하고, agent-created list에서 제외한다.

### Curation Runtime

`src/codex_self_improvement_curation.py`는 deterministic curation runner다.

현재 역할:

- `.usage.json` sidecar loading/saving
- `created_by=agent` filtering
- pinned skip
- active/stale/archived transition
- live apply 전 `backup-skills` snapshot
- `.archive/`로 complete directory move
- `run.json`/`REPORT.md` 작성
- `curation-state.json` update

CLI:

```bash
python3 ~/.codex/self-improvement/codex_self_improvement.py curate
python3 ~/.codex/self-improvement/codex_self_improvement.py curate --apply
```

기본은 dry-run이다. `--apply`는 explicit approval 후 live transition 용도다.

### Prefix/Package Cluster Runtime

`src/codex_self_improvement_curation_clusters.py`는 curation report에 들어가는
deterministic cluster analysis다.

산출물:

- `cluster_review.clusters`
- `cluster_review.orphan_naming_candidates`
- `cluster_review.narrow_name_candidates`
- `cluster_review.package_integrity`

Cluster row:

- `cluster_prefix`
- `members`
- `umbrella_candidate`
- `decision_candidate`
- `why_not_merge_required`
- `package_integrity_warnings`

이 분석은 live merge를 자동 수행하지 않는다. Hermes의 umbrella-first 관점을
Codex 수동 curation proposal에 주입하기 위한 deterministic discovery pass다.

### Skill Docs

`skills/codex-self-improvement/SKILL.md`는 Hermes background review를 Codex
수동 실행 모델로 옮긴다.

- full active conversation 또는 transcript를 review input으로 사용한다.
- transcript가 있으면 deterministic `review` command를 먼저 실행한다.
- loaded/consulted skill patch를 최우선으로 둔다.
- proposal before mutation과 explicit approval을 강제한다.
- curation이 필요한 작업은 `codex-skill-curation`으로 분리한다.

`skills/codex-skill-curation/SKILL.md`는 Hermes curator 접근을 따른다.

- curation dry-run report를 먼저 본다.
- `cluster_review`를 prefix/domain cluster source of truth로 삼는다.
- package integrity warning을 merge/demote 전 deterministic warning으로 사용한다.
- archive/delete는 complete directory move와 report를 기준으로 한다.

## Current Gaps and Future Work

현재 구현은 Hermes의 핵심 접근을 Codex 수동 시나리오에 맞게 반영했지만, Hermes와
동일하지 않은 부분이 있다.

### Not Implemented by Design

- post-turn automatic background fork
- external memory provider sync
- idle daemon/interval scheduler
- hub-installed skill pipeline
- bundled manifest sync
- live LLM curator merge execution
- cron reference rewrite

이 항목들은 현재 사용 시나리오인 "사용자가 작업 완료 후 수동으로 self-improvement
skill을 실행"하는 범위 밖이다.

### Worth Adding Later

1. `absorbed_into` lookup redirect
   - archived skill 조회 시 successor skill hint를 더 강하게 제공한다.

2. curation reconciliation helper
   - future live merge가 추가되면 `absorbed_into`, structured summary,
     filesystem/content audit을 deterministic하게 reconcile해야 한다.

3. purpose hash guard 강화
   - system/hook index와 `skill_view` 사이에서 version/purpose mismatch를 더
     명확히 경고한다.

4. package merge planner
   - support file이 있는 skill을 umbrella로 옮길 때 re-home/rewrite plan을
     dry-run으로 산출한다.

5. richer cluster scoring
   - 현재는 prefix/domain 중심이다. description/body token overlap, mutation target,
     tool boundary까지 score에 넣으면 Hermes curator prompt의 의도를 더 잘 반영할 수 있다.

6. prompt invariant tests
   - Hermes처럼 skill prompt가 bundled/hub, pinned, umbrella-first, support-file
     demotion, package integrity, usage-counter caveat를 계속 포함하는지 테스트로
     고정할 수 있다.

## Operating Rules for Future Changes

- self-improvement와 curation을 한 흐름으로 합치지 않는다.
- review report는 mutation하지 않는다.
- skill mutation은 approval 후 MCP `skill_manage`로만 한다.
- curation live apply는 archive/stale transition처럼 deterministic한 작업부터 한다.
- prefix cluster pass 없이 keep/merge 결정을 내리지 않는다.
- support file이 있는 skill은 `SKILL.md`만 복사해서 demote하지 않는다.
- `created_by=user`, bundled, hub-installed, pinned skill은 자동 lifecycle 대상이 아니다.
- transient environment failure와 negative tool claim은 durable skill rule로 저장하지 않는다.
- 새 skill 생성보다 loaded skill patch와 existing umbrella patch를 우선한다.

## Source Map

Primary Hermes investigation:

- `/Users/jsp1226/MIDAS/agent-gui/hermes-agent/codex_reconstruction_hermes_skill_review_report.md`

Hermes source evidence:

- `/Users/jsp1226/MIDAS/agent-gui/hermes-agent/agent/background_review.py`
- `/Users/jsp1226/MIDAS/agent-gui/hermes-agent/agent/curator.py`
- `/Users/jsp1226/MIDAS/agent-gui/hermes-agent/tests/agent/test_curator.py`

Codex package implementation:

- `packages/codex-self-improvement/src/codex_self_improvement.py`
- `packages/codex-self-improvement/src/codex_self_improvement_review.py`
- `packages/codex-self-improvement/src/codex_self_improvement_curation.py`
- `packages/codex-self-improvement/src/codex_self_improvement_curation_clusters.py`
- `packages/codex-self-improvement/skills/codex-self-improvement/SKILL.md`
- `packages/codex-self-improvement/skills/codex-skill-curation/SKILL.md`
- `packages/codex-self-improvement/tests/test_runtime.py`
