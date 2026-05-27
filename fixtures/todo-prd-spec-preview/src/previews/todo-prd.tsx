import { PreviewPanel, PreviewShell } from "../host/PreviewShell";
import { prdGoals } from "./todo-data";
import "./todo-preview.css";

export default function TodoPrdPreview() {
  return (
    <PreviewShell title="Todo PRD Summary" description="PRD 노드에서 검토할 제품 목표와 성공 기준입니다.">
      <PreviewPanel title="PRD Summary">
        <section className="todo-copy">
          <p>
            개인 사용자가 오늘 처리할 일을 짧은 목록으로 관리하는 단일 화면 앱입니다. 첫 버전은 계정,
            동기화, 협업 없이 로컬 상태 기반의 빠른 입력과 완료 처리에 집중합니다.
          </p>
          <ul>
            {prdGoals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
        </section>
      </PreviewPanel>
      <PreviewPanel title="Success Criteria">
        <div className="todo-metric-grid">
          <Metric label="Add flow" value="< 3 sec" />
          <Metric label="Primary surface" value="1 screen" />
          <Metric label="Required account" value="No" />
        </div>
      </PreviewPanel>
    </PreviewShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="todo-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
