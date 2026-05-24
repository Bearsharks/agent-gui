import type { GraphPlanGraph, GraphPlanTarget, GraphPlanValidationIssue, PlanEvent, PlanSession } from "@agent-gui/plan-schema";
import { Badge, Button } from "@agent-gui/design-system";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { approveSession, createFixtureSession, fetchSession, postFeedback } from "../api/client";
import { GraphPane, SelectedNodeDetail } from "./GraphPane";
import {
  breadcrumbForTarget,
  breadcrumbSegmentsForTarget,
  buildGraphIndex,
  nodeKey,
  normalizeSelection,
  selectionFromSearch,
  selectionToSearch,
  selectionToTarget,
  targetKey,
  targetToSelection,
  type GraphIndex,
  type GraphSelection,
} from "./graphReviewModel";
import { labelEventType, labelStatus, labelTargetType } from "./graphReviewLabels";

type DrawerKind = "history" | "activity" | "validation";
const DETAIL_PANEL_DEFAULT_WIDTH = 560;
const DETAIL_PANEL_MIN_RATIO = 0.3;
const DETAIL_PANEL_MAX_RATIO = 0.58;
const GRAPH_MIN_RATIO = 0.34;
const DETAIL_PANEL_MIN_ABSOLUTE_WIDTH = 340;

function getSessionId() {
  return window.location.pathname.match(/\/sessions\/([^/]+)/)?.[1] ?? null;
}

