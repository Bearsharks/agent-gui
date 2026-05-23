import type { GraphPlanBlock, GraphPlanTarget } from "@agent-gui/plan-schema";
import { DecisionBlockContent } from "./DecisionBlockContent";
import { ExecutionBlockContent } from "./ExecutionBlockContent";
import { PrototypeGraphBlockContent } from "./PrototypeGraphBlockContent";
import { blockRelationships, type BlockRelationship } from "./blockRelationships";
import { breadcrumbForTarget, type GraphIndex, type GraphSelection } from "./graphReviewModel";
import { labelBlockType, labelStatus } from "./graphReviewLabels";

export function BlockDetail({
  block,
  graphId,
  nodeId,
  index,
  selection,
  issueCount,
  onSelect,
  onTargetSelect,
}: {
  block: GraphPlanBlock;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selection: GraphSelection;
  issueCount: number;
  onSelect: (selection: GraphSelection) => void;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const relationships = blockRelationships(block, graphId, nodeId, index);
  return (
    <article className="selected-node-block-card selected">
      <header className="block-shell-header">
        <div className="block-shell-title-row">
          <span className="block-type-badge">{labelBlockType(block.type)}</span>
          <strong>{block.title ?? labelBlockType(block.type)}</strong>
          {block.status ? <small>{labelStatus(block.status)}</small> : null}
          {issueCount > 0 ? <small className="issue-chip">이슈 {issueCount}개</small> : null}
        </div>
        {block.summary ? <em>{block.summary}</em> : null}
        <BlockRevisionSummary block={block} />
      </header>
      <div className="selected-node-block-body">
        <BlockRelationshipPanel relationships={relationships} onTargetSelect={onTargetSelect} />
        {renderBlockContent(block, graphId, nodeId, index, onSelect, onTargetSelect, selection)}
      </div>
    </article>
  );
}

export function blockItemCount(block: GraphPlanBlock): number {
  if (block.type === "task_list") return block.items.length;
  if (block.type === "checklist") return block.items.length;
  if (block.type === "criteria") return block.criteria.length;
  if (block.type === "review_bundle") return block.acceptanceCriteria.length + block.linkedTargets.length + (block.prototypeRef ? 1 : 0);
  if (block.type === "prototype") return block.tabs.length + block.tabs.reduce((sum, tab) => sum + (tab.relatedTargets?.length ?? 0), 0);
  if (block.type === "choice_set") return block.options.length;
  if (block.type === "comparison") return block.criteria.length + block.options.length + block.scores.length;
  if (block.type === "evidence") return block.items.length;
  if (block.type === "synthesis") return block.entries.length + (block.unresolvedQuestions?.length ?? 0);
  if (block.type === "risk") return block.risks.length;
  if (block.type === "verification") return block.checks.length;
  if (block.type === "checkpoint_outcome") return block.determiningRefs.length;
  if (block.type === "artifact") return block.artifacts.length;
  if (block.type === "changelog") return block.entries.length;
  if (block.type === "investigation") return block.hypotheses.length + block.experiments.length + block.observations.length + block.outcomes.length;
  if (block.type === "migration") return block.affectedSurfaces.length + (block.compatibility?.items?.length ?? 0) + (block.rollbackPlans?.length ?? 0) + block.steps.length;
  return 0;
}

function BlockRevisionSummary({ block }: { block: GraphPlanBlock }) {
  const revision = block.revisionMeta;
  if (!revision?.changeSummary?.length && !revision?.createdAtRevision && !revision?.updatedAtRevision) return null;
  const parts = [
    revision.createdAtRevision ? `r${revision.createdAtRevision} 생성` : "",
    revision.updatedAtRevision ? `r${revision.updatedAtRevision} 수정` : "",
    revision.changeSummary?.length ? `변경 ${revision.changeSummary.length}개` : "",
  ].filter(Boolean);
  return <span className="block-shell-revision">{parts.join(" · ")}</span>;
}

function BlockRelationshipPanel({
  relationships,
  onTargetSelect,
}: {
  relationships: BlockRelationship[];
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  if (relationships.length === 0) return null;
  return (
    <section className="block-relationship-panel" aria-label="Block relationships and impact">
      <strong>연결과 영향</strong>
      <div className="block-relationship-list">
        {relationships.map((relationship) => (
          <button
            className="block-relationship-row"
            key={relationship.id}
            disabled={!relationship.target}
            onClick={() => relationship.target && onTargetSelect(relationship.target)}
          >
            <span>{relationship.label}</span>
            <em>{relationship.description}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function renderBlockContent(
  block: GraphPlanBlock,
  graphId: string,
  nodeId: string,
  index: GraphIndex,
  onSelect: (selection: GraphSelection) => void,
  onTargetSelect: (target: GraphPlanTarget) => void,
  selection: GraphSelection,
) {
  const selectedItemId = selection.blockId === block.id ? selection.itemId : undefined;
  if (block.type === "text") return <TextBlockContent body={block.body} />;
  if (block.type === "task_list") return <TaskListBlockContent block={block} graphId={graphId} nodeId={nodeId} index={index} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  if (block.type === "checklist") return <ChecklistBlockContent block={block} graphId={graphId} nodeId={nodeId} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  if (block.type === "criteria") return <CriteriaBlockContent block={block} graphId={graphId} nodeId={nodeId} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  if (block.type === "risk") return <RiskBlockContent block={block} graphId={graphId} nodeId={nodeId} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  if (block.type === "verification") return <VerificationBlockContent block={block} graphId={graphId} nodeId={nodeId} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  if (block.type === "review_bundle" || block.type === "choice_set" || block.type === "comparison" || block.type === "evidence" || block.type === "synthesis") {
    return <DecisionBlockContent block={block} graphId={graphId} nodeId={nodeId} index={index} selectedItemId={selectedItemId} onSelect={onSelect} onTargetSelect={onTargetSelect} />;
  }
  if (block.type === "artifact" || block.type === "changelog" || block.type === "checkpoint_outcome" || block.type === "investigation" || block.type === "migration") {
    return <ExecutionBlockContent block={block} graphId={graphId} nodeId={nodeId} index={index} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  }
  if (block.type === "graph_ref" || block.type === "prototype") {
    return <PrototypeGraphBlockContent block={block} graphId={graphId} nodeId={nodeId} index={index} selection={selection} onTargetSelect={onTargetSelect} />;
  }
  return <pre>{JSON.stringify(block, null, 2)}</pre>;
}

function TextBlockContent({ body }: { body: string }) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return <p className="block-empty-state">내용 없음</p>;
  return (
    <div className="text-block-content">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}:${paragraph.slice(0, 24)}`}>{paragraph}</p>
      ))}
    </div>
  );
}

function TaskListBlockContent({
  block,
  graphId,
  nodeId,
  index,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "task_list" }>;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const counts = countByStatus(block.items.map((item) => item.status ?? "open"));
  return (
    <div className="typed-block-content">
      <StatusSummary
        items={[
          { label: "완료", count: counts.complete ?? 0, tone: "complete" },
          { label: "열림", count: counts.open ?? 0, tone: "open" },
          { label: "수정 필요", count: counts.needs_revision ?? 0, tone: "warn" },
          { label: "차단", count: counts.blocked ?? 0, tone: "blocked" },
        ]}
      />
      <div className="typed-row-list">
        {block.items.map((item) => {
          const status = item.status ?? "open";
          return (
            <button className={`typed-item-row ${statusToneClass(status)} ${selectedItemId === item.id ? "selected" : ""}`} key={item.id} onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: item.id, itemType: "task" })}>
              <span className="typed-item-status">{labelStatus(status)}</span>
              <strong>{item.label}</strong>
              {item.target ? <em>대상: {breadcrumbForTarget(item.target, index)}</em> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChecklistBlockContent({
  block,
  graphId,
  nodeId,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "checklist" }>;
  graphId: string;
  nodeId: string;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const requiredUncheckedCount = block.items.filter((item) => item.required && item.status === "unchecked").length;
  const requiredBlockedCount = block.items.filter((item) => item.required && item.status === "blocked").length;
  const requiredProblemSummary = [
    requiredUncheckedCount > 0 ? `필수 미확인 ${requiredUncheckedCount}개` : "",
    requiredBlockedCount > 0 ? `필수 차단 ${requiredBlockedCount}개` : "",
  ].filter(Boolean);
  return (
    <div className="typed-block-content">
      {requiredProblemSummary.length > 0 ? <p className="block-warning-note">{requiredProblemSummary.join(" · ")}</p> : null}
      <div className="typed-row-list">
        {block.items.map((item) => (
          <button className={`typed-item-row checklist-row ${statusToneClass(item.status)} ${selectedItemId === item.id ? "selected" : ""}`} key={item.id} onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: item.id, itemType: "check" })}>
            <span className={`check-indicator ${item.status}`} aria-hidden="true">
              {checkIndicatorLabel(item.status)}
            </span>
            <span className="checklist-row-main">
              <strong>{item.label}</strong>
              {item.owner ? <em>담당: {item.owner}</em> : null}
            </span>
            <span className="checklist-row-chips">
              {item.status === "blocked" ? <small className="check-chip blocked">차단됨</small> : null}
              {item.status === "waived" ? <small className="check-chip waived">면제</small> : null}
              {!item.required ? <small className="check-chip optional">선택 항목</small> : null}
              {item.evidenceRefs?.length ? <small className="check-chip evidence">근거 {item.evidenceRefs.length}개</small> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CriteriaBlockContent({
  block,
  graphId,
  nodeId,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "criteria" }>;
  graphId: string;
  nodeId: string;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const requiredPendingCount = block.criteria.filter((item) => item.required && item.status === "pending").length;
  const requiredFailedCount = block.criteria.filter((item) => item.required && item.status === "failed").length;
  const requiredProblemSummary = [
    requiredPendingCount > 0 ? `필수 대기 ${requiredPendingCount}개` : "",
    requiredFailedCount > 0 ? `필수 실패 ${requiredFailedCount}개` : "",
  ].filter(Boolean);
  return (
    <div className="typed-block-content">
      {requiredProblemSummary.length > 0 ? <p className="block-warning-note">{requiredProblemSummary.join(" · ")}</p> : null}
      <div className="typed-row-list">
        {block.criteria.map((criterion) => (
          <button className={`typed-item-row criteria-row ${statusToneClass(criterion.status)} ${selectedItemId === criterion.id ? "selected" : ""}`} key={criterion.id} onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: criterion.id, itemType: "criterion" })}>
            <span className={`criteria-indicator ${criterion.status}`} aria-hidden="true">
              {criteriaIndicatorLabel(criterion.status)}
            </span>
            <span className="typed-row-main">
              <strong>{criterion.label}</strong>
            </span>
            <span className="typed-row-chips">
              {criterion.status === "failed" ? <small className="check-chip blocked">실패</small> : null}
              {criterion.status === "waived" ? <small className="check-chip waived">면제</small> : null}
              {!criterion.required ? <small className="check-chip optional">선택 기준</small> : null}
              {criterion.evidenceRefs?.length ? <small className="check-chip evidence">근거 {criterion.evidenceRefs.length}개</small> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function VerificationBlockContent({
  block,
  graphId,
  nodeId,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "verification" }>;
  graphId: string;
  nodeId: string;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const pendingCount = block.checks.filter((check) => check.outcome === "pending").length;
  const failedCount = block.checks.filter((check) => check.outcome === "failed").length;
  const verificationProblemSummary = [
    pendingCount > 0 ? `검증 대기 ${pendingCount}개` : "",
    failedCount > 0 ? `검증 실패 ${failedCount}개` : "",
  ].filter(Boolean);
  return (
    <div className="typed-block-content">
      {verificationProblemSummary.length > 0 ? <p className="block-warning-note">{verificationProblemSummary.join(" · ")}</p> : null}
      <div className="typed-row-list">
        {block.checks.map((check) => (
          <button className={`typed-item-row verification-row ${statusToneClass(check.outcome)} ${selectedItemId === check.id ? "selected" : ""}`} key={check.id} onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: check.id, itemType: "verification" })}>
            <span className={`criteria-indicator ${check.outcome}`} aria-hidden="true">
              {criteriaIndicatorLabel(check.outcome)}
            </span>
            <span className="typed-row-main">
              <strong>{check.label}</strong>
              {check.expected ? <em>예상: {check.expected}</em> : null}
            </span>
            <span className="typed-row-chips">
              <small className="check-chip evidence">{labelStatus(check.mode)}</small>
              {check.outcome === "failed" ? <small className="check-chip blocked">실패</small> : null}
              {check.outcome === "waived" ? <small className="check-chip waived">면제</small> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RiskBlockContent({
  block,
  graphId,
  nodeId,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "risk" }>;
  graphId: string;
  nodeId: string;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const counts = countByStatus(block.risks.map((risk) => risk.severity));
  const highRiskCount = counts.high ?? 0;
  return (
    <div className="typed-block-content">
      {highRiskCount > 0 ? <p className="block-warning-note">높은 위험 {highRiskCount}개</p> : null}
      <div className="typed-row-list">
        {block.risks.map((risk) => (
          <button className={`typed-item-row risk-row ${riskSeverityToneClass(risk.severity)} ${selectedItemId === risk.id ? "selected" : ""}`} key={risk.id} onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: risk.id, itemType: "risk" })}>
            <span className={`risk-indicator ${risk.severity}`} aria-hidden="true" />
            <span className="typed-row-main">
              <strong>{risk.title}</strong>
              {risk.mitigation ? <em>완화: {risk.mitigation}</em> : null}
            </span>
            <span className="typed-row-chips">
              <small className={`check-chip ${riskSeverityToneClass(risk.severity) === "blocked" ? "blocked" : "optional"}`}>{labelStatus(risk.severity)}</small>
              {risk.evidenceRefs?.length ? <small className="check-chip evidence">근거 {risk.evidenceRefs.length}개</small> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusSummary({ items }: { items: { label: string; count: number; tone: string }[] }) {
  return (
    <div className="block-status-summary">
      {items.map((item) => (
        <span className={`status-summary-chip ${item.tone}`} key={item.label}>
          {item.label} {item.count}
        </span>
      ))}
    </div>
  );
}

function countByStatus(statuses: string[]): Record<string, number> {
  return statuses.reduce<Record<string, number>>((counts, status) => {
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function statusToneClass(status: string): string {
  if (status === "complete" || status === "checked" || status === "passed") return "complete";
  if (status === "blocked" || status === "failed") return "blocked";
  if (status === "needs_revision" || status === "unchecked") return "warn";
  if (status === "waived" || status === "deferred") return "muted";
  return "open";
}

function riskSeverityToneClass(severity: string): string {
  if (severity === "high") return "blocked";
  if (severity === "medium") return "warn";
  return "open";
}

function checkIndicatorLabel(status: string): string {
  if (status === "checked") return "✓";
  if (status === "blocked") return "!";
  if (status === "waived") return "–";
  return "";
}

function criteriaIndicatorLabel(status: string): string {
  if (status === "passed") return "✓";
  if (status === "failed") return "!";
  if (status === "waived") return "–";
  return "";
}
