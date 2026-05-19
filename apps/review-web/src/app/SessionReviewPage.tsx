import type { PlanEvent, PlanSession } from "@agent-gui/plan-schema";
import { Badge, Button, Card, Stack, tokens } from "@agent-gui/design-system";
import { useEffect, useMemo, useState } from "react";
import { approveSession, createFixtureSession, fetchSession, postFeedback } from "../api/client";

function getSessionId() {
  const match = window.location.pathname.match(/\/sessions\/([^/]+)/);
  return match?.[1] ?? null;
}

export function SessionReviewPage() {
  const [sessionId, setSessionId] = useState(getSessionId());
  const [session, setSession] = useState<PlanSession | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [planMessage, setPlanMessage] = useState("");
  const [prototypeMessage, setPrototypeMessage] = useState("");
  const [prototypePieceMessage, setPrototypePieceMessage] = useState("");

  async function load(id = sessionId) {
    if (!id) return;
    const next = await fetchSession(id);
    setSession(next);
    setSelectedStepId((current) => current ?? next.plan.steps[0]?.id ?? null);
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
            <h1>Plan Review Workspace</h1>
            <p>Start a fixture session to validate the full plan review loop.</p>
            <Button onClick={startFixture}>Create fixture plan session</Button>
          </Stack>
        </Card>
      </main>
    );
  }

  if (!session) return <main className="empty-page">Loading session...</main>;

  const selectedStep = session.plan.steps.find((step) => step.id === selectedStepId) ?? session.plan.steps[0];
  const selectedPrototype = session.plan.prototypes?.[0];
  const targetEvents = selectedStep ? eventsForStepReviewContext(session.events, session, selectedStep.id) : [];
  const prototypeEvents = selectedPrototype ? eventsForPrototypeContext(session.events, selectedPrototype.id, selectedPrototype.pieces.map((piece) => piece.id)) : [];
  const selectedPrototypePiece = selectedPrototype?.pieces.find((piece) => piece.id === "piece-approval-actions") ?? selectedPrototype?.pieces[0];
  const latestRevision = [...session.events].reverse().find((event) => event.type === "agent.revision");

  return (
    <main className="workspace">
      <header className="header">
        <div>
          <h1>{session.plan.title}</h1>
          <p>{session.plan.goal}</p>
        </div>
        <div className="header-actions">
          <Badge tone={session.status === "approved" ? "accent" : session.status === "needs_agent" ? "warn" : "neutral"}>
            {session.status}
          </Badge>
          <Badge>rev {session.revision}</Badge>
          <Button onClick={() => void approveSession(session.id, session.revision)}>Approve</Button>
        </div>
      </header>

      <section className="grid">
        <Card>
          <Stack>
            <h2>Key Decisions</h2>
            {session.plan.decisions.map((decision) => (
              <div key={decision.id} className="list-item">
                <strong>{decision.title}</strong>
                <p>{decision.summary}</p>
              </div>
            ))}
            <h2>Plan Feedback</h2>
            <textarea value={planMessage} onChange={(event) => setPlanMessage(event.target.value)} />
            <Button
              onClick={async () => {
                await postFeedback(session.id, { type: "plan" }, planMessage);
                setPlanMessage("");
              }}
            >
              Add plan feedback
            </Button>
          </Stack>
        </Card>

        <Card>
          <Stack>
            <h2>Steps</h2>
            {session.plan.steps.map((step, index) => (
              <button
                className={`step-button ${step.id === selectedStep?.id ? "active" : ""}`}
                key={step.id}
                onClick={() => setSelectedStepId(step.id)}
              >
                <span>Step {index + 1}</span>
                <strong>{step.title}</strong>
              </button>
            ))}
          </Stack>
        </Card>

        <Card>
          <Stack>
            <h2>Step Detail</h2>
            {selectedStep && (
              <>
                <Badge>{selectedStep.kind}</Badge>
                <h3>{selectedStep.title}</h3>
                <p>{selectedStep.summary}</p>
                <DetailList title="Files" items={selectedStep.files} />
                <DetailList title="Risks" items={selectedStep.risks} />
                <DetailList title="Verification" items={selectedStep.verification} />
                <LinkedPrototypeList session={session} stepId={selectedStep.id} />
                <h3>Step Feedback</h3>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
                <Button
                  onClick={async () => {
                    await postFeedback(session.id, { type: "step", id: selectedStep.id }, message);
                    setMessage("");
                  }}
                >
                  Add step feedback
                </Button>
                <Thread events={targetEvents} allEvents={session.events} />
              </>
            )}
          </Stack>
        </Card>

        <Card>
          <Stack>
            <h2>Prototype Playground</h2>
            {selectedPrototype ? (
              <>
                <PrototypeLinks session={session} prototypeId={selectedPrototype.id} />
                <iframe title="prototype preview" src={`/prototype/${session.id}/${selectedPrototype.id}`} />
                <h3>Prototype Feedback</h3>
                <textarea value={prototypeMessage} onChange={(event) => setPrototypeMessage(event.target.value)} />
                <Button
                  onClick={async () => {
                    await postFeedback(session.id, { type: "prototype", id: selectedPrototype.id }, prototypeMessage);
                    setPrototypeMessage("");
                  }}
                >
                  Add prototype feedback
                </Button>
                {selectedPrototypePiece ? (
                  <>
                    <h3>Prototype Piece Feedback</h3>
                    <textarea value={prototypePieceMessage} onChange={(event) => setPrototypePieceMessage(event.target.value)} />
                    <Button
                      onClick={async () => {
                        await postFeedback(session.id, { type: "prototype_piece", id: selectedPrototypePiece.id }, prototypePieceMessage);
                        setPrototypePieceMessage("");
                      }}
                    >
                      Add {selectedPrototypePiece.title} feedback
                    </Button>
                  </>
                ) : null}
                <Thread events={prototypeEvents} allEvents={session.events} />
              </>
            ) : (
              <p>No prototype linked to this plan.</p>
            )}
          </Stack>
        </Card>

        <Card>
          <Stack>
            <h2>Change Summary</h2>
            {latestRevision?.type === "agent.revision" ? (
              <>
                {latestRevision.changeSummary.map((item) => (
                  <p key={item}>{item}</p>
                ))}
                {latestRevision.prototypeChanges?.map((change) => (
                  <p key={`${change.prototypeId}-${change.pieceId ?? "all"}`}>
                    Prototype {change.prototypeId}
                    {change.pieceId ? ` / ${change.pieceId}` : ""}: {change.changeSummary.join("; ")}
                  </p>
                ))}
              </>
            ) : (
              <p>No revision yet.</p>
            )}
          </Stack>
        </Card>

        <Card>
          <Stack>
            <h2>Event Timeline</h2>
            {session.events.map((event) => (
              <EventRow event={event} key={event.id} />
            ))}
          </Stack>
        </Card>
      </section>
    </main>
  );
}

