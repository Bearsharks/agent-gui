import type {
  GraphPlanBlock,
  GraphPlanEdge,
  GraphPlanGraph,
  GraphPlanNode,
  GraphPlanTarget,
  GraphPlanValidationIssue,
  PlanEvent,
  PlanSession,
} from "@agent-gui/plan-schema";
import { Badge, Button } from "@agent-gui/design-system";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler,
} from "@xyflow/react";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { approveSession, createFixtureSession, fetchSession, notifyAgent, postFeedback } from "../api/client";
import {
  blockKey,
  breadcrumbForTarget,
  buildGraphIndex,
  conditionLabel,
  edgeKey,
  getChildGraphIds,
  nodeKey,
  normalizeSelection,
  pointerToSelection,
  selectionFromSearch,
  selectionToSearch,
  selectionToTarget,
  targetKey,
  targetToSelection,
  type GraphIndex,
  type GraphSelection,
} from "./graphReviewModel";

type ReviewFlowNode = FlowNode<{ label: ReactNode }, "default">;
type ReviewFlowEdge = FlowEdge<{ edge: GraphPlanEdge }>;

const elk = new ELK();

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  needs_agent: "에이전트 필요",
  agent_replied: "에이전트 답변",
  revision_ready: "수정안 준비",
  approved: "승인됨",
  rejected: "반려됨",
  open: "열림",
  needs_revision: "수정 필요",
  accepted: "수락됨",
  blocked: "차단됨",
  complete: "완료",
  failed: "실패",
  passed: "통과",
  pending: "대기",
  waived: "면제",
  selected: "선택됨",
  required: "필수",
  optional: "선택",
  manual: "수동",
  automated: "자동",
  high: "높음",
  medium: "중간",
  low: "낮음",
  owner: "소유",
  owned: "소유",
  reference: "참조",
  inline: "인라인",
  prototype_state_flow: "프로토타입 상태 흐름",
  panel: "패널",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  plan: "계획",
  graph: "그래프",
  node: "노드",
  block: "블록",
  block_item: "블록 항목",
  edge: "연결",
  prototype_piece: "프로토타입 조각",
  artifact_range: "산출물 범위",
};

const BLOCK_TYPE_LABELS: Record<string, string> = {
  text: "텍스트",
  task_list: "작업 목록",
  checklist: "체크리스트",
  criteria: "기준",
  review_bundle: "리뷰 묶음",
  risk: "위험",
  verification: "검증",
  artifact: "산출물",
  graph_ref: "하위 그래프",
  choice_set: "선택지",
  prototype: "프로토타입",
  changelog: "변경 기록",
};

const NODE_KIND_LABELS: Record<string, string> = {
  section: "섹션",
  action: "작업",
  decision: "결정",
  checkpoint: "체크포인트",
  review: "리뷰",
  artifact: "산출물",
  note: "노트",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  "user.feedback": "사용자 피드백",
  "agent.reply": "에이전트 답변",
  "agent.revision": "에이전트 수정",
  "user.approval": "사용자 승인",
};

function labelStatus(value: string | undefined): string {
  if (!value) return "";
  return STATUS_LABELS[value] ?? value;
}

function labelBlockType(value: string): string {
  return BLOCK_TYPE_LABELS[value] ?? value;
}

function labelNodeKind(value: string): string {
  return NODE_KIND_LABELS[value] ?? value;
}

function labelTargetType(value: string): string {
  return TARGET_TYPE_LABELS[value] ?? value;
}

function labelEventType(value: string): string {
  return EVENT_TYPE_LABELS[value] ?? value;
}

function labelRelationship(value: string): string {
  return STATUS_LABELS[value] ?? value;
}

function getSessionId() {
  const match = window.location.pathname.match(/\/sessions\/([^/]+)/);
  return match?.[1] ?? null;
}

