import type { PlanEvent, PlanSession, PlanTarget } from "@agent-gui/plan-schema";
import { Badge, Button, Card, Stack } from "@agent-gui/design-system";
import { useState, useMemo } from "react";
import { postFeedback, notifyAgent } from "../api/client";

interface FeedbackCenterProps {
  session: PlanSession;
  selectedStepId: string | null;
  onRefresh: () => void;
}

type TargetType = "plan" | "step" | "prototype" | "prototype_piece";

export function FeedbackCenter({ session, selectedStepId, onRefresh }: FeedbackCenterProps) {
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("step");
  const [isSending, setIsSending] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);

  const selectedStep = session.plan.steps.find((step) => step.id === selectedStepId) ?? session.plan.steps[0];
  const selectedPrototype = session.plan.prototypes?.[0];
  const selectedPrototypePiece = selectedPrototype?.pieces[0];

  const targets = useMemo(() => {
    const list: { label: string; value: TargetType; targetObj: PlanTarget }[] = [
      { label: "전체 계획 (Plan)", value: "plan", targetObj: { type: "plan" as const } },
    ];
    if (selectedStep) {
      list.push({
        label: `현재 스텝: ${selectedStep.title}`,
        value: "step",
        targetObj: { type: "step" as const, id: selectedStep.id },
      });
    }
    if (selectedPrototype) {
      list.push({
        label: "프로토타입 데모 (Prototype)",
        value: "prototype",
        targetObj: { type: "prototype" as const, id: selectedPrototype.id },
      });
    }
    if (selectedPrototypePiece) {
      list.push({
        label: `구현 컴포넌트: ${selectedPrototypePiece.title}`,
        value: "prototype_piece",
        targetObj: { type: "prototype_piece" as const, id: selectedPrototypePiece.id },
      });
    }
    return list;
  }, [selectedStep, selectedPrototype, selectedPrototypePiece]);

  const currentTargetObj = useMemo(() => {
    return targets.find((t) => t.value === targetType)?.targetObj ?? { type: "plan" as const };
  }, [targets, targetType]);

  const activeThreadEvents = useMemo(() => {
    const events = session.events;
    return events.filter((event) => {
      if (!("target" in event)) return false;
      if (targetType === "plan" && event.target.type === "plan") return true;
      if (targetType === "step" && event.target.type === "step" && event.target.id === selectedStep?.id) return true;
      if (targetType === "prototype" && event.target.type === "prototype" && event.target.id === selectedPrototype?.id) return true;
      if (targetType === "prototype_piece" && event.target.type === "prototype_piece" && event.target.id === selectedPrototypePiece?.id) return true;
      return false;
    });
  }, [session.events, targetType, selectedStep, selectedPrototype, selectedPrototypePiece]);

  async function handleSend() {
    if (!message.trim() || isSending) return;
    setIsSending(true);
    try {
      await postFeedback(session.id, currentTargetObj, message);
      setMessage("");
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  }

  async function handleNotify() {
    if (isNotifying) return;
    setIsNotifying(true);
    try {
      await notifyAgent(session.id);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsNotifying(false);
    }
  }

  const replies = session.events.filter((event) => event.type === "agent.reply");
  const originalFeedbacks = activeThreadEvents.filter((event) => event.type !== "agent.reply");

  return (
    <Card>
      <Stack>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>피드백 센터 💬</h2>
          <Button onClick={handleNotify} disabled={isNotifying || session.status === "approved"}>
            {isNotifying ? "알림 전송 중..." : "에이전트 호출 ⚡"}
          </Button>
        </div>

        <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
          <label style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold" }}>FEEDBACK TARGET</label>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {targets.map((t) => {
              const isSelected = t.value === targetType;
              return (
                <button
                  key={t.value}
                  onClick={() => setTargetType(t.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "20px",
                    border: isSelected ? "1.5px solid #0f766e" : "1px solid #cbd5e1",
                    background: isSelected ? "#e6f4f1" : "white",
                    color: isSelected ? "#0f766e" : "#475569",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: isSelected ? "bold" : "normal",
                  }}
                >
                  {t.value === "plan" ? "계획" : t.value === "step" ? "스텝" : t.value === "prototype" ? "데모" : "컴포넌트"}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
          <textarea
            placeholder={`${targets.find((t) => t.value === targetType)?.label || ""}에 대한 피드백을 적어주세요...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "14px",
              minHeight: "80px",
            }}
          />
          <Button onClick={handleSend} disabled={isSending || !message.trim()}>
            {isSending ? "제출 중..." : "피드백 제출"}
          </Button>
        </div>

        <div
          className="messenger-thread"
          style={{
            borderTop: "1px solid #e2e8f0",
            paddingTop: "16px",
            marginTop: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            maxHeight: "300px",
            overflowY: "auto",
          }}
        >
          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", textTransform: "uppercase" }}>
            피드백 히스토리 ({originalFeedbacks.length})
          </span>
          {originalFeedbacks.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", margin: "20px 0" }}>
              이 타겟에는 아직 등록된 피드백이 없습니다.
            </p>
          ) : (
            originalFeedbacks.map((event) => (
              <div
                key={event.id}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Badge tone="neutral">사용자 피드백</Badge>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                {"message" in event ? (
                  <p style={{ margin: 0, fontSize: "13px", color: "#334155", lineHeight: "1.4" }}>{event.message}</p>
                ) : null}

                {replies
                  .filter((reply) => reply.type === "agent.reply" && reply.replyToEventId === event.id)
                  .map((reply) => (
                    <div
                      key={reply.id}
                      style={{
                        background: "#e6f4f1",
                        border: "1px solid #b2dfdb",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        marginTop: "4px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <strong style={{ fontSize: "10px", textTransform: "uppercase", color: "#0f766e" }}>
                        에이전트 답변 ({reply.disposition || "answered"})
                      </strong>
                      <p style={{ margin: 0, fontSize: "13px", color: "#115e59", lineHeight: "1.4" }}>{reply.body}</p>
                    </div>
                  ))}
              </div>
            ))
          )}
        </div>
      </Stack>
    </Card>
  );
}