function DetailList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <strong>{title}</strong>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

function LinkedPrototypeList({ session, stepId }: { session: PlanSession; stepId: string }) {
  const prototypes = session.plan.prototypes ?? [];
  const linked = prototypes.flatMap((prototype) =>
    prototype.pieces
      .filter((piece) => piece.links.some((link) => link.target.type === "step" && link.target.id === stepId))
      .map((piece) => ({ prototype, piece })),
  );
  return (
    <div>
      <strong>Linked prototype pieces</strong>
      {linked.length ? (
        <ul>{linked.map(({ prototype, piece }) => <li key={piece.id}>{prototype.title} / {piece.title}</li>)}</ul>
      ) : (
        <p>No linked pieces.</p>
      )}
    </div>
  );
}

function PrototypeLinks({ session, prototypeId }: { session: PlanSession; prototypeId: string }) {
  const prototype = session.plan.prototypes?.find((item) => item.id === prototypeId);
  if (!prototype) return null;
  return (
    <div className="prototype-links">
      {prototype.links.map((link) => <Badge key={`${link.target.type}-${link.target.id}`}>{link.purpose}: {link.target.type}:{link.target.id}</Badge>)}
      {prototype.pieces.map((piece) => (
        <Badge key={piece.id} tone="accent">{piece.title} mapped</Badge>
      ))}
    </div>
  );
}

function Thread({ events, allEvents }: { events: PlanEvent[]; allEvents: PlanEvent[] }) {
  const replies = allEvents.filter((event) => event.type === "agent.reply");
  return (
    <div className="thread">
      {events.map((event) => (
        <div className="thread-item" key={event.id}>
          <strong>{event.type}</strong>
          {"message" in event ? <p>{event.message}</p> : null}
          {replies
            .filter((reply) => reply.type === "agent.reply" && reply.replyToEventId === event.id)
            .map((reply) => (
              <div className="reply" key={reply.id}>{reply.body}</div>
            ))}
        </div>
      ))}
    </div>
  );
}

function EventRow({ event }: { event: PlanEvent }) {
  return (
    <div className="event-row">
      <Badge>{event.type}</Badge>
      <span>{event.createdAt}</span>
    </div>
  );
}

function eventsForPrototypeContext(events: PlanEvent[], prototypeId: string, pieceIds: string[]) {
  return events.filter((event) => {
    if (!("target" in event)) return false;
    if (event.target.type === "prototype" && event.target.id === prototypeId) return true;
    return event.target.type === "prototype_piece" && !!event.target.id && pieceIds.includes(event.target.id);
  });
}

function eventsForStepReviewContext(events: PlanEvent[], session: PlanSession, stepId: string) {
  const linkedPrototypeIds = new Set<string>();
  const linkedPieceIds = new Set<string>();
  for (const prototype of session.plan.prototypes ?? []) {
    if (prototype.links.some((link) => link.target.type === "step" && link.target.id === stepId)) {
      linkedPrototypeIds.add(prototype.id);
    }
    for (const piece of prototype.pieces) {
      if (piece.links.some((link) => link.target.type === "step" && link.target.id === stepId)) {
        linkedPrototypeIds.add(prototype.id);
        linkedPieceIds.add(piece.id);
      }
    }
  }

  return events.filter((event) => {
    if (!("target" in event)) return false;
    if (event.target.type === "step" && event.target.id === stepId) return true;
    if (event.target.type === "prototype" && !!event.target.id) return linkedPrototypeIds.has(event.target.id);
    if (event.target.type === "prototype_piece" && !!event.target.id) return linkedPieceIds.has(event.target.id);
    return false;
  });
}
