export type TodoItem = {
  id: string;
  title: string;
  done: boolean;
  dueLabel?: string;
};

export type SpecRow = {
  area: string;
  requirement: string;
  acceptance: string;
};

export type DecisionOption = {
  question: string;
  recommended: string;
  rationale: string;
};

export const todoItems: TodoItem[] = [
  { id: "td-1", title: "회의 안건 정리", done: true, dueLabel: "오늘" },
  { id: "td-2", title: "견적서 초안 작성", done: false, dueLabel: "내일" },
  { id: "td-3", title: "릴리즈 체크리스트 확인", done: false },
];

export const problemStatements = [
  "메모장이나 채팅에 흩어진 오늘 할 일을 하나의 짧은 목록으로 모은다.",
  "사용자는 할 일을 추가한 직후 바로 다음 일을 입력할 수 있어야 한다.",
  "완료 여부를 확인하기 위해 별도 화면으로 이동하지 않는다.",
];

export const prdGoals = [
  "사용자가 하루 안에 처리할 일을 빠르게 추가하고 완료 상태를 확인한다.",
  "목록은 완료/미완료 상태가 한눈에 구분되어야 한다.",
  "빈 상태와 입력 오류는 별도 설명 없이도 다음 행동이 명확해야 한다.",
];

export const specRows: SpecRow[] = [
  {
    area: "할 일 추가",
    requirement: "텍스트 입력 후 추가 버튼 또는 Enter로 새 항목을 만든다.",
    acceptance: "공백 입력은 추가되지 않고 입력창 아래에 짧은 오류 메시지를 표시한다.",
  },
  {
    area: "완료 토글",
    requirement: "각 항목은 checkbox로 완료 상태를 전환할 수 있다.",
    acceptance: "완료 항목은 취소선과 낮은 대비로 표시되고 카운터가 즉시 갱신된다.",
  },
  {
    area: "필터",
    requirement: "전체, 미완료, 완료 필터를 제공한다.",
    acceptance: "필터 선택은 목록만 바꾸며 입력 중인 텍스트는 유지한다.",
  },
  {
    area: "삭제",
    requirement: "항목별 삭제 버튼을 제공한다.",
    acceptance: "삭제 후 빈 목록이면 빈 상태 문구와 새 할 일 입력을 유지한다.",
  },
];

export const decisionOptions: DecisionOption[] = [
  {
    question: "삭제 확인 dialog",
    recommended: "첫 버전에서는 생략",
    rationale: "항목 데이터가 로컬 임시 상태라 삭제 비용이 낮고, dialog가 반복 사용 흐름을 느리게 만든다.",
  },
  {
    question: "필터 상태 보존",
    recommended: "localStorage 보존은 보류",
    rationale: "첫 버전 목표는 빠른 입력/완료 확인이며, 보존 정책은 사용 패턴 확인 후 결정한다.",
  },
  {
    question: "완료 항목 정렬",
    recommended: "원래 순서 유지",
    rationale: "자동 이동은 사용자가 방금 완료한 항목을 놓치게 만들 수 있어 초기 검증에는 원래 순서가 낫다.",
  },
];