export function SessionReviewPage() {
  const [sessionId, setSessionId] = useState(getSessionId());
  const [session, setSession] = useState<PlanSession | null>(null);
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<GraphPlanTarget | null>(null);
  const [openDrawer, setOpenDrawer] = useState<DrawerKind | null>(null);
  const [detailPanelWidth, setDetailPanelWidth] = useState(DETAIL_PANEL_DEFAULT_WIDTH);
  const [isCompactDetailLayout, setIsCompactDetailLayout] = useState(() => window.innerWidth <= 920);
  const sessionIndex = useMemo(() => (session ? buildGraphIndex(session.graphPlan, session.validation.issues) : null), [session?.graphPlan, session?.validation.issues]);

  async function load(id = sessionId) {
    if (!id) return;
    const next = await fetchSession(id);
    const index = buildGraphIndex(next.graphPlan, next.validation.issues);
    const searchSelection = normalizeSelection(next.graphPlan, index, selectionFromSearch(next.graphPlan, index, window.location.search));
    setSession(next);
    setSelection((current) => normalizeSelection(next.graphPlan, index, current ?? searchSelection));
    setFeedbackTarget((current) => current ?? selectionToTarget(searchSelection));
  }

  useEffect(() => {
    void load();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const source = new EventSource(`/events/sessions/${sessionId}`);
    source.addEventListener("session.updated", () => void load(sessionId));
    source.addEventListener("event.created", () => void load(sessionId));
    source.addEventListener("revision.created", () => void load(sessionId));
    return () => source.close();
  }, [sessionId]);

  useEffect(() => {
    function handleResize() {
      const bounds = detailPanelBounds();
      setIsCompactDetailLayout(!bounds.canResize);
      if (bounds.canResize) setDetailPanelWidth((current) => clamp(current, bounds.min, bounds.max));
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function startFixture() {
    const result = await createFixtureSession();
    window.history.pushState(null, "", `/sessions/${result.sessionId}`);
    setSessionId(result.sessionId);
  }

  function updateSelection(next: GraphSelection) {
    if (!session || !sessionIndex) return;
    const normalized = normalizeSelection(session.graphPlan, sessionIndex, next);
    setSelection(normalized);
    setFeedbackTarget(selectionToTarget(normalized));
    window.history.replaceState(null, "", `${window.location.pathname}?${selectionToSearch(normalized)}`);
  }

  function selectGraphTarget(target: GraphPlanTarget) {
    if (!session || !sessionIndex) return;
    const normalized = normalizeSelection(session.graphPlan, sessionIndex, targetToSelection(target, session.graphPlan.rootGraphId));
    setSelection(normalized);
    setFeedbackTarget(target);
    window.history.replaceState(null, "", `${window.location.pathname}?${selectionToSearch(normalized)}`);
  }

  function startDetailPanelResize(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const bounds = detailPanelBounds();
    if (!bounds.canResize) return;
    const startX = event.clientX;
    const startWidth = detailPanelWidth;
    function handleMove(moveEvent: globalThis.MouseEvent) {
      setDetailPanelWidth(clamp(startWidth - (moveEvent.clientX - startX), detailPanelBounds().min, detailPanelBounds().max));
    }
    function handleUp() {
      document.body.classList.remove("is-resizing-node-detail");
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    }
    document.body.classList.add("is-resizing-node-detail");
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  if (!sessionId) {
    return (
      <main className="empty-page">
        <section className="empty-card">
          <h1>그래프 HTML 리뷰</h1>
          <p>graph/html 기준 fixture session을 생성합니다.</p>
          <Button onClick={startFixture}>예제 세션 생성</Button>
        </section>
      </main>
    );
  }

  if (!session || !selection || !sessionIndex) return <main className="empty-page">세션 불러오는 중...</main>;

  const index = sessionIndex;
  const normalizedSelection = normalizeSelection(session.graphPlan, index, selection);
  const feedback = feedbackTarget ?? selectionToTarget(normalizedSelection);
  const selectedGraph = index.graphsById.get(normalizedSelection.graphId) ?? session.graphPlan.graphs[0];
  const selectedNode = normalizedSelection.nodeId ? index.nodesByKey.get(nodeKey(normalizedSelection.graphId, normalizedSelection.nodeId)) : undefined;
  const rootIssueCount = session.validation.errorCount + session.validation.warningCount;

  return (
    <main className="graph-review-shell">
      <header className="graph-review-header">
        <div className="plan-header-copy">
          <h1>{session.graphPlan.title}</h1>
          {session.graphPlan.markdownDesc ? <p>{markdownSummary(session.graphPlan.markdownDesc)}</p> : null}
        </div>
        <div className="graph-review-actions">
          <Badge tone={session.validation.publishReady ? "accent" : "warn"}>{session.validation.publishReady ? "게시 가능" : "게시 불가"}</Badge>
          <Badge tone={rootIssueCount > 0 ? "warn" : "neutral"}>이슈 {rootIssueCount}개</Badge>
          <Badge>리비전 {session.revision}</Badge>
          <Badge>{labelStatus(session.status)}</Badge>
          <Button variant="secondary" onClick={() => setOpenDrawer((current) => (current === "history" ? null : "history"))}>변경이력</Button>
          <Button variant="secondary" onClick={() => setOpenDrawer((current) => (current === "activity" ? null : "activity"))}>활동</Button>
          <Button variant="secondary" onClick={() => setOpenDrawer((current) => (current === "validation" ? null : "validation"))}>검증</Button>
          <Button onClick={() => void approveSession(session.id, session.revision)} disabled={session.status === "approved"}>승인</Button>
        </div>
      </header>

      <section
        className={`graph-review-main ${selectedNode ? "with-detail" : "graph-only"}`}
        style={selectedNode && !isCompactDetailLayout ? { gridTemplateColumns: `minmax(34vw, 1fr) ${detailPanelWidth}px` } : undefined}
      >
        <div className="graph-workspace">
          <GraphPane document={session.graphPlan} index={index} selection={normalizedSelection} onSelect={updateSelection} onNodeSelect={updateSelection} />
          <FeedbackComposer
            session={session}
            index={index}
            detailSelection={normalizedSelection}
            feedbackTarget={feedback}
            onFeedbackSelect={setFeedbackTarget}
            onRefresh={() => void load()}
          />
        </div>
        {selectedNode && selectedGraph ? (
          <SelectedNodeDetail
            graph={selectedGraph}
            node={selectedNode}
            selection={normalizedSelection}
            index={index}
            onSelect={updateSelection}
            onClose={() => setSelection({ graphId: normalizedSelection.graphId })}
            onResizeStart={startDetailPanelResize}
          />
        ) : null}
      </section>

      {openDrawer ? <ReviewDrawer kind={openDrawer} session={session} index={index} onSelect={selectGraphTarget} onClose={() => setOpenDrawer(null)} /> : null}
    </main>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function detailPanelBounds(): { min: number; max: number; canResize: boolean } {
  const viewportWidth = window.innerWidth;
  if (viewportWidth <= 920) return { min: viewportWidth, max: viewportWidth, canResize: false };
  return {
    min: Math.max(DETAIL_PANEL_MIN_ABSOLUTE_WIDTH, viewportWidth * DETAIL_PANEL_MIN_RATIO),
    max: Math.max(DETAIL_PANEL_MIN_ABSOLUTE_WIDTH, Math.min(viewportWidth * DETAIL_PANEL_MAX_RATIO, viewportWidth * (1 - GRAPH_MIN_RATIO))),
    canResize: true,
  };
}

function markdownSummary(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? "";
}

function FeedbackComposer({
  session,
  index,
  detailSelection,
  feedbackTarget,
  onFeedbackSelect,
  onRefresh,
}: {
  session: PlanSession;
  index: GraphIndex;
  detailSelection: GraphSelection;
  feedbackTarget: GraphPlanTarget;
  onFeedbackSelect: (target: GraphPlanTarget) => void;
  onRefresh: () => void;
}) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isSending, setIsSending] = useState(false);
  const breadcrumbSegments = [{ label: "전체 플랜", target: { type: "plan" } as GraphPlanTarget }, ...breadcrumbSegmentsForTarget(selectionToTarget(detailSelection), index)];
  const selectedTargetKey = targetKey(feedbackTarget);

  async function send() {
    const currentMessage = inputRef.current?.value.trim() ?? message.trim();
    if (!currentMessage || isSending) return;
    setIsSending(true);
    try {
      await postFeedback(session.id, feedbackTarget, currentMessage);
      setMessage("");
      if (inputRef.current) inputRef.current.value = "";
      onRefresh();
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="feedback-bar">
      <div className="feedback-target-path" aria-label="피드백 대상 경로">
        {breadcrumbSegments.map((segment, index) => (
          <button key={`${targetKey(segment.target)}:${index}`} className={targetKey(segment.target) === selectedTargetKey ? "selected" : ""} onClick={() => onFeedbackSelect(segment.target)} type="button">
            {index > 0 ? <span>/</span> : null}
            <strong>{segment.label}</strong>
          </button>
        ))}
      </div>
      <Badge>{labelTargetType(feedbackTarget.type)}</Badge>
      <input
        ref={inputRef}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) void send();
        }}
        placeholder={`${breadcrumbForTarget(feedbackTarget, index)}에 피드백`}
      />
      <Button onClick={send} disabled={isSending || !message.trim()}>제출</Button>
    </section>
  );
}

function ReviewDrawer({
  kind,
  session,
  index,
  onSelect,
  onClose,
}: {
  kind: DrawerKind;
  session: PlanSession;
  index: GraphIndex;
  onSelect: (target: GraphPlanTarget) => void;
  onClose: () => void;
}) {
  const titleByKind: Record<DrawerKind, string> = { history: "변경이력", activity: "활동", validation: "검증" };
  return (
    <aside className="review-drawer" aria-label={titleByKind[kind]}>
      <div className="review-drawer-header">
        <h2>{titleByKind[kind]}</h2>
        <Button variant="secondary" onClick={onClose}>닫기</Button>
      </div>
      <div className="review-drawer-body">
        {kind === "history" ? <RevisionSummary events={session.events} index={index} /> : null}
        {kind === "activity" ? <EventTimeline session={session} index={index} onSelect={onSelect} /> : null}
        {kind === "validation" ? <ValidationPanel session={session} index={index} onSelect={onSelect} /> : null}
      </div>
    </aside>
  );
}

function ValidationPanel({ session, index, onSelect }: { session: PlanSession; index: GraphIndex; onSelect: (target: GraphPlanTarget) => void }) {
  return (
    <section className="tool-card">
      <div className="tool-card-header">
        <h3>검증</h3>
        <Badge tone={session.validation.errorCount > 0 ? "warn" : "neutral"}>오류 {session.validation.errorCount}개 · 경고 {session.validation.warningCount}개</Badge>
      </div>
      <div className="issue-list">
        {session.validation.issues.length === 0 ? <p className="muted">검증 이슈가 없습니다.</p> : null}
        {session.validation.issues.map((issue) => (
          <button className="issue-row" key={`${issue.code}:${issue.path}`} onClick={() => issue.target && onSelect(issue.target)}>
            <strong>{issue.code}</strong>
            <span>{issue.message}</span>
            <em>{issue.target ? breadcrumbForTarget(issue.target, index) : issue.path}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function EventTimeline({ session, index, onSelect }: { session: PlanSession; index: GraphIndex; onSelect: (target: GraphPlanTarget) => void }) {
  return (
    <section className="tool-card">
      <div className="tool-card-header">
        <h3>타임라인</h3>
        <Badge>{session.events.length}</Badge>
      </div>
      <div className="timeline-list">
        {session.events.map((event) => (
          <button className="timeline-row" key={event.id} onClick={() => hasEventTarget(event) && onSelect(event.target)}>
            <EventSnippet event={event} index={index} />
          </button>
        ))}
      </div>
    </section>
  );
}

function EventSnippet({ event, index }: { event: PlanEvent; index?: GraphIndex }) {
  const detail =
    event.type === "user.feedback"
      ? event.message
      : event.type === "agent.reply"
        ? event.body
        : event.type === "agent.revision"
          ? [...event.changeSummary.structure, ...event.changeSummary.content, ...event.changeSummary.validation].join(", ")
          : event.message ?? "승인됨";
  return (
    <>
      <strong>{labelEventType(event.type)}</strong>
      {hasEventTarget(event) && index ? <span>{breadcrumbForTarget(event.target, index)}</span> : null}
      <p>{detail || "상세 내용 없음"}</p>
    </>
  );
}

function RevisionSummary({ events, index }: { events: PlanEvent[]; index: GraphIndex }) {
  const revisions = events.filter((event) => event.type === "agent.revision");
  if (revisions.length === 0) return <p className="muted drawer-empty">리비전이 없습니다.</p>;
  return (
    <section className="tool-card">
      <div className="tool-card-header">
        <h3>리비전 요약</h3>
        <Badge>{revisions.length}</Badge>
      </div>
      {revisions.map((event) => (
        <div className="revision-row" key={event.id}>
          <strong>r{event.fromRevision} → r{event.toRevision}</strong>
          {event.target ? <span>{breadcrumbForTarget(event.target, index)}</span> : null}
          <ChangeGroup label="구조" items={event.changeSummary.structure} />
          <ChangeGroup label="내용" items={event.changeSummary.content} />
          <ChangeGroup label="검증" items={event.changeSummary.validation} />
        </div>
      ))}
    </section>
  );
}

function ChangeGroup({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="change-group">
      <em>{label}</em>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

function hasEventTarget(event: PlanEvent): event is Extract<PlanEvent, { target: GraphPlanTarget }> {
  return "target" in event && event.target !== undefined;
}
