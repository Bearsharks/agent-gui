import type { GraphPlanBlock, GraphPlanPointer, GraphPlanTarget } from "@agent-gui/plan-schema";
import { useState } from "react";
import { breadcrumbForTarget, type GraphIndex, type GraphSelection } from "./graphReviewModel";
import { labelNodeKind, labelStatus } from "./graphReviewLabels";

type PrototypeBlock = Extract<GraphPlanBlock, { type: "prototype" }>;
type GraphRefBlock = Extract<GraphPlanBlock, { type: "graph_ref" }>;

export function PrototypeGraphBlockContent({
  block,
  graphId,
  nodeId,
  index,
  selection,
  onTargetSelect,
}: {
  block: PrototypeBlock | GraphRefBlock;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selection: GraphSelection;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  if (block.type === "prototype") {
    return <PrototypeContent block={block} graphId={graphId} nodeId={nodeId} index={index} selection={selection} onTargetSelect={onTargetSelect} />;
  }
  return <GraphRefContent block={block} index={index} onTargetSelect={onTargetSelect} />;
}

function PrototypeContent({
  block,
  graphId,
  nodeId,
  index,
  selection,
  onTargetSelect,
}: {
  block: PrototypeBlock;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selection: GraphSelection;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const [localTabId, setLocalTabId] = useState(block.tabs[0]?.id);
  const selectedTabId = selection.blockId === block.id && selection.prototypeId === block.prototypeId ? selection.tabId ?? localTabId : localTabId;
  const selectedTab = block.tabs.find((tab) => tab.id === selectedTabId) ?? block.tabs[0];
  const relatedTargets = selectedTab?.relatedTargets ?? [];
  return (
    <div className="prototype-block-content">
      <section className="prototype-meta-strip">
        <span>{block.prototypeId}</span>
        {block.revision ? <span>r{block.revision}</span> : null}
        <span>탭 {block.tabs.length}개</span>
        <span>연결 {block.tabs.reduce((sum, tab) => sum + (tab.relatedTargets?.length ?? 0), 0)}개</span>
        {block.contentHash ? <span>해시 있음</span> : null}
      </section>
      <section className="prototype-frame-panel">
        <div className="prototype-tab-list" role="tablist" aria-label="Prototype tabs">
          {block.tabs.map((tab) => (
            <button
              className={tab.id === selectedTab?.id ? "selected" : ""}
              key={tab.id}
              onClick={() => {
                setLocalTabId(tab.id);
                onTargetSelect({ type: "prototype_tab", graphId, nodeId, blockId: block.id, prototypeId: block.prototypeId, tabId: tab.id });
              }}
              type="button"
            >
              {tab.title}
            </button>
          ))}
        </div>
        {selectedTab ? (
          <>
            <iframe className="prototype-frame" src={selectedTab.url} title={selectedTab.title} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
            <div className="prototype-tab-meta">
              <span>{selectedTab.summary ?? selectedTab.title}</span>
              <a href={selectedTab.url} target="_blank" rel="noreferrer">
                새 창 열기
              </a>
            </div>
          </>
        ) : (
          <p className="block-empty-state">프로토타입 탭 없음</p>
        )}
      </section>
      <section className="prototype-relation-section">
        <strong>현재 탭 연결과 영향</strong>
        {selectedTab?.context ? <PointerButton label="맥락" pointer={selectedTab.context} index={index} onTargetSelect={onTargetSelect} /> : null}
        {relatedTargets.length > 0 ? (
          <div className="prototype-relation-list">
            {relatedTargets.map((relation, relationIndex) => (
              <TargetLink
                key={`${relation.purpose}:${relationIndex}:${JSON.stringify(relation.target)}`}
                label={linkPurposeLabel(relation.purpose)}
                note={relation.note}
                target={relation.target}
                index={index}
                onTargetSelect={onTargetSelect}
              />
            ))}
          </div>
        ) : (
          <p className="block-empty-state">현재 탭에 연결 대상 없음</p>
        )}
      </section>
    </div>
  );
}

function GraphRefContent({ block, index, onTargetSelect }: { block: GraphRefBlock; index: GraphIndex; onTargetSelect: (target: GraphPlanTarget) => void }) {
  const graph = index.graphsById.get(block.graphId);
  return (
    <div className="graph-ref-block-content">
      <section className="graph-ref-summary">
        <div>
          <span>{relationshipLabel(block.relationship)}</span>
          <strong>{graph?.title ?? block.graphId}</strong>
          <em>{labelStatus(block.ownership)}</em>
        </div>
        <button onClick={() => onTargetSelect({ type: "graph", graphId: block.graphId })} type="button">
          그래프 보기
        </button>
      </section>
      {graph ? (
        <section className="graph-ref-overview">
          <span>노드 {graph.nodes.length}개</span>
          <span>연결 {graph.edges.length}개</span>
          <div className="graph-ref-node-list">
            {graph.nodes.map((node) => (
              <button key={node.id} onClick={() => onTargetSelect({ type: "node", graphId: graph.id, nodeId: node.id })} type="button">
                <span>{labelNodeKind(node.kind)}</span>
                <strong>{node.title}</strong>
                <em>블록 {node.blocks.length}개</em>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className="block-empty-state">참조 그래프를 찾을 수 없음</p>
      )}
      <BindingSection title="입력 계약" bindings={block.inputBindings ?? []} index={index} onTargetSelect={onTargetSelect} />
      <BindingSection title="출력 계약" bindings={block.outputBindings ?? []} index={index} onTargetSelect={onTargetSelect} />
    </div>
  );
}

function BindingSection({
  title,
  bindings,
  index,
  onTargetSelect,
}: {
  title: string;
  bindings: NonNullable<GraphRefBlock["inputBindings"]>;
  index: GraphIndex;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  if (bindings.length === 0) return null;
  return (
    <section className="graph-binding-section">
      <strong>{title}</strong>
      <div className="graph-binding-list">
        {bindings.map((binding) => (
          <div className="graph-binding-row" key={binding.key}>
            <strong>{binding.key}</strong>
            {binding.source ? <PointerButton label="source" pointer={binding.source} index={index} onTargetSelect={onTargetSelect} /> : null}
            {binding.target ? <TargetLink label="target" target={binding.target} index={index} onTargetSelect={onTargetSelect} /> : null}
            {binding.targetPointer ? <PointerButton label="target pointer" pointer={binding.targetPointer} index={index} onTargetSelect={onTargetSelect} /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function TargetLink({
  label,
  note,
  target,
  index,
  onTargetSelect,
}: {
  label: string;
  note?: string;
  target: GraphPlanTarget;
  index: GraphIndex;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  return (
    <button className="prototype-target-link" onClick={() => onTargetSelect(target)} type="button">
      <span>{label}</span>
      <em>{breadcrumbForTarget(target, index)}</em>
      {note ? <small>{note}</small> : null}
    </button>
  );
}

function PointerButton({ label, pointer, index, onTargetSelect }: { label: string; pointer: GraphPlanPointer; index: GraphIndex; onTargetSelect: (target: GraphPlanTarget) => void }) {
  const target = targetForPointer(pointer);
  if (!target) {
    return (
      <span className="graph-pointer-text">
        {label}: {pointerPath(pointer)}
      </span>
    );
  }
  return <TargetLink label={label} target={target} index={index} onTargetSelect={onTargetSelect} />;
}

function targetForPointer(pointer: GraphPlanPointer): GraphPlanTarget | null {
  if (pointer.graphId && pointer.nodeId && pointer.blockId && pointer.itemId) {
    return { type: "block_item", graphId: pointer.graphId, nodeId: pointer.nodeId, blockId: pointer.blockId, itemId: pointer.itemId };
  }
  if (pointer.graphId && pointer.nodeId && pointer.blockId) return { type: "block", graphId: pointer.graphId, nodeId: pointer.nodeId, blockId: pointer.blockId };
  if (pointer.graphId && pointer.nodeId) return { type: "node", graphId: pointer.graphId, nodeId: pointer.nodeId };
  if (pointer.graphId) return { type: "graph", graphId: pointer.graphId };
  return null;
}

function pointerLabel(pointer: GraphPlanPointer, index: GraphIndex): string {
  const target = targetForPointer(pointer);
  if (target) return breadcrumbForTarget(target, index);
  return pointerPath(pointer);
}

function pointerPath(pointer: GraphPlanPointer): string {
  return [pointer.graphId, pointer.nodeId, pointer.blockId, pointer.itemId, pointer.outputKey].filter(Boolean).join(" / ");
}

function relationshipLabel(relationship: string): string {
  const labels: Record<string, string> = {
    decomposes_node: "노드 분해",
    phase_detail: "단계 상세",
    option_detail: "선택지 상세",
    prototype_state_flow: "프로토타입 상태 흐름",
    revision_work: "수정 작업",
    evidence_branch: "근거 분기",
    experiment_procedure: "실험 절차",
    cutover_detail: "전환 상세",
    rollback_drill: "롤백 리허설",
    debug_detail: "디버그 상세",
    related_context: "관련 맥락",
  };
  return labels[relationship] ?? relationship;
}

function linkPurposeLabel(purpose: string): string {
  const labels: Record<string, string> = {
    explains: "설명",
    validates: "검증",
    alternative: "대안",
    final_candidate: "최종 후보",
    depends_on: "의존",
    mitigates: "완화",
    produces: "생성",
    tests_interaction: "상호작용 테스트",
    shows_state: "상태 표시",
    implements_option: "선택지 구현",
  };
  return labels[purpose] ?? purpose;
}
