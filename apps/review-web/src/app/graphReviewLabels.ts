export const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  needs_agent: "에이전트 필요",
  agent_replied: "에이전트 답변",
  revision_ready: "수정안 준비",
  approved: "승인됨",
  rejected: "반려됨",
  open: "열림",
  needs_revision: "수정 필요",
  accepted: "수락됨",
  blocked: "차단됨",
  complete: "완료",
  failed: "실패",
  passed: "통과",
  pending: "대기",
  checked: "확인",
  unchecked: "미확인",
  waived: "면제",
  selected: "선택됨",
  candidate: "후보",
  deferred: "보류",
  required: "필수",
  optional: "선택",
  manual: "수동",
  command: "명령",
  test: "테스트",
  metric: "지표",
  automated: "자동",
  high: "높음",
  medium: "중간",
  low: "낮음",
  owner: "소유",
  owned: "소유",
  reference: "참조",
  inline: "인라인",
  prototype_state_flow: "프로토타입 상태 흐름",
  panel: "패널",
};

export const TARGET_TYPE_LABELS: Record<string, string> = {
  plan: "계획",
  graph: "그래프",
  node: "노드",
  block: "블록",
  block_item: "블록 항목",
  edge: "연결",
  prototype_tab: "프로토타입 탭",
  artifact_range: "산출물 범위",
};

export const BLOCK_TYPE_LABELS: Record<string, string> = {
  text: "텍스트",
  graph_ref: "하위 그래프",
  task_list: "작업 목록",
  checklist: "체크리스트",
  criteria: "기준",
  review_bundle: "리뷰 묶음",
  prototype: "프로토타입",
  choice_set: "선택지",
  comparison: "비교",
  evidence: "근거",
  synthesis: "종합",
  risk: "위험",
  verification: "검증",
  checkpoint_outcome: "체크포인트 결과",
  artifact: "산출물",
  changelog: "변경 기록",
  investigation: "조사",
  migration: "마이그레이션",
};

export const NODE_KIND_LABELS: Record<string, string> = {
  section: "섹션",
  action: "작업",
  decision: "결정",
  checkpoint: "체크포인트",
  review: "리뷰",
  artifact: "산출물",
  note: "노트",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  "user.feedback": "사용자 피드백",
  "agent.reply": "에이전트 답변",
  "agent.revision": "에이전트 수정",
  "user.approval": "사용자 승인",
};

export function labelStatus(value: string | undefined): string {
  if (!value) return "";
  return STATUS_LABELS[value] ?? value;
}

export function labelBlockType(value: string): string {
  return BLOCK_TYPE_LABELS[value] ?? value;
}

export function labelNodeKind(value: string): string {
  return NODE_KIND_LABELS[value] ?? value;
}

export function labelTargetType(value: string): string {
  return TARGET_TYPE_LABELS[value] ?? value;
}

export function labelEventType(value: string): string {
  return EVENT_TYPE_LABELS[value] ?? value;
}
