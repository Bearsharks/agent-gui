import { Badge, Button, Card, Stack, tokens } from "@agent-gui/design-system";

const requests = [
  { id: "req-184", title: "Runtime surface rename", risk: "medium" },
  { id: "req-191", title: "Prototype mapping review", risk: "high" },
];

export function ReviewSurface() {
  return (
    <main style={{ background: tokens.color.bg, color: tokens.color.text, minHeight: "100vh", padding: 24 }}>
      <Stack gap={16}>
        <header>
          <h1 style={{ fontSize: 24, margin: 0 }}>Review Target App</h1>
          <p style={{ color: tokens.color.muted, margin: "6px 0 0" }}>
            Fixture app used to validate plan review and prototype workflows.
          </p>
        </header>
        <section style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(240px, 320px) 1fr" }}>
          <Card>
            <Stack>
              <h2 style={{ fontSize: 16, margin: 0 }}>Requests</h2>
              {requests.map((request) => (
                <button
                  key={request.id}
                  style={{
                    background: "white",
                    border: `1px solid ${tokens.color.border}`,
                    borderRadius: tokens.radius.sm,
                    color: tokens.color.text,
                    cursor: "pointer",
                    padding: 12,
                    textAlign: "left",
                  }}
                >
                  <strong>{request.title}</strong>
                  <div style={{ marginTop: 8 }}>
                    <Badge tone={request.risk === "high" ? "warn" : "neutral"}>{request.risk} risk</Badge>
                  </div>
                </button>
              ))}
            </Stack>
          </Card>
          <Card>
            <Stack>
              <Badge tone="accent">Selected request</Badge>
              <h2 style={{ fontSize: 20, margin: 0 }}>Prototype mapping review</h2>
              <p style={{ color: tokens.color.muted, margin: 0 }}>
                The approval bar and risk panel need clearer mapping between user feedback, plan steps, and prototype pieces.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <Button>Approve</Button>
                <Button variant="secondary">Request changes</Button>
              </div>
            </Stack>
          </Card>
        </section>
      </Stack>
    </main>
  );
}
