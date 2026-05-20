import type { PlanSession } from "@agent-gui/plan-schema";
import { Card, Stack } from "@agent-gui/design-system";

interface ChangeSummaryProps {
  session: PlanSession;
}

export function ChangeSummary({ session }: ChangeSummaryProps) {
  const latestRevision = [...session.events].reverse().find((event) => event.type === "agent.revision");

  return (
    <Card>
      <Stack>
        <h2>변경 사항 요약</h2>
        {latestRevision?.type === "agent.revision" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {latestRevision.changeSummary.map((item) => (
              <p key={item} style={{ margin: 0, fontSize: "14px", color: "#475569", background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", borderLeft: "4px solid #0f766e" }}>
                {item}
              </p>
            ))}
            {latestRevision.prototypeChanges?.map((change) => (
              <p
                key={`${change.prototypeId}-${change.pieceId ?? "all"}`}
                style={{ margin: 0, fontSize: "13px", color: "#0f766e", fontStyle: "italic" }}
              >
                프로토타입 {change.prototypeId}
                {change.pieceId ? ` / 컴포넌트 ${change.pieceId}` : ""}: {change.changeSummary.join("; ")}
              </p>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>아직 변경 사항이 없습니다.</p>
        )}
      </Stack>
    </Card>
  );
}
