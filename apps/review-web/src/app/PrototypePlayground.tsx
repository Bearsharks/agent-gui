import type { PlanSession } from "@agent-gui/plan-schema";
import { Badge, Card, Stack } from "@agent-gui/design-system";

interface PrototypePlaygroundProps {
  session: PlanSession;
}

export function PrototypePlayground({ session }: PrototypePlaygroundProps) {
  const selectedPrototype = session.plan.prototypes?.[0];

  if (!selectedPrototype) {
    return (
      <Card>
        <Stack>
          <h2>프로토타입 샌드박스</h2>
          <p style={{ color: "#64748b" }}>이 계획에 연결된 프로토타입이 없습니다.</p>
        </Stack>
      </Card>
    );
  }

  return (
    <Card>
      <Stack>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>프로토타입 샌드박스</h2>
          <div className="prototype-links" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {selectedPrototype.links.map((link) => (
              <Badge key={`${link.target.type}-${link.target.id}`} tone="neutral">
                {link.purpose}: {link.target.type}
              </Badge>
            ))}
          </div>
        </div>

        <div style={{ position: "relative", width: "100%" }}>
          <iframe
            title="prototype preview"
            src={`/prototype/${session.id}/${selectedPrototype.id}`}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              height: "420px",
              width: "100%",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
            }}
          />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", background: "#f8fafc", padding: "10px", borderRadius: "6px" }}>
          <span style={{ fontSize: "12px", color: "#64748b", display: "flex", alignItems: "center", marginRight: "4px" }}>
            맵핑된 컴포넌트 목록:
          </span>
          {selectedPrototype.pieces.map((piece) => (
            <Badge key={piece.id} tone="accent">
              {piece.title}
            </Badge>
          ))}
        </div>
      </Stack>
    </Card>
  );
}
