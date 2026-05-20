import type { PlanSession } from "@agent-gui/plan-schema";
import { Badge, Card, Stack } from "@agent-gui/design-system";

interface StepListProps {
  session: PlanSession;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}

export function StepList({ session, selectedStepId, onSelectStep }: StepListProps) {
  return (
    <Card>
      <Stack>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>작업 계획 단계</h2>
          <Badge>총 {session.plan.steps.length}개</Badge>
        </div>
        <div className="steps-container" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {session.plan.steps.map((step, index) => {
            const isActive = step.id === selectedStepId;
            return (
              <button
                className={`step-button ${isActive ? "active" : ""}`}
                key={step.id}
                onClick={() => onSelectStep(step.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  width: "100%",
                  padding: "12px",
                  border: isActive ? "2px solid #0f766e" : "1px solid #e2e8f0",
                  borderRadius: "8px",
                  background: isActive ? "#f0fdfa" : "white",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginBottom: "4px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", color: "#64748b" }}>
                    단계 {index + 1}
                  </span>
                  <Badge tone={step.kind === "test" ? "accent" : "neutral"}>{step.kind}</Badge>
                </div>
                <strong style={{ fontSize: "14px", color: "#1e293b", marginBottom: "4px" }}>{step.title}</strong>
                <p style={{ fontSize: "12px", color: "#64748b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {step.summary}
                </p>
              </button>
            );
          })}
        </div>
      </Stack>
    </Card>
  );
}
