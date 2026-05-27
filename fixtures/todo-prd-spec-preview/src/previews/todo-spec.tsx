import { PreviewPanel, PreviewShell } from "../host/PreviewShell";
import { specRows } from "./todo-data";
import "./todo-preview.css";

export default function TodoSpecPreview() {
  return (
    <PreviewShell title="Todo Functional Spec" description="기능 Spec 노드에서 검토할 요구사항과 acceptance criteria입니다.">
      <PreviewPanel title="Functional Spec">
        <div className="todo-spec-table" role="table" aria-label="Todo 기능 명세">
          {specRows.map((row) => (
            <div className="todo-spec-row" role="row" key={row.area}>
              <strong>{row.area}</strong>
              <span>{row.requirement}</span>
              <em>{row.acceptance}</em>
            </div>
          ))}
        </div>
      </PreviewPanel>
    </PreviewShell>
  );
}
