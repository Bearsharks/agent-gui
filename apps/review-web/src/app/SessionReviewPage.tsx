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

type ReviewFlowNode = FlowNode<{ label: ReactNode; target: GraphSelection }, "default">;
type ReviewFlowEdge = FlowEdge<{ edge?: GraphPlanEdge }>;
type DrawerKind = "history" | "activity" | "validation" | "prototype";

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

function getSessionId() {
  const match = window.location.pathname.match(/\/sessions\/([^/]+)/);
  return match?.[1] ?? null;
}

export function SessionReviewPage() {
  const [sessionId, setSessionId] = useState(getSessionId());
  const [session, setSession] = useState<PlanSession | null>(null);
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const [expandedNodeSelection, setExpandedNodeSelection] = useState<GraphSelection | null>(null);
  const [openDrawer, setOpenDrawer] = useState<DrawerKind | null>(null);
  const sessionIndex = useMemo(() => (session ? buildGraphIndex(session.graphPlan, session.validation.issues) : null), [session?.graphPlan, session?.validation.issues]);

  async function load(id = sessionId) {
    if (!id) return;
    const next = await fetchSession(id);
    const index = buildGraphIndex(next.graphPlan, next.validation.issues);
    setSession(next);
    const searchSelection = selectionFromSearch(next.graphPlan, index, window.location.search);
    setSelection((current) => normalizeSelection(next.graphPlan, index, current ?? searchSelection));
    setExpandedNodeSelection((current) => normalizeExpandedNodeSelection(next.graphPlan, index, current ?? searchSelection));
  }

  useEffect(() => {
    void load();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const source = new EventSource(`/events/sessions/${sessionId}`);
    source.addEventListener("session.updated", () => void load(sessionId));
    source.addEventListener("event.created", () => void load(sessionId));
    source.addEventListener("revision.created", () => void load(sessionId));
    return () => {
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

  function selectGraphNode(next: GraphSelection) {
    if (!session || !sessionIndex) return;
    const normalized = normalizeSelection(session.graphPlan, sessionIndex, next);
    setSelection(normalized);
    setExpandedNodeSelection(normalized.nodeId ? normalized : null);
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
  const normalizedExpandedNodeSelection = normalizeExpandedNodeSelection(session.graphPlan, index, expandedNodeSelection);
  const selectedTarget = selectionToTarget(normalizedSelection);
  const currentGraph = getDisplayGraph(session.graphPlan.rootGraphId, index, normalizedExpandedNodeSelection ?? normalizedSelection) ?? session.graphPlan.graphs[0];
  const rootIssueCount = session.validation.errorCount + session.validation.warningCount;

  const statusLabel = labelStatus(session.status);

  return (
    <main className="graph-review-shell">
      <header className="graph-review-header">
        <div className="plan-header-copy">
          <h1>{session.graphPlan.title}</h1>
          <p>{session.graphPlan.goal}</p>
          {session.graphPlan.summary ? <span>{session.graphPlan.summary}</span> : null}
        </div>
        <div className="graph-review-actions">
          <Badge tone={session.validation.publishReady ? "accent" : "warn"}>
            {session.validation.publishReady ? "게시 가능" : "게시 불가"}
          </Badge>
          <Badge tone={rootIssueCount > 0 ? "warn" : "neutral"}>이슈 {rootIssueCount}개</Badge>
          <Badge>리비전 {session.revision}</Badge>
          <Badge>{statusLabel}</Badge>
          <Button variant="secondary" onClick={() => setOpenDrawer((current) => (current === "history" ? null : "history"))}>
            변경이력
          </Button>
          <Button variant="secondary" onClick={() => setOpenDrawer((current) => (current === "activity" ? null : "activity"))}>
            활동
          </Button>
          <Button variant="secondary" onClick={() => setOpenDrawer((current) => (current === "validation" ? null : "validation"))}>
            검증
          </Button>
          <Button variant="secondary" onClick={() => setOpenDrawer((current) => (current === "prototype" ? null : "prototype"))}>
            프로토타입
          </Button>
          <Button onClick={() => void approveSession(session.id, session.revision)} disabled={session.status === "approved"}>
            승인
          </Button>
        </div>
      </header>

      <section className="graph-review-main graph-only">
        <GraphPane
          graph={currentGraph}
          index={index}
          selection={normalizedSelection}
          expandedNodeSelection={normalizedExpandedNodeSelection}
          onSelect={updateSelection}
          onNodeSelect={selectGraphNode}
        />
      </section>

      <FeedbackComposer session={session} index={index} selectedTarget={selectedTarget} onRefresh={() => void load()} />

      {openDrawer ? (
        <ReviewDrawer
          kind={openDrawer}
          session={session}
          index={index}
          selection={normalizedSelection}
          onSelect={updateSelection}
          onClose={() => setOpenDrawer(null)}
        />
      ) : null}
    </main>
  );
}

function buildGraphChain(graphId: string, index: GraphIndex): GraphPlanGraph[] {
  const chain: GraphPlanGraph[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = graphId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const graph = index.graphsById.get(currentId);
    if (!graph) break;
    chain.unshift(graph);
    currentId = index.parentByGraphId.get(currentId)?.graphId;
  }
  return chain;
}

function getDisplayGraph(rootGraphId: string, index: GraphIndex, selection: GraphSelection): GraphPlanGraph | undefined {
  if (selection.graphId === rootGraphId) return index.graphsById.get(rootGraphId);
  const chain = buildGraphChain(selection.graphId, index);
  return chain[0] ?? index.graphsById.get(selection.graphId);
}

function normalizeExpandedNodeSelection(
  document: PlanSession["graphPlan"],
  index: GraphIndex,
  selection: GraphSelection | null,
): GraphSelection | null {
  if (!selection?.nodeId) return null;
  const normalized = normalizeSelection(document, index, selection);
  return normalized.nodeId ? normalized : null;
}

function FeedbackComposer({
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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);

  async function send() {
    const currentMessage = inputRef.current?.value.trim() ?? message.trim();
    if (!currentMessage || isSending) return;
    setIsSending(true);
    try {
      await postFeedback(session.id, selectedTarget, currentMessage);
      setMessage("");
      if (inputRef.current) inputRef.current.value = "";
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
    <section className="feedback-bar">
      <Badge>{labelTargetType(selectedTarget.type)}</Badge>
      <textarea
        ref={inputRef}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={`${breadcrumbForTarget(selectedTarget, index)}에 피드백 남기기`}
        rows={1}
      />
      <Button variant="secondary" onClick={notify} disabled={isNotifying || session.status === "approved"}>
        에이전트 호출
      </Button>
      <Button onClick={send} disabled={isSending || !message.trim()}>
        제출
      </Button>
    </section>
  );
}

function GraphPane({
  graph,
  index,
  selection,
  expandedNodeSelection,
  onSelect,
  onNodeSelect,
}: {
  graph: GraphPlanGraph;
  index: GraphIndex;
  selection: GraphSelection;
  expandedNodeSelection: GraphSelection | null;
  onSelect: (selection: GraphSelection) => void;
  onNodeSelect: (selection: GraphSelection) => void;
}) {
  const selectedNode = expandedNodeSelection ? selectedNodeForSelection(index, expandedNodeSelection) : undefined;
  const orderedNodes = useMemo(
    () =>
      graph.layout?.order
        ? graph.layout.order.map((id) => graph.nodes.find((node) => node.id === id)).filter((node): node is GraphPlanNode => Boolean(node))
        : graph.nodes,
    [graph],
  );
  const { nodes, edges } = useGraphFlowModel(graph, orderedNodes, index, selection, expandedNodeSelection, onSelect);

  const handleNodeClick: NodeMouseHandler<ReviewFlowNode> = (_event, node) => {
    onNodeSelect(node.data.target);
  };

  return (
    <aside className="graph-pane">
      <div className="graph-canvas" aria-label={`${graph.title} graph`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.28 }}
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
        {selectedNode && expandedNodeSelection ? (
          <SelectedNodeOverlay displayGraph={graph} node={selectedNode} selection={selection} expandedNodeSelection={expandedNodeSelection} index={index} onSelect={onSelect} />
        ) : null}
      </div>
    </aside>
  );
}

function SelectedNodeOverlay({
  displayGraph,
  node,
  selection,
  expandedNodeSelection,
  index,
  onSelect,
}: {
  displayGraph: GraphPlanGraph;
  node: GraphPlanNode;
  selection: GraphSelection;
  expandedNodeSelection: GraphSelection;
  index: GraphIndex;
  onSelect: (selection: GraphSelection) => void;
}) {
  const nodeGraphId = expandedNodeSelection.graphId;
  const childGraphIds = getChildGraphIds(node);
  return (
    <aside className="selected-node-overlay" onClick={(event) => event.stopPropagation()}>
      <header className="selected-node-overlay-header">
        <div>
          <span>{labelNodeKind(node.kind)}</span>
          <strong>{node.title}</strong>
        </div>
        <Button variant="secondary" onClick={() => onSelect({ graphId: displayGraph.id })}>
          닫기
        </Button>
      </header>
      <div className="selected-node-block-grid">
        {node.blocks.map((block) => {
          const issueCount = issueCountForTarget(index, { type: "block", graphId: nodeGraphId, nodeId: node.id, blockId: block.id });
          return (
            <article
              className={`selected-node-block-card ${selection.blockId === block.id ? "selected" : ""}`}
              key={block.id}
              onClick={() => onSelect({ graphId: nodeGraphId, nodeId: node.id, blockId: block.id })}
            >
              <header>
                <span>{labelBlockType(block.type)}</span>
                <strong>{block.title ?? labelBlockType(block.type)}</strong>
              </header>
              {block.summary ? <em>{block.summary}</em> : null}
              <div className="selected-node-block-body">{renderOverlayBlockBody(block, nodeGraphId, node.id, index, onSelect)}</div>
              {issueCount > 0 ? <small>이슈 {issueCount}개</small> : null}
            </article>
          );
        })}
      </div>
      {childGraphIds.length > 0 ? <div className="selected-node-overlay-footer">{displayGraph.title}</div> : null}
    </aside>
  );
}

function renderOverlayBlockBody(
  block: GraphPlanBlock,
  graphId: string,
  nodeId: string,
  index: GraphIndex,
  onSelect: (selection: GraphSelection) => void,
) {
  if (block.type === "text") return <p>{block.body}</p>;
  if (block.type === "task_list") return <OverlayItems items={block.items.map((item) => ({ id: item.id, label: item.label, status: item.status }))} />;
  if (block.type === "checklist") {
    return <OverlayItems items={block.items.map((item) => ({ id: item.id, label: item.label, status: item.status, meta: item.required ? "필수" : "선택" }))} />;
  }
  if (block.type === "criteria") {
    return <OverlayItems items={block.criteria.map((item) => ({ id: item.id, label: item.label, status: item.status, meta: item.required ? "필수" : "선택" }))} />;
  }
  if (block.type === "review_bundle") {
    return (
      <div className="overlay-block-stack">
        <p>{block.prompt}</p>
        <OverlayItems items={block.acceptanceCriteria.map((item) => ({ id: item.id, label: item.label, status: item.status, meta: item.required ? "필수" : "선택" }))} />
      </div>
    );
  }
  if (block.type === "risk") {
    return <OverlayItems items={block.risks.map((risk) => ({ id: risk.id, label: risk.title, status: risk.severity, meta: risk.mitigation }))} />;
  }
  if (block.type === "verification") {
    return <OverlayItems items={block.checks.map((check) => ({ id: check.id, label: check.label, status: check.outcome, meta: check.mode }))} />;
  }
  if (block.type === "artifact") {
    return <OverlayItems items={block.artifacts.map((artifact) => ({ id: artifact.id, label: artifact.title, status: artifact.kind, meta: artifact.ref }))} />;
  }
  if (block.type === "graph_ref") {
    const graph = index.graphsById.get(block.graphId);
    return (
      <div className="overlay-block-stack">
        <p>{graph?.title ?? block.graphId}</p>
        <OverlayItems items={(graph?.nodes ?? []).map((node) => ({ id: node.id, label: node.title, status: node.kind, meta: `${node.blocks.length} blocks` }))} />
      </div>
    );
  }
  if (block.type === "choice_set") return <OverlayItems items={block.options.map((option) => ({ id: option.id, label: option.label, status: option.status }))} />;
  if (block.type === "prototype") {
    return (
      <div className="overlay-block-stack">
        <OverlayItems items={block.tabs.map((tab) => ({ id: tab.id, label: tab.title, meta: tab.url }))} />
        <OverlayItems
          items={block.pieces.map((piece) => ({ id: piece.id, label: piece.title, status: piece.kind, meta: piece.summary }))}
          onItemClick={(pieceId) => onSelect({ graphId, nodeId, blockId: block.id, prototypeId: block.prototypeId, pieceId })}
        />
      </div>
    );
  }
  if (block.type === "changelog") return <OverlayItems items={block.entries.map((entry) => ({ id: entry.id, label: entry.summary, status: `${block.fromRevision}->${block.toRevision}` }))} />;
  return <pre>{JSON.stringify(block, null, 2)}</pre>;
}

function OverlayItems({
  items,
  onItemClick,
}: {
  items: { id: string; label: string; status?: string; meta?: string }[];
  onItemClick?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="overlay-item-list">
      {items.map((item) => (
        <button
          className="overlay-item-row"
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
          {item.meta ? <em>{item.meta}</em> : null}
          {item.status ? <small>{labelStatus(item.status)}</small> : null}
        </button>
      ))}
    </div>
  );
}

function useGraphFlowModel(
  graph: GraphPlanGraph,
  orderedNodes: GraphPlanNode[],
  index: GraphIndex,
  selection: GraphSelection,
  expandedNodeSelection: GraphSelection | null,
  onSelect: (selection: GraphSelection) => void,
) {
  const expansionSelection = expandedNodeSelection ?? selection;
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(() => new Map());
  const layoutKey = useMemo(
    () =>
      JSON.stringify({
        graphId: graph.id,
        selectedNodeId: expansionSelection.nodeId,
        selectedGraphId: expansionSelection.graphId,
        nodes: orderedNodes.map((node) => node.id),
        edges: graph.edges.map((edge) => [edge.id, edge.from, edge.to]),
        childGraphs: visibleNestedGraphIds(graph, expansionSelection, index),
      }),
    [expansionSelection, graph, graph.edges, index, orderedNodes],
  );

  useEffect(() => {
    let cancelled = false;
    const baseNodes = buildFallbackFlowNodes(graph, orderedNodes, index, selection, expansionSelection, onSelect);
    const flowEdges = buildFlowEdges(graph, selection, expansionSelection, index);

    const elkGraph: ElkNode = {
      id: graph.id,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "28",
        "elk.layered.spacing.nodeNodeBetweenLayers": "46",
      },
      children: baseNodes.map((node) => ({
        id: node.id,
        width: Number(node.width ?? 190),
        height: Number(node.height ?? 142),
      })),
      edges: flowEdges
        .filter((edge) => baseNodes.some((node) => node.id === edge.source) && baseNodes.some((node) => node.id === edge.target))
        .map((edge) => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target],
        })),
    };

    void elk.layout(elkGraph).then((layouted) => {
      if (cancelled) return;
      setPositions(new Map((layouted.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }])));
    });

    return () => {
      cancelled = true;
    };
  }, [expansionSelection, graph.id, index, layoutKey, onSelect, orderedNodes, selection]);

  const nodes = useMemo(
    () =>
      buildFallbackFlowNodes(graph, orderedNodes, index, selection, expansionSelection, onSelect).map((node) => {
        const layoutPosition = positions.get(node.id);
        return {
          ...node,
          position: layoutPosition ? positionForFlowNode(node.id, layoutPosition, graph.id, index) : node.position,
        };
      }),
    [expansionSelection, graph, index, onSelect, orderedNodes, positions, selection],
  );
  const edges = useMemo(() => buildFlowEdges(graph, selection, expansionSelection, index), [expansionSelection, graph, index, selection]);

  return { nodes, edges };
}

