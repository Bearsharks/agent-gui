import { PreviewPanel, PreviewShell } from "../host/PreviewShell";
import { decisionOptions } from "./todo-data";
import "./todo-preview.css";

export default function TodoDecisionPreview() {
  return (
    <PreviewShell title="Todo Review Decision" description="리뷰 결정 노드에서 확정하거나 보류할 제품 판단 항목입니다.">
      <PreviewPanel title="Decision Options">
        <div className="todo-decision-list">
          {decisionOptions.map((option) => (
            <section className="todo-decision-card" key={option.question}>
              <strong>{option.question}</strong>
              <span>{option.recommended}</span>
              <p>{option.rationale}</p>
            </section>
          ))}
        </div>
      </PreviewPanel>
      <PreviewPanel title="Review Questions">
        <ul className="todo-copy">
          <li>첫 버전 범위에서 삭제 확인 dialog가 필요한가?</li>
          <li>필터 상태를 URL이나 localStorage에 보존해야 하는가?</li>
          <li>완료 항목을 기본 목록 하단으로 이동할지, 원래 순서를 유지할지 결정이 필요한가?</li>
        </ul>
      </PreviewPanel>
    </PreviewShell>
  );
}
