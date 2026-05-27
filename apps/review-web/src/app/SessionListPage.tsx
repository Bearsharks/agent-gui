import type { PlanSession } from "@agent-gui/plan-schema";
import { Badge, Button } from "@agent-gui/design-system";
import { useEffect, useState, type MouseEvent } from "react";
import { createFixtureSession, deleteSession, fetchSessions } from "../api/client";
import { labelStatus } from "./graphReviewLabels";
import { MiniGraphPreview } from "./MiniGraphPreview";

export function SessionListPage() {
  const [sessions, setSessions] = useState<PlanSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSessions() {
    try {
      setError(null);
      setSessions(await fetchSessions());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to fetch sessions");
    } finally {
      setIsLoading(false);
    }
  }

  async function startFixture() {
    const result = await createFixtureSession();
    window.location.href = `/sessions/${result.sessionId}`;
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  return (
    <main className="session-list-page">
      <header className="session-list-header">
        <div>
          <h1>Graph Plan Sessions</h1>
          <p>현재 저장된 review session을 최신 업데이트 순으로 보여줍니다.</p>
        </div>
        <div className="session-list-actions">
          <Button variant="secondary" onClick={() => void loadSessions()}>
            새로고침
          </Button>
          <Button onClick={startFixture}>예제 세션 생성</Button>
        </div>
      </header>

      {error ? <section className="session-list-message">{error}</section> : null}
      {isLoading ? <section className="session-list-message">세션 불러오는 중...</section> : null}
      {!isLoading && sessions.length === 0 ? (
        <section className="session-list-message">
          <strong>저장된 세션이 없습니다.</strong>
          <span>예제 세션을 생성하면 이곳에 표시됩니다.</span>
        </section>
      ) : null}

      <section className="session-grid" aria-label="Saved graph plan sessions">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} onDelete={() => void loadSessions()} />
        ))}
      </section>
    </main>
  );
}

function SessionCard({ session, onDelete }: { session: PlanSession; onDelete: () => void }) {
  const issueCount = session.validation.errorCount + session.validation.warningCount;
  const rootGraph = session.graphPlan.graphs.find((graph) => graph.id === session.graphPlan.rootGraphId) ?? session.graphPlan.graphs[0];

  async function handleDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`세션 '${session.graphPlan.title}'을 삭제할까요?`)) return;
    await deleteSession(session.id);
    onDelete();
  }

  return (
    <article className="session-card">
      <a className="session-card-link" href={`/sessions/${session.id}`} aria-label={`${session.graphPlan.title} session open`}>
        <div className="session-card-copy">
          <div>
            <h2>{session.graphPlan.title}</h2>
            <p>{markdownSummary(session.graphPlan.markdownDesc) || rootGraph?.title || session.id}</p>
          </div>
          <div className="session-card-badges">
            <Badge tone={session.status === "needs_agent" ? "warn" : "neutral"}>{labelStatus(session.status)}</Badge>
            <Badge>리비전 {session.revision}</Badge>
            <Badge tone={issueCount > 0 ? "warn" : "neutral"}>이슈 {issueCount}</Badge>
          </div>
        </div>
        <MiniGraphPreview document={session.graphPlan} />
        <div className="session-card-meta">
          <span>{session.id}</span>
          <span>업데이트 {formatDateTime(session.updatedAt)}</span>
        </div>
      </a>
      <button className="session-delete-button" onClick={handleDelete} type="button">
        삭제
      </button>
    </article>
  );
}

function markdownSummary(markdown?: string): string {
  if (!markdown) return "";
  return (
    markdown
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[0] ?? ""
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