function buildFallbackFlowNodes(
  graph: GraphPlanGraph,
  orderedNodes: GraphPlanNode[],
  index: GraphIndex,
  selection: GraphSelection,
  expansionSelection: GraphSelection,
  onSelect: (selection: GraphSelection) => void,
): ReviewFlowNode[] {
  const baseNodes: ReviewFlowNode[] = orderedNodes.map((node, nodeIndex): ReviewFlowNode => {
    const childGraphIds = getChildGraphIds(node);
    const issueCount = issueCountForTarget(index, { type: "node", graphId: graph.id, nodeId: node.id });
    const selected = selection.graphId === graph.id && selection.nodeId === node.id;
    return {
      id: node.id,
      type: "default",
      position: { x: nodeIndex * 230, y: 120 + (nodeIndex % 2) * 28 },
      width: 150,
      height: 96,
      className: `review-flow-node ${selected ? "selected" : ""} ${childGraphIds.length > 0 ? "drillable" : ""}`,
      data: {
        target: { graphId: graph.id, nodeId: node.id },
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
  const childNodes =
    visibleNestedGraphIds(graph, expansionSelection, index).flatMap((childGraphId) => {
      const childGraph = index.graphsById.get(childGraphId);
      if (!childGraph) return [];
      const depth = nestedGraphDepth(graph.id, childGraph.id, index);
      return childGraph.nodes.map((node, nodeIndex): ReviewFlowNode => {
        const selected = selection.graphId === childGraph.id && selection.nodeId === node.id;
        return {
          id: childFlowNodeId(childGraph.id, node.id),
          type: "default",
          position: { x: 320 + nodeIndex * 190, y: 260 },
          width: 150,
          height: 96,
          className: `review-flow-node child-graph-node depth-${depth} ${selected ? "selected" : ""}`,
          data: {
            target: { graphId: childGraph.id, nodeId: node.id },
            label: (
              <div className="review-flow-node-body">
                <span className="node-kind">{childGraph.title}</span>
                <strong>{node.title}</strong>
                <span className="node-meta">
                  <span>블록 {node.blocks.length}개</span>
                </span>
              </div>
            ),
          },
        };
      });
    });
  return [...baseNodes, ...childNodes];
}

function buildFlowEdges(graph: GraphPlanGraph, selection: GraphSelection, expansionSelection: GraphSelection, index: GraphIndex): ReviewFlowEdge[] {
  const graphEdges = graph.edges.map((edge) => ({
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
  const childEdges =
    visibleNestedGraphIds(graph, expansionSelection, index).flatMap((childGraphId) => {
      const childGraph = index.graphsById.get(childGraphId);
      if (!childGraph) return [];
      const owner = index.parentByGraphId.get(childGraph.id);
      const ownerNodeId = owner?.nodeId;
      const refEdges: ReviewFlowEdge[] = ownerNodeId
        ? childGraph.nodes.slice(0, 1).map((node) => ({
            id: `child-ref:${ownerNodeId}:${childGraph.id}:${node.id}`,
            source: flowNodeIdForGraphNode(graph.id, owner?.graphId ?? graph.id, ownerNodeId),
            target: childFlowNodeId(childGraph.id, node.id),
        label: "자식",
            type: "smoothstep",
            animated: false,
            className: "review-flow-edge child-graph-edge",
            markerEnd: { type: MarkerType.ArrowClosed },
            data: {},
          }))
        : [];
      const internalEdges: ReviewFlowEdge[] = childGraph.edges.map((edge) => ({
        id: `child-edge:${childGraph.id}:${edge.id}`,
        source: childFlowNodeId(childGraph.id, edge.from),
        target: childFlowNodeId(childGraph.id, edge.to),
        label: conditionLabel(edge),
        type: "smoothstep",
        animated: edge.kind === "conditional",
        className: "review-flow-edge child-graph-edge",
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { edge },
      }));
      return [...refEdges, ...internalEdges];
    });
  return [...graphEdges, ...childEdges];
}

function childFlowNodeId(graphId: string, nodeId: string): string {
  return `${graphId}::${nodeId}`;
}

function positionForFlowNode(
  flowNodeId: string,
  layoutPosition: { x: number; y: number },
  displayGraphId: string,
  index: GraphIndex,
): { x: number; y: number } {
  const parsed = parseChildFlowNodeId(flowNodeId);
  if (!parsed) return { x: layoutPosition.x + 48, y: layoutPosition.y + 72 };
  const depth = nestedGraphDepth(displayGraphId, parsed.graphId, index);
  return {
    x: layoutPosition.x + 48,
    y: layoutPosition.y + 72 + depth * 150,
  };
}

function parseChildFlowNodeId(flowNodeId: string): { graphId: string; nodeId: string } | null {
  const [graphId, nodeId] = flowNodeId.split("::");
  if (!graphId || !nodeId) return null;
  return { graphId, nodeId };
}

function flowNodeIdForGraphNode(displayGraphId: string, graphId: string, nodeId: string): string {
  return graphId === displayGraphId ? nodeId : childFlowNodeId(graphId, nodeId);
}

function nestedGraphDepth(displayGraphId: string, graphId: string, index: GraphIndex): number {
  let depth = 0;
  let currentId: string | undefined = graphId;
  const visited = new Set<string>();
  while (currentId && currentId !== displayGraphId && !visited.has(currentId)) {
    visited.add(currentId);
    depth += 1;
    currentId = index.parentByGraphId.get(currentId)?.graphId;
  }
  return depth;
}

function visibleNestedGraphIds(displayGraph: GraphPlanGraph, selection: GraphSelection, index: GraphIndex): string[] {
  const graphIds = new Set<string>();
  const chain = buildGraphChain(selection.graphId, index);
  chain.forEach((graph) => {
    if (graph.id !== displayGraph.id) graphIds.add(graph.id);
  });
  const selectedNode = selectedNodeForSelection(index, selection);
  if (selectedNode) {
    getChildGraphIds(selectedNode).forEach((graphId) => graphIds.add(graphId));
  }
  return Array.from(graphIds);
}

function selectedNodeForSelection(index: GraphIndex, selection: GraphSelection): GraphPlanNode | undefined {
  return selection.nodeId ? index.nodesByKey.get(nodeKey(selection.graphId, selection.nodeId)) : undefined;
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

function ReviewDrawer({
  kind,
  session,
  index,
  selection,
  onSelect,
  onClose,
}: {
  kind: DrawerKind;
  session: PlanSession;
  index: GraphIndex;
  selection: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
  onClose: () => void;
}) {
  const titleByKind: Record<DrawerKind, string> = {
    history: "변경이력",
    activity: "활동",
    validation: "검증",
    prototype: "프로토타입",
  };

  return (
    <aside className="review-drawer" aria-label={titleByKind[kind]}>
      <div className="review-drawer-header">
        <h2>{titleByKind[kind]}</h2>
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      </div>
      <div className="review-drawer-body">
        {kind === "history" ? <RevisionSummary events={session.events} index={index} /> : null}
        {kind === "activity" ? <EventTimeline session={session} index={index} onSelect={onSelect} /> : null}
        {kind === "validation" ? <ValidationPanel session={session} index={index} onSelect={onSelect} /> : null}
        {kind === "prototype" ? <PrototypePiecePanel index={index} selection={selection} /> : null}
        {kind === "prototype" && !getSelectedPrototypeBlock(index, selection) ? <p className="muted drawer-empty">선택된 프로토타입 블록이 없습니다.</p> : null}
      </div>
    </aside>
  );
}

function getSelectedPrototypeBlock(index: GraphIndex, selection: GraphSelection): GraphPlanBlock | undefined {
  const block = selection.nodeId && selection.blockId ? index.blocksByKey.get(blockKey(selection.graphId, selection.nodeId, selection.blockId)) : undefined;
  return block?.type === "prototype" ? block : undefined;
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