export function SessionReviewPage() {
  const [sessionId, setSessionId] = useState(getSessionId());
  const [session, setSession] = useState<PlanSession | null>(null);
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const sessionIndex = useMemo(() => (session ? buildGraphIndex(session.graphPlan, session.validation.issues) : null), [session?.graphPlan, session?.validation.issues]);

  async function load(id = sessionId) {
    if (!id) return;
    const next = await fetchSession(id);
    const index = buildGraphIndex(next.graphPlan, next.validation.issues);
    setSession(next);
    setSelection((current) => normalizeSelection(next.graphPlan, index, current ?? selectionFromSearch(next.graphPlan, index, window.location.search)));
  }

  useEffect(() => {
    void load();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const source = new EventSource(`/events/sessions/${sessionId}`);
    const interval = window.setInterval(() => void load(sessionId), 1500);
    source.addEventListener("session.updated", () => void load(sessionId));
    source.addEventListener("event.created", () => void load(sessionId));
    source.addEventListener("revision.created", () => void load(sessionId));
    return () => {
      window.clearInterval(interval);
      source.close();
    };
  }, [sessionId]);

  async function startFixture() {
    const result = await createFixtureSession();
    window.history.pushState(null, "", `/sessions/${result.sessionId}`);
    setSessionId(result.sessionId);
  }

  function updateSelection(next: GraphSelection) {
    if (!session || !sessionIndex) return;
    const normalized = normalizeSelection(session.graphPlan, sessionIndex, next);
    setSelection(normalized);
    window.history.replaceState(null, "", `${window.location.pathname}?${selectionToSearch(normalized)}`);
  }

  if (!sessionId) {
    return (
      <main className="empty-page">
        <section className="empty-card">
          <h1>그래프 계획 리뷰</h1>
          <p>그래프 전용 리뷰 세션을 생성해 Phase 5 UI를 확인합니다.</p>
          <Button onClick={startFixture}>예제 세션 생성</Button>
        </section>
      </main>
    );
  }

  if (!session || !selection || !sessionIndex) return <main className="empty-page">세션 불러오는 중...</main>;

  const index = sessionIndex;
  const normalizedSelection = normalizeSelection(session.graphPlan, index, selection);
  const selectedTarget = selectionToTarget(normalizedSelection);
  const currentGraph = index.graphsById.get(normalizedSelection.graphId) ?? session.graphPlan.graphs[0];
  const currentNode = normalizedSelection.nodeId ? index.nodesByKey.get(nodeKey(normalizedSelection.graphId, normalizedSelection.nodeId)) : undefined;
  const rootIssueCount = session.validation.errorCount + session.validation.warningCount;

  const statusLabel = labelStatus(session.status);

  return (
    <main className="graph-review-shell">
      <header className="graph-review-header">
        <div className="graph-review-title">
          <h1>{session.graphPlan.title}</h1>
          <p>{session.graphPlan.goal}</p>
        </div>
        <div className="graph-review-actions">
          <Badge tone={session.validation.publishReady ? "accent" : "warn"}>
            {session.validation.publishReady ? "게시 가능" : "게시 불가"}
          </Badge>
          <Badge tone={rootIssueCount > 0 ? "warn" : "neutral"}>이슈 {rootIssueCount}개</Badge>
          <Badge>리비전 {session.revision}</Badge>
          <Badge>{statusLabel}</Badge>
          <Button onClick={() => void approveSession(session.id, session.revision)} disabled={session.status === "approved"}>
            승인
          </Button>
        </div>
      </header>

      <section className="graph-review-grid">
        <GraphPane
          documentRootGraphId={session.graphPlan.rootGraphId}
          graph={currentGraph}
          index={index}
          selection={normalizedSelection}
          onSelect={updateSelection}
        />
        <BlockInspector
          graph={currentGraph}
          node={currentNode}
          index={index}
          selection={normalizedSelection}
          onSelect={updateSelection}
        />
        <ReviewTools
          session={session}
          index={index}
          selectedTarget={selectedTarget}
          selection={normalizedSelection}
          onSelect={updateSelection}
          onRefresh={() => void load()}
        />
      </section>
    </main>
  );
}

