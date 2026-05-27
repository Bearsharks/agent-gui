import { PreviewPanel, PreviewShell } from "../host/PreviewShell";
import { todoItems } from "./todo-data";
import "./todo-preview.css";

export default function TodoPrototypePreview() {
  const openCount = todoItems.filter((item) => !item.done).length;

  return (
    <PreviewShell title="Todo Prototype State" description="Prototype 노드에서 검토할 Todo 앱의 실제 화면 상태입니다.">
      <PreviewPanel title="Prototype State">
        <section className="todo-app-frame" aria-label="Todo 앱 화면 예시">
          <div className="todo-toolbar">
            <div>
              <strong>Today</strong>
              <span>{openCount} open tasks</span>
            </div>
            <button type="button">Add</button>
          </div>
          <label className="todo-input">
            New task
            <input readOnly value="팀 주간 보고서 작성" />
          </label>
          <div className="todo-list">
            {todoItems.map((item) => (
              <div className="todo-row" data-done={item.done ? "true" : "false"} key={item.id}>
                <input checked={item.done} readOnly type="checkbox" />
                <span>{item.title}</span>
                {item.dueLabel ? <small>{item.dueLabel}</small> : null}
              </div>
            ))}
          </div>
          <div className="todo-filters" aria-label="필터 예시">
            <button data-active="true" type="button">All</button>
            <button type="button">Open</button>
            <button type="button">Done</button>
          </div>
        </section>
      </PreviewPanel>
    </PreviewShell>
  );
}
