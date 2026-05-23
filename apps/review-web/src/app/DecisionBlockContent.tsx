import type { GraphPlanBlock, GraphPlanPointer, GraphPlanTarget } from "@agent-gui/plan-schema";
import { breadcrumbForTarget, pointerToSelection, type GraphIndex, type GraphSelection } from "./graphReviewModel";
import { labelStatus } from "./graphReviewLabels";

type DecisionBlock = Extract<GraphPlanBlock, { type: "review_bundle" | "choice_set" | "comparison" | "evidence" | "synthesis" }>;
type EvidenceRef = Extract<GraphPlanBlock, { type: "synthesis" }>["entries"][number]["evidenceRefs"][number];

export function DecisionBlockContent({
  block,
  graphId,
  nodeId,
  index,
  selectedItemId,
  onSelect,
  onTargetSelect,
}: {
  block: DecisionBlock;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selectedItemId?: string;
  onSelect: (selection: GraphSelection) => void;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  if (block.type === "review_bundle") return <ReviewBundleContent block={block} graphId={graphId} nodeId={nodeId} index={index} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  if (block.type === "choice_set") return <ChoiceSetContent block={block} graphId={graphId} nodeId={nodeId} index={index} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  if (block.type === "comparison") return <ComparisonContent block={block} graphId={graphId} nodeId={nodeId} index={index} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  if (block.type === "evidence") return <EvidenceContent block={block} graphId={graphId} nodeId={nodeId} selectedItemId={selectedItemId} onSelect={onSelect} onTargetSelect={onTargetSelect} />;
  return <SynthesisContent block={block} graphId={graphId} nodeId={nodeId} index={index} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
}

function ReviewBundleContent({
  block,
  graphId,
  nodeId,
  index,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "review_bundle" }>;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  return (
    <div className="decision-block-content">
      <DecisionCallout label="리뷰 질문" value={block.prompt} />
      <TargetList title="연결 대상" targets={block.linkedTargets} index={index} onTargetSelect={onTargetSelect} />
      <ReviewTraceSection trace={block.reviewTrace} index={index} onTargetSelect={onTargetSelect} />
      {block.prototypeRef ? (
        <section className="decision-section">
          <strong>프로토타입 참조</strong>
          <button className="decision-link-row" disabled={!block.prototypeRef.target} onClick={() => block.prototypeRef?.target && onTargetSelect(block.prototypeRef.target)}>
            <span>{block.prototypeRef.prototypeId}</span>
            <em>{block.prototypeRef.target ? breadcrumbForTarget(block.prototypeRef.target, index) : block.prototypeRef.blockId ?? "대상 없음"}</em>
          </button>
        </section>
      ) : null}
      <section className="decision-section">
        <strong>승인 기준</strong>
        <div className="decision-row-list">
          {block.acceptanceCriteria.map((criterion) => (
            <button
              className={`decision-row ${statusToneClass(criterion.status)} ${selectedItemId === criterion.id ? "selected" : ""}`}
              key={criterion.id}
              onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: criterion.id, itemType: "criterion" })}
            >
              <span className={`criteria-indicator ${criterion.status}`} aria-hidden="true">
                {criterion.status === "passed" ? "✓" : criterion.status === "failed" ? "!" : criterion.status === "waived" ? "–" : ""}
              </span>
              <span className="decision-row-main">
                <strong>{criterion.label}</strong>
              </span>
              <span className="decision-row-chips">
                {!criterion.required ? <small className="check-chip optional">선택 항목</small> : null}
                {criterion.evidenceRefs?.length ? <small className="check-chip evidence">근거 {criterion.evidenceRefs.length}개</small> : null}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChoiceSetContent({
  block,
  graphId,
  nodeId,
  index,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "choice_set" }>;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const selected = block.options.find((option) => option.id === block.selectedOptionId);
  return (
    <div className="decision-block-content">
      <DecisionCallout label="선택 질문" value={block.question} />
      {selected ? <DecisionCallout label="현재 선택" value={selected.label} description={selected.rationale} /> : null}
      <div className="decision-row-list">
        {block.options.map((option) => (
          <div className={`decision-row option-row ${option.status} ${selectedItemId === option.id ? "selected" : ""}`} key={option.id}>
            <button className="decision-row-main option-main" onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: option.id, itemType: "option" })}>
              <strong>{option.label}</strong>
              {option.summary ? <em>{option.summary}</em> : null}
              {option.rationale ? <span>{option.rationale}</span> : null}
            </button>
            <span className="decision-row-chips">
              <small className={`check-chip ${option.status === "selected" ? "evidence" : "optional"}`}>{labelStatus(option.status)}</small>
              <small className="check-chip optional">활성: {activationLabel(option.activation)}</small>
            </span>
            <DownstreamLink target={option.downstreamTarget} graphId={option.downstreamGraphId} index={index} onTargetSelect={onTargetSelect} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonContent({
  block,
  graphId,
  nodeId,
  index,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "comparison" }>;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const selected = block.options.find((option) => option.id === block.selectedOptionId);
  return (
    <div className="decision-block-content">
      {block.recommendation ? <DecisionCallout label="추천" value={block.recommendation} description={block.recommendationRationale} /> : null}
      {selected ? <DecisionCallout label="선택된 대안" value={selected.label} description={selected.rationale} /> : null}
      <section className="decision-section">
        <strong>비교 기준</strong>
        <div className="decision-row-list">
          {block.criteria.map((criterion) => (
            <button
              className={`decision-row ${statusToneClass(criterion.status)} ${selectedItemId === criterion.id ? "selected" : ""}`}
              key={criterion.id}
              onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: criterion.id, itemType: "criterion" })}
            >
              <span className={`criteria-indicator ${criterion.status}`} aria-hidden="true">
                {criterion.status === "passed" ? "✓" : criterion.status === "failed" ? "!" : criterion.status === "waived" ? "–" : ""}
              </span>
              <span className="decision-row-main">
                <strong>{criterion.label}</strong>
              </span>
              <span className="decision-row-chips">
                {!criterion.required ? <small className="check-chip optional">선택 항목</small> : null}
                {criterion.evidenceRefs?.length ? <small className="check-chip evidence">근거 {criterion.evidenceRefs.length}개</small> : null}
              </span>
            </button>
          ))}
        </div>
      </section>
      <div className="comparison-option-list">
        {block.options.map((option) => {
          const scores = block.scores.filter((score) => score.optionId === option.id);
          return (
            <section className={`comparison-option-card ${option.status ?? "candidate"} ${selectedItemId === option.id ? "selected" : ""}`} key={option.id}>
              <div className="comparison-option-header">
                <button onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: option.id, itemType: "option" })}>
                  <strong>{option.label}</strong>
                  {option.rationale ? <em>{option.rationale}</em> : null}
                </button>
                {option.status ? <small className="check-chip optional">{labelStatus(option.status)}</small> : null}
              </div>
              <div className="comparison-score-list">
                {scores.map((score) => {
                  const criterion = block.criteria.find((item) => item.id === score.criterionId);
                  return (
                    <div className="comparison-score-row" key={score.id ?? `${score.optionId}:${score.criterionId}`}>
                      <button onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: score.id ?? `${score.optionId}:${score.criterionId}`, itemType: "score" })}>
                        <span>{criterion?.label ?? score.criterionId}</span>
                        {score.rating ? <small className={`rating-chip ${score.rating}`}>{ratingLabel(score.rating)}</small> : null}
                        {score.note ? <em>{score.note}</em> : null}
                      </button>
                      <EvidenceRefList refs={score.evidenceRefs ?? []} index={index} onTargetSelect={onTargetSelect} />
                    </div>
                  );
                })}
              </div>
              <DownstreamLink label="추천 이후" target={option.downstreamTarget} graphId={option.downstreamGraphId} index={index} onTargetSelect={onTargetSelect} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceContent({
  block,
  graphId,
  nodeId,
  selectedItemId,
  onSelect,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "evidence" }>;
  graphId: string;
  nodeId: string;
  selectedItemId?: string;
  onSelect: (selection: GraphSelection) => void;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  return (
    <div className="decision-block-content">
      <div className="decision-row-list">
        {block.items.map((item) => {
          const sourcePointer = item.sourcePointer;
          return (
            <div className={`decision-row evidence-row ${item.confidence ?? "medium"} ${selectedItemId === item.id ? "selected" : ""}`} key={item.id}>
              <button className="decision-row-main" onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: item.id, itemType: "evidence" })}>
                <strong>{item.claim}</strong>
                <em>출처: {item.source}</em>
              </button>
              <span className="decision-row-chips">
                {item.confidence ? <small className={`rating-chip ${item.confidence}`}>신뢰도 {ratingLabel(item.confidence)}</small> : null}
              </span>
              {sourcePointer ? (
                <button className="decision-link-row compact" onClick={() => onSelect(selectionForPointer(sourcePointer, graphId, "evidence"))}>
                  <span>원천 위치</span>
                  <em>{pointerLabel(sourcePointer)}</em>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SynthesisContent({
  block,
  graphId,
  nodeId,
  index,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "synthesis" }>;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  return (
    <div className="decision-block-content">
      {block.conclusion ? <DecisionCallout label={`결론 · ${joinPolicyLabel(block.joinPolicy)}`} value={block.conclusion} /> : null}
      <TargetList title="종합 대상" targets={block.sourceBranchRefs ?? []} index={index} onTargetSelect={onTargetSelect} />
      <section className="decision-section">
        <strong>발견</strong>
        <div className="decision-row-list">
          {block.entries.map((entry) => (
            <div className={`decision-row finding-row ${selectedItemId === entry.id ? "selected" : ""}`} key={entry.id}>
              <button className="decision-row-main" onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: entry.id, itemType: "finding" })}>
                <strong>{entry.finding}</strong>
              </button>
              <EvidenceRefList refs={entry.evidenceRefs} index={index} onTargetSelect={onTargetSelect} />
            </div>
          ))}
        </div>
      </section>
      <EvidenceRefList title="결론 근거" refs={block.conclusionEvidenceRefs ?? []} index={index} onTargetSelect={onTargetSelect} />
      {block.unresolvedQuestions?.length ? (
        <section className="decision-section">
          <strong>미해결 질문</strong>
          <div className="question-list">
            {block.unresolvedQuestions.map((question) => (
              <span key={question}>{question}</span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DecisionCallout({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <section className="decision-callout">
      <span>{label}</span>
      <strong>{value}</strong>
      {description ? <em>{description}</em> : null}
    </section>
  );
}

function TargetList({
  title,
  targets,
  index,
  onTargetSelect,
}: {
  title: string;
  targets: GraphPlanTarget[];
  index: GraphIndex;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  if (targets.length === 0) return null;
  return (
    <section className="decision-section">
      <strong>{title}</strong>
      <div className="decision-link-list">
        {targets.map((target) => (
          <button className="decision-link-row" key={JSON.stringify(target)} onClick={() => onTargetSelect(target)}>
            <span>{target.type}</span>
            <em>{breadcrumbForTarget(target, index)}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function ReviewTraceSection({
  trace,
  index,
  onTargetSelect,
}: {
  trace?: Extract<GraphPlanBlock, { type: "review_bundle" }>["reviewTrace"];
  index: GraphIndex;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  if (!trace) return null;
  return (
    <section className="decision-section">
      <strong>리뷰 처리 이력</strong>
      <div className="decision-row review-trace-row">
        <span className="decision-row-main">
          <strong>{reviewResolutionLabel(trace.resolution ?? "open")}</strong>
          {trace.sourceEventIds.length ? <em>관련 이벤트 {trace.sourceEventIds.length}개</em> : null}
        </span>
        <TargetList title="변경 대상" targets={trace.changedTargets ?? []} index={index} onTargetSelect={onTargetSelect} />
      </div>
    </section>
  );
}

function DownstreamLink({
  label = "이후 영향",
  target,
  graphId,
  index,
  onTargetSelect,
}: {
  label?: string;
  target?: GraphPlanTarget;
  graphId?: string;
  index: GraphIndex;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const graphTarget: GraphPlanTarget | undefined = target ?? (graphId ? { type: "graph", graphId } : undefined);
  if (!graphTarget) return null;
  return (
    <button className="decision-link-row compact" onClick={() => onTargetSelect(graphTarget)}>
      <span>{label}</span>
      <em>{breadcrumbForTarget(graphTarget, index)}</em>
    </button>
  );
}

function EvidenceRefList({
  title,
  refs,
  index,
  onTargetSelect,
}: {
  title?: string;
  refs: EvidenceRef[];
  index: GraphIndex;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  if (refs.length === 0) return null;
  return (
    <section className={title ? "decision-section" : "evidence-ref-inline"}>
      {title ? <strong>{title}</strong> : null}
      <div className="evidence-ref-list">
        {refs.map((ref) => {
          const target = targetForEvidenceRef(ref);
          return (
            <button className="evidence-ref-chip" disabled={!target} key={evidenceRefKey(ref)} onClick={() => target && onTargetSelect(target)}>
              {target ? breadcrumbForTarget(target, index) : evidenceRefKey(ref)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function targetForEvidenceRef(ref: EvidenceRef): GraphPlanTarget | null {
  if (typeof ref === "string" || !ref.nodeId) return null;
  return { type: "block_item", graphId: ref.graphId, nodeId: ref.nodeId, blockId: ref.blockId, itemId: ref.itemId, itemType: "evidence" };
}

function evidenceRefKey(ref: EvidenceRef): string {
  return typeof ref === "string" ? ref : `${ref.graphId}:${ref.nodeId ?? ""}:${ref.blockId}:${ref.itemId}`;
}

function selectionForPointer(pointer: GraphPlanPointer, fallbackGraphId: string, itemType?: GraphSelection["itemType"]): GraphSelection {
  return { ...pointerToSelection(pointer, fallbackGraphId), itemId: pointer.itemId, itemType };
}

function pointerLabel(pointer: GraphPlanPointer): string {
  return [pointer.graphId, pointer.nodeId, pointer.blockId, pointer.itemId].filter(Boolean).join(" / ");
}

function statusToneClass(status: string): string {
  if (status === "complete" || status === "checked" || status === "passed" || status === "selected") return "complete";
  if (status === "blocked" || status === "failed" || status === "rejected") return "blocked";
  if (status === "needs_revision" || status === "unchecked") return "warn";
  if (status === "waived" || status === "deferred") return "muted";
  return "open";
}

function activationLabel(activation: string): string {
  if (activation === "selected") return "선택 시";
  if (activation === "candidate") return "후보";
  if (activation === "always") return "항상";
  if (activation === "manual") return "수동";
  return activation;
}

function ratingLabel(rating: string): string {
  if (rating === "high") return "높음";
  if (rating === "medium") return "중간";
  if (rating === "low") return "낮음";
  return rating;
}

function joinPolicyLabel(policy: string): string {
  if (policy === "all") return "모든 대상";
  if (policy === "any") return "일부 대상";
  return "수동 판단";
}

function reviewResolutionLabel(resolution: string): string {
  if (resolution === "addressed") return "처리됨";
  if (resolution === "deferred") return "보류";
  if (resolution === "rejected") return "거절";
  return "열림";
}