function GraphPane({
  documentRootGraphId,
  graph,
  index,
  selection,
  onSelect,
}: {
  documentRootGraphId: string;
  graph: GraphPlanGraph;
  index: GraphIndex;
  selection: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
}) {
  const parentPointer = index.parentByGraphId.get(graph.id);
  const parentGraph = parentPointer?.graphId ? index.graphsById.get(parentPointer.graphId) : undefined;
  const orderedNodes = useMemo(
    () =>
      graph.layout?.order
        ? graph.layout.order.map((id) => graph.nodes.find((node) => node.id === id)).filter((node): node is GraphPlanNode => Boolean(node))
        : graph.nodes,
    [graph],
  );
  const { nodes, edges } = useGraphFlowModel(graph, orderedNodes, index, selection);

  function drillUp() {
    if (!parentPointer?.graphId) return;
    onSelect({
      graphId: parentPointer.graphId,
      nodeId: parentPointer.nodeId,
      blockId: parentPointer.blockId,
    });
  }

  const handleNodeClick: NodeMouseHandler<ReviewFlowNode> = (_event, node) => {
    onSelect({ graphId: graph.id, nodeId: node.id });
  };

  return (
    <aside className="graph-pane">
      <div className="pane-header">
        <div>
          <div className="eyebrow">그래프 범위</div>
          <h2>{graph.title}</h2>
          <p>{graph.purpose ?? "현재 그래프 범위만 표시합니다. 하위 그래프는 인라인 확장이 아니라 드릴다운으로 이 영역을 전환합니다."}</p>
        </div>
        <Button variant="secondary" onClick={drillUp} disabled={graph.id === documentRootGraphId || !parentPointer?.graphId}>
          상위 그래프
        </Button>
      </div>

      <div className="graph-canvas" aria-label={`${graph.title} graph`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.35}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={handleNodeClick}
          onEdgeClick={(_event, edge) => onSelect({ graphId: graph.id, edgeId: edge.id })}
        >
          <Background color="#d8cfc0" gap={24} />
          <MiniMap pannable zoomable nodeStrokeWidth={3} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className="scope-footer">
        {parentGraph ? (
          <span>
            상위: {parentGraph.title}
            {parentPointer?.nodeId ? ` / ${index.nodesByKey.get(nodeKey(parentPointer.graphId!, parentPointer.nodeId))?.title ?? parentPointer.nodeId}` : ""}
          </span>
        ) : (
          <span>루트 그래프입니다. 하위 그래프는 선택된 노드의 `graph_ref` 블록으로 표시됩니다.</span>
        )}
      </div>
    </aside>
  );
}

function useGraphFlowModel(graph: GraphPlanGraph, orderedNodes: GraphPlanNode[], index: GraphIndex, selection: GraphSelection) {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(() => new Map());
  const layoutKey = useMemo(
    () => JSON.stringify({ graphId: graph.id, nodes: orderedNodes.map((node) => node.id), edges: graph.edges.map((edge) => [edge.id, edge.from, edge.to]) }),
    [graph.id, graph.edges, orderedNodes],
  );

  useEffect(() => {
    let cancelled = false;
    const baseNodes = buildFallbackFlowNodes(graph, orderedNodes, index, selection);

    const elkGraph: ElkNode = {
      id: graph.id,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "48",
        "elk.layered.spacing.nodeNodeBetweenLayers": "72",
      },
      children: baseNodes.map((node) => ({
        id: node.id,
        width: Number(node.width ?? 190),
        height: Number(node.height ?? 142),
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        sources: [edge.from],
        targets: [edge.to],
      })),
    };

    void elk.layout(elkGraph).then((layouted) => {
      if (cancelled) return;
      setPositions(new Map((layouted.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }])));
    });

    return () => {
      cancelled = true;
    };
  }, [layoutKey]);

  const nodes = useMemo(
    () =>
      buildFallbackFlowNodes(graph, orderedNodes, index, selection).map((node) => ({
        ...node,
        position: positions.get(node.id) ?? node.position,
      })),
    [graph, index, orderedNodes, positions, selection],
  );
  const edges = useMemo(() => buildFlowEdges(graph, selection), [graph, selection]);

  return { nodes, edges };
}

function buildFallbackFlowNodes(
  graph: GraphPlanGraph,
  orderedNodes: GraphPlanNode[],
  index: GraphIndex,
  selection: GraphSelection,
): ReviewFlowNode[] {
  return orderedNodes.map((node, nodeIndex) => {
    const childGraphIds = getChildGraphIds(node);
    const issueCount = issueCountForTarget(index, { type: "node", graphId: graph.id, nodeId: node.id });
    return {
      id: node.id,
      type: "default",
      position: { x: nodeIndex * 230, y: 120 + (nodeIndex % 2) * 28 },
      width: 190,
      height: 142,
      className: `review-flow-node ${selection.nodeId === node.id ? "selected" : ""} ${childGraphIds.length > 0 ? "drillable" : ""}`,
      data: {
        label: (
          <div className="review-flow-node-body">
            <span className="node-kind">{labelNodeKind(node.kind)}</span>
            <strong>{node.title}</strong>
            {node.summary ? <span className="node-summary">{node.summary}</span> : null}
            <span className="node-meta">
              <span>블록 {node.blocks.length}개</span>
              {childGraphIds.length > 0 ? <span>하위 그래프</span> : null}
              {issueCount > 0 ? <span className="issue-chip">{issueCount}</span> : null}
            </span>
          </div>
        ),
      },
    };
  });
}

