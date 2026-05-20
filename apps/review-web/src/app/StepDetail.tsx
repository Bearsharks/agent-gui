import type { PlanSession } from "@agent-gui/plan-schema";
import { Badge, Card, Stack } from "@agent-gui/design-system";

interface StepDetailProps {
  session: PlanSession;
  selectedStepId: string | null;
}

export function StepDetail({ session, selectedStepId }: StepDetailProps) {
  const selectedStep = session.plan.steps.find((step) => step.id === selectedStepId) ?? session.plan.steps[0];

  if (!selectedStep) {
    return (
      <Card>
        <p style={{ color: "#64748b", textAlign: "center" }}>선택된 단계가 없습니다.</p>
      </Card>
    );
  }

  return (
    <Card>
      <Stack>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h2>단계 상세 내용</h2>
          <Badge tone="accent">{selectedStep.kind}</Badge>
        </div>
        
        <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #f1f5f9" }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", color: "#0f172a" }}>{selectedStep.title}</h3>
          <p style={{ margin: 0, fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>{selectedStep.summary}</p>
        </div>

        <DetailSection title="대상 소스 파일" items={selectedStep.files} emoji="📁" />
        <DetailSection title="식별된 리스크" items={selectedStep.risks} emoji="⚠️" />
        <DetailSection title="검증 조건" items={selectedStep.verification} emoji="✅" />
        
        <LinkedPrototypeList session={session} stepId={selectedStep.id} />
      </Stack>
    </Card>
  );
}

function DetailSection({ title, items, emoji }: { title: string; items?: string[]; emoji: string }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <strong style={{ fontSize: "13px", color: "#334155", display: "flex", alignItems: "center", gap: "4px" }}>
        <span>{emoji}</span> {title}
      </strong>
      <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
        {items.map((item) => (
          <li key={item} style={{ marginBottom: "4px" }}>{item}</li>
        ))}
      </ul>
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
    <div style={{ borderTop: "1px dashed #e2e8f0", paddingTop: "14px" }}>
      <strong style={{ fontSize: "13px", color: "#334155" }}>🔗 연결된 프로토타입 컴포넌트</strong>
      {linked.length ? (
        <ul style={{ margin: "6px 0 0 0", paddingLeft: "20px", fontSize: "13px", color: "#0f766e" }}>
          {linked.map(({ prototype, piece }) => (
            <li key={piece.id} style={{ marginBottom: "2px" }}>
              {prototype.title} / <strong>{piece.title}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#64748b" }}>연결된 프로토타입 컴포넌트가 없습니다.</p>
      )}
    </div>
  );
}
