import type { PlanSession } from "@agent-gui/plan-schema";
import { Badge, Button, Card, Stack } from "@agent-gui/design-system";
import { useEffect, useState } from "react";
import { approveSession, createFixtureSession, fetchSession } from "../api/client";
import { StepList } from "./StepList";
import { StepDetail } from "./StepDetail";
import { PrototypePlayground } from "./PrototypePlayground";
import { FeedbackCenter } from "./FeedbackCenter";
import { EventTimeline } from "./EventTimeline";
import { ChangeSummary } from "./ChangeSummary";

function getSessionId() {
  const match = window.location.pathname.match(/\/sessions\/([^/]+)/);
  return match?.[1] ?? null;
}

export function SessionReviewPage() {
  const [sessionId, setSessionId] = useState(getSessionId());
  const [session, setSession] = useState<PlanSession | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedPrototypeId, setSelectedPrototypeId] = useState<string | null>(null);

  async function load(id = sessionId) {
    if (!id) return;
    const next = await fetchSession(id);
    setSession(next);
    setSelectedStepId((current) => current ?? next.plan.steps[0]?.id ?? null);
    setSelectedPrototypeId((current) => current ?? next.plan.prototypes?.[0]?.id ?? null);
  }

  useEffect(() => {
    void load();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const source = new EventSource(`/events/sessions/${sessionId}`);
    const interval = window.setInterval(() => void load(sessionId), 1000);
    source.addEventListener("session.updated", () => void load(sessionId));
    source.addEventListener("event.created", () => void load(sessionId));
    source.addEventListener("revision.created", () => void load(sessionId));
    source.addEventListener("prototype.updated", () => void load(sessionId));
    return () => {
      window.clearInterval(interval);
      source.close();
    };
  }, [sessionId]);

  async function startFixture() {
    const result = await createFixtureSession();
    window.history.pushState(null, "", `/sessions/${result.sessionId}`);
    setSessionId(result.sessionId);
  }

  if (!sessionId) {
    return (
      <main className="empty-page">
        <Card>
          <Stack>
            <h1>계획 검토 워크스페이스</h1>
            <p>전체 계획 검토 루프 검증을 위한 테스트 세션을 시작합니다.</p>
            <Button onClick={startFixture}>테스트 계획 세션 생성</Button>
          </Stack>
        </Card>
      </main>
    );
  }

  if (!session) return <main className="empty-page">세션 불러오는 중...</main>;

  const statusKorean = {
    draft: "초안 작성",
    needs_agent: "에이전트 검토 대기",
    agent_replied: "에이전트 답변 완료",
    revision_ready: "수정본 제출 대기",
    approved: "계획 최종 승인",
    rejected: "계획 반려됨",
  }[session.status];

  return (
    <main className="workspace-container">
      <header className="header">
        <div>
          <h1>{session.plan.title}</h1>
          <p>{session.plan.goal}</p>
        </div>
        <div className="header-actions">
          <Badge tone={session.status === "approved" ? "accent" : session.status === "needs_agent" ? "warn" : "neutral"}>
            {statusKorean}
          </Badge>
          <Badge>리비전 {session.revision}</Badge>
          <Button onClick={() => void approveSession(session.id, session.revision)}>계획 최종 승인</Button>
        </div>
      </header>

      <section className="workspace-body">
        {/* Left Panel: Plan navigation and specifications */}
        <div className="panel left-panel">
          <Card>
            <Stack>
              <h2>핵심 의사결정 사항</h2>
              {session.plan.decisions.map((decision) => (
                <div key={decision.id} className="list-item">
                  <strong>{decision.title}</strong>
                  <p>{decision.summary}</p>
                </div>
              ))}
            </Stack>
          </Card>
          
          <StepList
            session={session}
            selectedStepId={selectedStepId}
            onSelectStep={setSelectedStepId}
          />
          
          <ChangeSummary session={session} />
        </div>

        {/* Right Panel: Sandbox preview and interactive feedback */}
        <div className="panel right-panel">
          <PrototypePlayground
            session={session}
            selectedPrototypeId={selectedPrototypeId}
            onSelectPrototype={setSelectedPrototypeId}
            onSelectStep={setSelectedStepId}
          />
          
          <StepDetail
            session={session}
            selectedStepId={selectedStepId}
          />
          
          <FeedbackCenter
            session={session}
            selectedStepId={selectedStepId}
            selectedPrototypeId={selectedPrototypeId}
            onRefresh={() => void load()}
          />
          
          <EventTimeline session={session} />
        </div>
      </section>
    </main>
  );
}
