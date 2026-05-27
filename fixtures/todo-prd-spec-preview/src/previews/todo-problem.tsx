import { PreviewPanel, PreviewShell } from "../host/PreviewShell";
import { problemStatements } from "./todo-data";
import "./todo-preview.css";

export default function TodoProblemPreview() {
  return (
    <PreviewShell title="Todo Problem Definition" description="문제 정의 노드에서 검토할 사용자 문제, 첫 버전 경계, 제외 범위입니다.">
      <PreviewPanel title="User Problem">
        <section className="todo-copy">
          <p>
            개인 사용자는 오늘 할 일을 빠르게 기록하고, 완료 여부를 다시 확인할 수 있는 작고 예측 가능한
            작업 목록이 필요합니다.
          </p>
          <ul>
            {problemStatements.map((statement) => (
              <li key={statement}>{statement}</li>
            ))}
          </ul>
        </section>
      </PreviewPanel>
      <PreviewPanel title="Out Of Scope">
        <ul className="todo-copy">
          <li>계정, 로그인, 서버 동기화</li>
          <li>공유 목록, 담당자 배정, 댓글</li>
          <li>반복 일정, 알림, 캘린더 연동</li>
        </ul>
      </PreviewPanel>
    </PreviewShell>
  );
}
