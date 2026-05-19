import type { PlanPrototype, PlanSession } from "@agent-gui/plan-schema";
import { Badge, Button, Card, Stack, tokens } from "@agent-gui/design-system";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function routeParams() {
  const match = window.location.pathname.match(/\/prototype\/([^/]+)\/([^/]+)/);
  return { sessionId: match?.[1] ?? "", prototypeId: match?.[2] ?? "" };
}

function PreviewApp() {
  const [{ sessionId, prototypeId }] = useState(routeParams);
  const [session, setSession] = useState<PlanSession | null>(null);

  async function load() {
    const response = await fetch(`/api/sessions/${sessionId}`);
    setSession(await response.json());
  }

  useEffect(() => {
    void load();
    const source = new EventSource(`/events/sessions/${sessionId}`);
    source.addEventListener("prototype.updated", () => void load());
    source.addEventListener("revision.created", () => void load());
    source.addEventListener("session.updated", () => void load());
    return () => source.close();
  }, [sessionId]);

  const prototype = session?.plan.prototypes?.find((item) => item.id === prototypeId);
  if (!prototype) return <main className="preview">Loading prototype...</main>;

  return (
    <main className="preview">
      <PrototypeComposition prototype={prototype} />
    </main>
  );
}

function PrototypeComposition({ prototype }: { prototype: PlanPrototype }) {
  return (
    <Stack gap={12}>
      <header>
        <Badge tone="accent">Prototype rev {prototype.revision}</Badge>
        <h1>{prototype.title}</h1>
        <p>{prototype.summary}</p>
      </header>
      <Card>
        <Stack>
          <h2>Composition</h2>
          <p>This prototype is composed from independently renderable React component pieces.</p>
          <div className="piece-grid">
            {prototype.pieces.map((piece) => (
              <Card key={piece.id} style={{ borderColor: tokens.color.accentSoft }}>
                <Stack>
                  <Badge>{piece.kind}</Badge>
                  <h3>{piece.title}</h3>
                  <p>{piece.summary}</p>
                  <div className="links">
                    {piece.links.map((link) => (
                      <Badge key={`${piece.id}-${link.target.type}-${link.target.id}`} tone="accent">
                        {link.purpose}: {link.target.type}:{link.target.id}
                      </Badge>
                    ))}
                  </div>
                  <PrototypePieceDemo pieceId={piece.id} />
                </Stack>
              </Card>
            ))}
          </div>
        </Stack>
      </Card>
    </Stack>
  );
}

function PrototypePieceDemo({ pieceId }: { pieceId: string }) {
  if (pieceId.includes("risk")) {
    return (
      <div className="risk-panel">
        <strong>High mapping risk</strong>
        <span>Show linked step and decision before approval.</span>
      </div>
    );
  }
  return (
    <div className="action-bar">
      <Button>Approve</Button>
      <Button variant="secondary">Request changes</Button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>,
);
