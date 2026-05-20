import type { PlanEvent, PlanSession } from "@agent-gui/plan-schema";
import { Badge, Card, Stack } from "@agent-gui/design-system";
import { useMemo } from "react";

interface EventTimelineProps {
  session: PlanSession;
}

export function EventTimeline({ session }: EventTimelineProps) {
  return (
    <Card>
      <Stack>
        <h2>이벤트 타임라인</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {session.events.map((event) => (
            <EventRow event={event} key={event.id} />
          ))}
        </div>
      </Stack>
    </Card>
  );
}

function EventRow({ event }: { event: PlanEvent }) {
  const detail = useMemo(() => {
    if (event.type === "user.feedback") {
      return event.message;
    }
    if (event.type === "agent.reply") {
      return event.body;
    }
    if (event.type === "agent.revision") {
      return `수정본(리비전 ${event.toRevision}) 생성: ${event.changeSummary.join(", ")}`;
    }
    if (event.type === "user.approval") {
      return event.message || "계획이 최종 승인되었습니다.";
    }
    return "";
  }, [event]);

  // 이벤트 타입 이름 한글화 맵핑
  const typeKorean = useMemo(() => {
    const maps: Record<string, string> = {
      "user.feedback": "사용자 피드백",
      "agent.reply": "에이전트 답변",
      "agent.revision": "계획 수정본",
      "user.approval": "계획 승인",
    };
    return maps[event.type] ?? event.type;
  }, [event.type]);

  return (
    <div className="event-card">
      <div className="event-header">
        <Badge tone={event.type.startsWith("user") ? "neutral" : "accent"}>{typeKorean}</Badge>
        <span className="event-time">
          {new Date(event.createdAt).toLocaleTimeString()}
        </span>
      </div>
      {detail && (
        <p className="event-detail">
          {detail}
        </p>
      )}
    </div>
  );
}