function buildFlowEdges(graph: GraphPlanGraph, selection: GraphSelection): ReviewFlowEdge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: conditionLabel(edge),
    type: "smoothstep",
    animated: edge.kind === "conditional" || selection.edgeId === edge.id,
    className: selection.edgeId === edge.id ? "review-flow-edge selected" : "review-flow-edge",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { edge },
  }));
}

function BlockInspector({
  graph,
  node,
  index,
  selection,
  onSelect,
}: {
  graph: GraphPlanGraph;
  node: GraphPlanNode | undefined;
  index: GraphIndex;
  selection: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
}) {
  if (!node) {
    return (
      <section className="blocks-pane">
        <div className="pane-header">
          <div className="eyebrow">선택한 노드의 블록</div>
          <h2>{graph.title}</h2>
          <p>노드를 선택하면 해당 노드의 블록 목록이 표시됩니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="blocks-pane">
      <div className="pane-header">
        <div className="eyebrow">선택한 노드의 블록</div>
        <h2>{node.title}</h2>
        <p>{node.summary ?? "하위 그래프는 인라인 캔버스가 아니라 graph_ref 블록으로 표현됩니다."}</p>
      </div>
      <div className="node-contract">
        <Badge>{labelNodeKind(node.kind)}</Badge>
        {node.status ? <Badge tone={node.status === "accepted" || node.status === "complete" ? "accent" : "neutral"}>{labelStatus(node.status)}</Badge> : null}
        {getChildGraphIds(node).map((graphId) => (
          <button className="text-button" key={graphId} onClick={() => onSelect({ graphId })}>
            {index.graphsById.get(graphId)?.title ?? graphId}로 드릴다운
          </button>
        ))}
      </div>
      <div className="block-list">
        {node.blocks.map((block) => (
          <BlockRenderer
            block={block}
            graphId={graph.id}
            nodeId={node.id}
            index={index}
            key={block.id}
            selected={selection.blockId === block.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

function BlockRenderer({
  block,
  graphId,
  nodeId,
  index,
  selected,
  onSelect,
}: {
  block: GraphPlanBlock;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selected: boolean;
  onSelect: (selection: GraphSelection) => void;
}) {
  const issueCount = issueCountForTarget(index, { type: "block", graphId, nodeId, blockId: block.id });
  return (
    <article className={`graph-block ${selected ? "selected" : ""}`} onClick={() => onSelect({ graphId, nodeId, blockId: block.id })}>
      <header className="block-header-row">
        <div>
          <strong>{block.title ?? labelBlockType(block.type)}</strong>
          {block.summary ? <p>{block.summary}</p> : null}
        </div>
        <div className="block-badges">
          {block.title ? <Badge>{labelBlockType(block.type)}</Badge> : null}
          {block.status ? <Badge>{labelStatus(block.status)}</Badge> : null}
          {issueCount > 0 ? <Badge tone="warn">이슈 {issueCount}개</Badge> : null}
        </div>
      </header>
      <div className="block-body">{renderBlockBody(block, graphId, nodeId, onSelect, index)}</div>
    </article>
  );
}

function renderBlockBody(
  block: GraphPlanBlock,
  graphId: string,
  nodeId: string,
  onSelect: (selection: GraphSelection) => void,
  index: GraphIndex,
) {
  if (block.type === "text") return <p>{block.body}</p>;
  if (block.type === "task_list") {
    return (
      <ItemList
        items={block.items.map((item) => ({ id: item.id, label: item.label, status: item.status }))}
        onItemClick={(itemId) => onSelect({ graphId, nodeId, blockId: block.id, itemId, itemType: "task" })}
      />
    );
  }
  if (block.type === "checklist") {
    return (
      <ItemList
        items={block.items.map((item) => ({ id: item.id, label: item.label, status: item.status, meta: item.required ? "required" : "optional" }))}
        onItemClick={(itemId) => onSelect({ graphId, nodeId, blockId: block.id, itemId, itemType: "check" })}
      />
    );
  }
  if (block.type === "criteria") {
    return (
      <ItemList
        items={block.criteria.map((item) => ({ id: item.id, label: item.label, status: item.status, meta: item.required ? "required" : "optional" }))}
        onItemClick={(itemId) => onSelect({ graphId, nodeId, blockId: block.id, itemId, itemType: "criterion" })}
      />
    );
  }
  if (block.type === "review_bundle") {
    return (
      <div className="review-bundle">
        <p>{block.prompt}</p>
        {block.acceptanceCriteria.length > 0 ? (
          <ItemList
            items={block.acceptanceCriteria.map((criterion) => ({
              id: criterion.id,
              label: criterion.label,
              status: criterion.status,
              meta: criterion.required ? "required" : "optional",
            }))}
            onItemClick={(itemId) => onSelect({ graphId, nodeId, blockId: block.id, itemId, itemType: "criterion" })}
          />
        ) : null}
      </div>
    );
  }
  if (block.type === "risk") {
    return (
      <table className="block-table">
        <thead>
          <tr>
            <th>위험</th>
            <th>심각도</th>
            <th>완화책</th>
          </tr>
        </thead>
        <tbody>
          {block.risks.map((risk) => (
            <tr key={risk.id}>
              <td>
                <button
                  className="inline-target-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect({ graphId, nodeId, blockId: block.id, itemId: risk.id, itemType: "risk" });
                  }}
                >
                  {risk.title}
                </button>
              </td>
              <td>{labelStatus(risk.severity)}</td>
              <td>{risk.mitigation ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (block.type === "verification") {
    return (
      <ItemList
        items={block.checks.map((check) => ({ id: check.id, label: check.label, status: check.outcome, meta: check.mode }))}
        onItemClick={(itemId) => onSelect({ graphId, nodeId, blockId: block.id, itemId, itemType: "verification" })}
      />
    );
  }
  if (block.type === "artifact") {
    return (
      <ItemList
        items={block.artifacts.map((artifact) => ({ id: artifact.id, label: artifact.title, status: artifact.kind, meta: artifact.ref }))}
        onItemClick={(itemId) => onSelect({ graphId, nodeId, blockId: block.id, itemId, itemType: "artifact" })}
      />
    );
  }
  if (block.type === "graph_ref") {
    const graph = index.graphsById.get(block.graphId);
    return (
      <div className="graph-ref-block" onClick={(event) => event.stopPropagation()}>
        <div>
          <strong>{graph?.title ?? block.graphId}</strong>
          <span>
            {labelRelationship(block.relationship)} · {labelRelationship(block.ownership)}
          </span>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            onSelect({ graphId: block.graphId });
          }}
        >
          드릴다운
        </Button>
      </div>
    );
  }
  if (block.type === "choice_set") {
    return (
      <div className="choice-list">
        <strong>{block.question}</strong>
        {block.options.map((option) => (
          <div className="choice-row" key={option.id}>
            <button
              className="inline-target-button"
              onClick={(event) => {
                event.stopPropagation();
                onSelect({ graphId, nodeId, blockId: block.id, itemId: option.id, itemType: "option" });
              }}
            >
              {option.label}
            </button>
            <Badge tone={option.status === "selected" ? "accent" : "neutral"}>{labelStatus(option.status)}</Badge>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "prototype") {
    return (
      <div className="prototype-block">
        <div className="prototype-tabs">
          {block.tabs.map((tab) => (
            <a href={tab.url} key={tab.id} target="_blank" rel="noreferrer">
              {tab.title}
            </a>
          ))}
        </div>
        <ItemList
          items={block.pieces.map((piece) => ({ id: piece.id, label: piece.title, status: piece.kind, meta: piece.summary }))}
          onItemClick={(pieceId) => onSelect({ graphId, nodeId, blockId: block.id, prototypeId: block.prototypeId, pieceId })}
        />
      </div>
    );
  }
  if (block.type === "changelog") {
    return <ItemList items={block.entries.map((entry) => ({ id: entry.id, label: entry.summary, status: `${block.fromRevision}->${block.toRevision}` }))} />;
  }
  return (
    <details>
      <summary>지원하지 않는 블록 상세</summary>
      <pre>{JSON.stringify(block, null, 2)}</pre>
    </details>
  );
}

function ItemList({
  items,
  onItemClick,
}: {
  items: { id: string; label: string; status?: string; meta?: string }[];
  onItemClick?: (id: string) => void;
}) {
  return (
    <div className="item-list">
      {items.map((item) => (
        <button
          className="item-row"
          key={item.id}
          onClick={
            onItemClick
              ? (event) => {
                  event.stopPropagation();
                  onItemClick(item.id);
                }
              : undefined
          }
        >
          <span>{item.label}</span>
          <span className="item-meta">
            {item.meta ? <em>{labelStatus(item.meta)}</em> : null}
            {item.status ? <Badge>{labelStatus(item.status)}</Badge> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

function ReviewTools({
  session,
  index,
  selectedTarget,
  selection,
  onSelect,
  onRefresh,
}: {
  session: PlanSession;
  index: GraphIndex;
  selectedTarget: GraphPlanTarget;
  selection: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
  onRefresh: () => void;
}) {
  return (
    <aside className="review-pane">
      <FeedbackPanel session={session} index={index} selectedTarget={selectedTarget} onRefresh={onRefresh} />
      <ValidationPanel session={session} index={index} onSelect={onSelect} />
      <PrototypePiecePanel index={index} selection={selection} />
      <EventTimeline session={session} index={index} onSelect={onSelect} />
      <RevisionSummary events={session.events} index={index} />
    </aside>
  );
}

function FeedbackPanel({
  session,
  index,
  selectedTarget,
  onRefresh,
}: {
  session: PlanSession;
  index: GraphIndex;
  selectedTarget: GraphPlanTarget;
  onRefresh: () => void;
}) {
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);
  const activeKey = targetKey(selectedTarget);
  const threadEvents = session.events.filter((event) => hasEventTarget(event) && targetKey(event.target) === activeKey);

  async function send() {
    const currentMessage = messageRef.current?.value.trim() ?? message.trim();
    if (!currentMessage || isSending) return;
    setIsSending(true);
    try {
      await postFeedback(session.id, selectedTarget, currentMessage);
      setMessage("");
      if (messageRef.current) messageRef.current.value = "";
      onRefresh();
    } finally {
      setIsSending(false);
    }
  }

  async function notify() {
    if (isNotifying) return;
    setIsNotifying(true);
    try {
      await notifyAgent(session.id);
      onRefresh();
    } finally {
      setIsNotifying(false);
    }
  }

  return (
    <section className="tool-card">
      <div className="tool-card-header">
        <h3>선택한 대상</h3>
        <Badge>{labelTargetType(selectedTarget.type)}</Badge>
      </div>
      <p className="target-breadcrumb">{breadcrumbForTarget(selectedTarget, index)}</p>
      <textarea ref={messageRef} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="현재 그래프 대상에 대한 피드백을 입력하세요." />
      <div className="tool-actions">
        <Button variant="secondary" onClick={notify} disabled={isNotifying || session.status === "approved"}>
          에이전트 호출
        </Button>
        <Button onClick={send} disabled={isSending || !message.trim()}>
          피드백 제출
        </Button>
      </div>
      <div className="thread-list">
        {threadEvents.length === 0 ? <p className="muted">이 대상에는 아직 대화가 없습니다.</p> : null}
        {threadEvents.map((event) => (
          <EventSnippet event={event} key={event.id} />
        ))}
      </div>
    </section>
  );
}

function ValidationPanel({
  session,
  index,
  onSelect,
}: {
  session: PlanSession;
  index: GraphIndex;
  onSelect: (selection: GraphSelection) => void;
}) {
  return (
    <section className="tool-card">
      <div className="tool-card-header">
        <h3>검증</h3>
        <Badge tone={session.validation.errorCount > 0 ? "warn" : "neutral"}>
          오류 {session.validation.errorCount}개 · 경고 {session.validation.warningCount}개
        </Badge>
      </div>
      <div className="issue-list">
        {session.validation.issues.length === 0 ? <p className="muted">검증 이슈가 없습니다.</p> : null}
        {session.validation.issues.map((issue) => (
          <button className="issue-row" key={`${issue.code}:${issue.path}`} onClick={() => selectIssue(issue, session, onSelect)}>
            <strong>{issue.code}</strong>
            <span>{issue.message}</span>
            <em>{issue.target ? breadcrumbForTarget(issue.target, index) : issue.path}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function PrototypePiecePanel({ index, selection }: { index: GraphIndex; selection: GraphSelection }) {
  const block = selection.nodeId && selection.blockId ? index.blocksByKey.get(blockKey(selection.graphId, selection.nodeId, selection.blockId)) : undefined;
  if (!block || block.type !== "prototype") return null;
  const selectedPiece = block.pieces.find((piece) => piece.id === selection.pieceId);
  return (
    <section className="tool-card">
      <div className="tool-card-header">
        <h3>프로토타입 조각</h3>
        <Badge>{block.pieces.length}</Badge>
      </div>
      <ItemList items={block.pieces.map((piece) => ({ id: piece.id, label: piece.title, status: piece.kind, meta: piece.summary }))} />
      {selectedPiece ? (
        <div className="prototype-piece-detail">
          <strong>{selectedPiece.title}</strong>
          <span>주 대상: {breadcrumbForTarget(selectedPiece.primaryTarget, index)}</span>
          {selectedPiece.validates.length > 0 ? (
            <ul>
              {selectedPiece.validates.map((target) => (
                <li key={targetKey(target)}>{breadcrumbForTarget(target, index)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EventTimeline({
  session,
  index,
  onSelect,
}: {
  session: PlanSession;
  index: GraphIndex;
  onSelect: (selection: GraphSelection) => void;
}) {
  return (
    <section className="tool-card">
      <div className="tool-card-header">
        <h3>타임라인</h3>
        <Badge>{session.events.length}</Badge>
      </div>
      <div className="timeline-list">
        {session.events.map((event) => (
          <button className="timeline-row" key={event.id} onClick={() => hasEventTarget(event) && onSelect(targetToSelection(event.target, session.graphPlan.rootGraphId))}>
            <EventSnippet event={event} index={index} />
          </button>
        ))}
      </div>
    </section>
  );
}

function EventSnippet({ event, index }: { event: PlanEvent; index?: GraphIndex }) {
  const detail =
    event.type === "user.feedback"
      ? event.message
      : event.type === "agent.reply"
        ? event.body
        : event.type === "agent.revision"
          ? [...event.changeSummary.structure, ...event.changeSummary.content, ...event.changeSummary.validation].join(", ")
          : event.message ?? "승인됨";
  return (
    <>
      <strong>{labelEventType(event.type)}</strong>
      {hasEventTarget(event) && index ? <span>{breadcrumbForTarget(event.target, index)}</span> : null}
      <p>{detail || "상세 내용 없음"}</p>
    </>
  );
}

function RevisionSummary({ events, index }: { events: PlanEvent[]; index: GraphIndex }) {
  const revisions = events.filter((event) => event.type === "agent.revision");
  if (revisions.length === 0) return null;
  return (
    <section className="tool-card">
      <div className="tool-card-header">
        <h3>리비전 요약</h3>
        <Badge>{revisions.length}</Badge>
      </div>
      {revisions.map((event) => (
        <div className="revision-row" key={event.id}>
          <strong>
            r{event.fromRevision} → r{event.toRevision}
          </strong>
          {event.target ? <span>{breadcrumbForTarget(event.target, index)}</span> : null}
          <ChangeGroup label="구조" items={event.changeSummary.structure} />
          <ChangeGroup label="내용" items={event.changeSummary.content} />
          <ChangeGroup label="검증" items={event.changeSummary.validation} />
        </div>
      ))}
    </section>
  );
}

function ChangeGroup({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="change-group">
      <em>{label}</em>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function selectIssue(issue: GraphPlanValidationIssue, session: PlanSession, onSelect: (selection: GraphSelection) => void) {
  if (issue.target) {
    onSelect(targetToSelection(issue.target, session.graphPlan.rootGraphId));
    return;
  }
  if (issue.pointer) {
    onSelect(pointerToSelection(issue.pointer, session.graphPlan.rootGraphId));
  }
}

function hasEventTarget(event: PlanEvent): event is Extract<PlanEvent, { target: GraphPlanTarget }> {
  return "target" in event && event.target !== undefined;
}

function issueCountForTarget(index: GraphIndex, target: GraphPlanTarget): number {
  const exact = index.issuesByTargetKey.get(targetKey(target))?.length ?? 0;
  if (target.type !== "node") return exact;
  const node = index.nodesByKey.get(nodeKey(target.graphId, target.nodeId));
  if (!node) return exact;
  return (
    exact +
    node.blocks.reduce((sum, block) => {
      return sum + (index.issuesByTargetKey.get(blockKey(target.graphId, target.nodeId, block.id))?.length ?? 0);
    }, 0)
  );
}
