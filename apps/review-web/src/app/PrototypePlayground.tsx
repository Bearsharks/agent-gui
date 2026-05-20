import type { PlanPrototype, PlanSession, PlanTarget, PrototypeTab } from "@agent-gui/plan-schema";
import { Badge, Button, Card, Stack } from "@agent-gui/design-system";
import { useEffect, useMemo, useState } from "react";

interface PrototypePlaygroundProps {
  session: PlanSession;
  selectedPrototypeId: string | null;
  onSelectPrototype: (prototypeId: string) => void;
  onSelectStep?: (stepId: string) => void;
}

export function PrototypePlayground({ session, selectedPrototypeId, onSelectPrototype, onSelectStep }: PrototypePlaygroundProps) {
  const prototypes = session.plan.prototypes ?? [];
  const selectedPrototype = prototypes.find((prototype) => prototype.id === selectedPrototypeId) ?? prototypes[0];
  const tabs = useMemo(() => prototypeTabs(selectedPrototype), [selectedPrototype]);
  const [selectedTabId, setSelectedTabId] = useState(tabs[0]?.id ?? "");
  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0];
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [showFrameWarning, setShowFrameWarning] = useState(false);

  useEffect(() => {
    if (!selectedPrototype && selectedPrototypeId) onSelectPrototype("");
    if (selectedPrototype && selectedPrototype.id !== selectedPrototypeId) onSelectPrototype(selectedPrototype.id);
  }, [selectedPrototype, selectedPrototypeId, onSelectPrototype]);

  useEffect(() => {
    setSelectedTabId((current) => tabs.some((tab) => tab.id === current) ? current : tabs[0]?.id ?? "");
  }, [tabs]);

  useEffect(() => {
    setFrameLoaded(false);
    setShowFrameWarning(false);
    if (!selectedTab) return;
    const timer = window.setTimeout(() => {
      setShowFrameWarning(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [selectedTab?.url]);

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
        <div className="prototype-header">
          <div>
            <h2>프로토타입 샌드박스</h2>
            <div className="prototype-title-row">
              <strong>{selectedPrototype.title}</strong>
              <code>{selectedPrototype.id}</code>
            </div>
          </div>
          {prototypes.length > 1 ? (
            <div className="prototype-switcher" aria-label="프로토타입 선택">
              {prototypes.map((prototype) => (
                <button
                  className={`prototype-switch ${prototype.id === selectedPrototype.id ? "active" : ""}`}
                  key={prototype.id}
                  onClick={() => onSelectPrototype(prototype.id)}
                  type="button"
                >
                  {prototype.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {selectedPrototype.summary ? <p className="prototype-summary">{selectedPrototype.summary}</p> : null}

        <div className="prototype-context">
          <span className="prototype-context-label">연결된 계획</span>
          <div className="prototype-targets">
            {selectedPrototype.links.length ? (
              selectedPrototype.links.map((link) => (
                <button
                  className="prototype-target"
                  key={`${link.target.type}-${link.target.id ?? "all"}-${link.purpose}`}
                  onClick={() => {
                    if (link.target.type === "step" && link.target.id) onSelectStep?.(link.target.id);
                  }}
                  type="button"
                >
                  <Badge tone={link.target.type === "step" ? "accent" : "neutral"}>{targetLabel(session, link.target)}</Badge>
                  <span>{link.purpose}</span>
                </button>
              ))
            ) : (
              <span className="prototype-empty-note">연결된 계획 항목이 없습니다.</span>
            )}
          </div>
        </div>

        {tabs.length ? (
          <>
            <div className="prototype-tabbar" role="tablist" aria-label="프로토타입 URL 탭">
              {tabs.map((tab) => (
                <button
                  aria-selected={tab.id === selectedTab?.id}
                  className={`prototype-tab ${tab.id === selectedTab?.id ? "active" : ""}`}
                  key={tab.id}
                  onClick={() => setSelectedTabId(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.title}
                </button>
              ))}
            </div>

            {selectedTab ? (
              <div className="prototype-frame-block">
                <div className="prototype-url-row">
                  <span title={selectedTab.url}>{selectedTab.url}</span>
                  <Button variant="secondary" onClick={() => window.open(selectedTab.url, "_blank", "noopener,noreferrer")}>
                    새 창 열기
                  </Button>
                </div>
                {selectedTab.summary ? <p className="prototype-summary">{selectedTab.summary}</p> : null}
                <div className="prototype-frame-wrap">
                  {showFrameWarning && !frameLoaded ? (
                    <div className="prototype-frame-warning">
                      iframe 로딩이 지연되고 있습니다. 대상 서버가 꺼져 있거나 iframe embed가 차단됐을 수 있습니다.
                    </div>
                  ) : null}
                  <iframe
                    key={selectedTab.url}
                    onLoad={() => setFrameLoaded(true)}
                    referrerPolicy="no-referrer"
                    sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                    src={selectedTab.url}
                    title={`${selectedPrototype.title} - ${selectedTab.title}`}
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="prototype-empty-state">이 프로토타입에 등록된 URL 탭이 없습니다.</div>
        )}
      </Stack>
    </Card>
  );
}

function prototypeTabs(prototype: PlanPrototype | undefined): PrototypeTab[] {
  if (!prototype) return [];
  if (prototype.tabs?.length) return prototype.tabs;

  const stateTabs = prototype.state["tabs"];
  if (!Array.isArray(stateTabs)) return [];
  return stateTabs.filter(isPrototypeTab);
}

function isPrototypeTab(value: unknown): value is PrototypeTab {
  if (!value || typeof value !== "object") return false;
  const tab = value as Record<string, unknown>;
  return typeof tab.id === "string" && typeof tab.title === "string" && typeof tab.url === "string";
}

function targetLabel(session: PlanSession, target: PlanTarget) {
  if (target.type === "step") {
    const step = session.plan.steps.find((item) => item.id === target.id);
    return `Step: ${step?.title ?? target.id ?? "unknown"}`;
  }
  if (target.type === "decision") {
    const decision = session.plan.decisions.find((item) => item.id === target.id);
    return `Decision: ${decision?.title ?? target.id ?? "unknown"}`;
  }
  if (target.type === "phase") {
    const phase = session.plan.phases?.find((item) => item.id === target.id);
    return `Phase: ${phase?.title ?? target.id ?? "unknown"}`;
  }
  return `${target.type}${target.id ? `: ${target.id}` : ""}`;
}
