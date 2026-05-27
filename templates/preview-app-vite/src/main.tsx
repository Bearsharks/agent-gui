import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PreviewPanel, PreviewShell } from "./preview-shell";
import "./sample-preview.css";

function SampleSearchPanel() {
  return (
    <div className="sample-search-panel">
      <label>
        검색어
        <input readOnly value="invoice" />
      </label>
      <div className="sample-result-list" aria-label="검색 결과 예시">
        <div>
          <strong>Invoice approval</strong>
          <span>3개 결과, 최신순 정렬</span>
        </div>
        <div>
          <strong>Payment review</strong>
          <span>비어 있지 않은 결과 상태</span>
        </div>
      </div>
    </div>
  );
}

function ReviewNotes() {
  return (
    <ul className="sample-review-notes">
      <li>이 화면은 대상 프로젝트가 소유한 컴포넌트와 mock data로 구성한다.</li>
      <li>Agent GUI에는 이 preview app의 localhost URL만 iframe entry로 등록한다.</li>
      <li>PreviewShell과 PreviewPanel은 layout shell일 뿐 도메인 의미를 해석하지 않는다.</li>
    </ul>
  );
}

function App() {
  return (
    <PreviewShell
      title="검색 패널 preview"
      description="대상 프로젝트 안에서 소유하는 임시 preview app 예시입니다."
    >
      <PreviewPanel title="실제 화면 상태">
        <SampleSearchPanel />
      </PreviewPanel>
      <PreviewPanel title="검토 기준">
        <ReviewNotes />
      </PreviewPanel>
    </PreviewShell>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
