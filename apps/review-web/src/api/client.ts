import type { PlanSession, PlanTarget } from "@agent-gui/plan-schema";

export async function fetchSession(sessionId: string): Promise<PlanSession> {
  const response = await fetch(`/api/sessions/${sessionId}`);
  if (!response.ok) throw new Error(`Failed to fetch session ${sessionId}`);
  return response.json();
}

export async function createFixtureSession(): Promise<{ sessionId: string; url: string; revision: number }> {
  const response = await fetch("/api/fixture-session", { method: "POST" });
  if (!response.ok) throw new Error("Failed to create fixture session");
  return response.json();
}

export async function postFeedback(sessionId: string, target: PlanTarget, message: string) {
  const response = await fetch(`/api/sessions/${sessionId}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target, message }),
  });
  if (!response.ok) throw new Error("Failed to post feedback");
  return response.json();
}

export async function approveSession(sessionId: string, revision: number) {
  const response = await fetch(`/api/sessions/${sessionId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision, message: "Approved from browser review UI" }),
  });
  if (!response.ok) throw new Error("Failed to approve session");
  return response.json();
}
