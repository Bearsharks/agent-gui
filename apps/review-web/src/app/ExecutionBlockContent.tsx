import type { GraphPlanBlock, GraphPlanTarget } from "@agent-gui/plan-schema";
import { breadcrumbForTarget, type GraphIndex } from "./graphReviewModel";
import { labelStatus } from "./graphReviewLabels";

type ExecutionBlock = Extract<GraphPlanBlock, { type: "artifact" | "changelog" | "checkpoint_outcome" | "investigation" | "migration" }>;
type EvidenceRef = NonNullable<Extract<GraphPlanBlock, { type: "investigation" }>["hypotheses"][number]["evidenceRefs"]>[number];

export function ExecutionBlockContent({
  block,
  graphId,
  nodeId,
  index,
  selectedItemId,
  onTargetSelect,
}: {
  block: ExecutionBlock;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  if (block.type === "artifact") return <ArtifactContent block={block} graphId={graphId} nodeId={nodeId} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  if (block.type === "changelog") return <ChangelogContent block={block} graphId={graphId} nodeId={nodeId} index={index} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  if (block.type === "checkpoint_outcome") return <CheckpointOutcomeContent block={block} index={index} onTargetSelect={onTargetSelect} />;
  if (block.type === "investigation") return <InvestigationContent block={block} graphId={graphId} nodeId={nodeId} index={index} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
  return <MigrationContent block={block} graphId={graphId} nodeId={nodeId} index={index} selectedItemId={selectedItemId} onTargetSelect={onTargetSelect} />;
}

function ArtifactContent({
  block,
  graphId,
  nodeId,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "artifact" }>;
  graphId: string;
  nodeId: string;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  return (
    <div className="execution-block-content">
      <section className="execution-section">
        <strong>산출물</strong>
        <div className="execution-row-list">
          {block.artifacts.map((artifact) => (
            <div className={`execution-row ${selectedItemId === artifact.id ? "selected" : ""}`} key={artifact.id}>
              <button className="execution-row-main" onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: artifact.id, itemType: "artifact" })}>
                <strong>{artifact.title}</strong>
                <em>{artifact.ref}</em>
              </button>
              <span className="execution-row-chips">
                <small className="execution-chip">{artifactKindLabel(artifact.kind)}</small>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChangelogContent({
  block,
  graphId,
  nodeId,
  index,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "changelog" }>;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  return (
    <div className="execution-block-content">
      <ExecutionCallout label="변경 범위" value={`r${block.fromRevision} -> r${block.toRevision}`} />
      <ReviewTrace trace={block.reviewTrace} index={index} onTargetSelect={onTargetSelect} />
      <section className="execution-section">
        <strong>변경 항목</strong>
        <div className="execution-row-list">
          {block.entries.map((entry) => (
            <div className={`execution-row ${selectedItemId === entry.id ? "selected" : ""}`} key={entry.id}>
              <button className="execution-row-main" onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: entry.id, itemType: "change" })}>
                <strong>{entry.summary}</strong>
                {entry.sourceEventIds?.length ? <em>관련 이벤트 {entry.sourceEventIds.length}개</em> : null}
              </button>
              <TargetList title="변경 대상" targets={entry.changedTargets} index={index} onTargetSelect={onTargetSelect} />
              <TargetList title="이전 대상" targets={entry.previousTargets ?? []} index={index} onTargetSelect={onTargetSelect} />
              <MappingList mappings={entry.mappings ?? []} index={index} onTargetSelect={onTargetSelect} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CheckpointOutcomeContent({
  block,
  index,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "checkpoint_outcome" }>;
  index: GraphIndex;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const meta = [block.decidedBy ? `결정: ${block.decidedBy}` : "", block.decidedAt ? formatDate(block.decidedAt) : "", block.sourceEventIds?.length ? `이벤트 ${block.sourceEventIds.length}개` : ""].filter(Boolean);
  return (
    <div className="execution-block-content">
      <ExecutionCallout label="체크포인트 판정" value={labelStatus(block.result)} description={meta.join(" · ")} tone={block.result} />
      <TargetList title="판정 근거" targets={block.determiningRefs} index={index} onTargetSelect={onTargetSelect} />
    </div>
  );
}

function InvestigationContent({
  block,
  graphId,
  nodeId,
  index,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "investigation" }>;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  const hypothesisLabel = (id: string) => block.hypotheses.find((hypothesis) => hypothesis.id === id)?.statement ?? id;
  return (
    <div className="execution-block-content">
      <ExecutionCallout label="종료 조건" value={block.exitCondition} />
      <section className="execution-section">
        <strong>가설</strong>
        <div className="execution-row-list">
          {block.hypotheses.map((hypothesis) => (
            <div className={`execution-row ${statusToneClass(hypothesis.status)} ${selectedItemId === hypothesis.id ? "selected" : ""}`} key={hypothesis.id}>
              <button className="execution-row-main" onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: hypothesis.id, itemType: "hypothesis" })}>
                <strong>{hypothesis.statement}</strong>
              </button>
              <span className="execution-row-chips">
                <small className="execution-chip">{investigationStatusLabel(hypothesis.status)}</small>
              </span>
              <EvidenceRefList refs={hypothesis.evidenceRefs ?? []} index={index} onTargetSelect={onTargetSelect} />
            </div>
          ))}
        </div>
      </section>
      <section className="execution-section">
        <strong>실험</strong>
        <div className="execution-row-list">
          {block.experiments.map((experiment) => (
            <div className={`execution-row ${statusToneClass(experiment.result)} ${selectedItemId === experiment.id ? "selected" : ""}`} key={experiment.id}>
              <button className="execution-row-main" onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: experiment.id, itemType: "experiment" })}>
                <strong>{experiment.procedure}</strong>
                <em>가설: {hypothesisLabel(experiment.hypothesisId)}</em>
                {experiment.artifactRefs?.length ? <em>산출물 참조 {experiment.artifactRefs.length}개</em> : null}
              </button>
              <span className="execution-row-chips">
                <small className="execution-chip">{experimentResultLabel(experiment.result)}</small>
              </span>
              <TargetList title="절차 대상" targets={experiment.procedureTarget ? [experiment.procedureTarget] : graphTarget(experiment.procedureGraphId)} index={index} onTargetSelect={onTargetSelect} />
            </div>
          ))}
        </div>
      </section>
      <section className="execution-section">
        <strong>관찰</strong>
        <div className="execution-row-list">
          {block.observations.map((observation) => (
            <div className={`execution-row ${selectedItemId === observation.id ? "selected" : ""}`} key={observation.id}>
              <button className="execution-row-main" onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: observation.id, itemType: "evidence" })}>
                <strong>{observation.note}</strong>
              </button>
              <EvidenceRefList refs={observation.evidenceRefs ?? []} index={index} onTargetSelect={onTargetSelect} />
            </div>
          ))}
        </div>
      </section>
      <section className="execution-section">
        <strong>결과</strong>
        <div className="execution-row-list">
          {block.outcomes.map((outcome) => (
            <div className={`execution-row ${selectedItemId === outcome.id ? "selected" : ""}`} key={outcome.id}>
              <button className="execution-row-main" onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: outcome.id, itemType: "finding" })}>
                <strong>{outcome.summary}</strong>
                {outcome.nextAction ? <em>다음: {outcome.nextAction}</em> : null}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MigrationContent({
  block,
  graphId,
  nodeId,
  index,
  selectedItemId,
  onTargetSelect,
}: {
  block: Extract<GraphPlanBlock, { type: "migration" }>;
  graphId: string;
  nodeId: string;
  index: GraphIndex;
  selectedItemId?: string;
  onTargetSelect: (target: GraphPlanTarget) => void;
}) {
  return (
    <div className="execution-block-content">
      <ExecutionCallout label="버전 전환" value={`${block.fromVersion} -> ${block.toVersion}`} />
      <ExecutionCallout label="검증 게이트" value={block.verificationGate} />
      <section className="execution-section">
        <strong>영향 영역</strong>
        <div className="execution-chip-list">{block.affectedSurfaces.map((surface) => <span className="execution-chip" key={surface}>{surface}</span>)}</div>
      </section>
      <section className="execution-section">
        <strong>호환성</strong>
        <ExecutionCallout label="전략" value={block.compatibilityStrategy} />
        {block.compatibility ? (
          <div className="execution-row-list">
            {block.compatibility.readCompatibility ? <TextRow label="읽기" value={block.compatibility.readCompatibility} /> : null}
            {block.compatibility.writeCompatibility ? <TextRow label="쓰기" value={block.compatibility.writeCompatibility} /> : null}
            {block.compatibility.legacySessionPolicy ? <TextRow label="기존 세션" value={block.compatibility.legacySessionPolicy} /> : null}
            {block.compatibility.items?.map((item) => (
              <div className={`execution-row ${statusToneClass(item.status)} ${selectedItemId === item.id ? "selected" : ""}`} key={item.id}>
                <span className="execution-row-main">
                  <strong>{item.policy}</strong>
                </span>
                <span className="execution-row-chips">
                  <small className="execution-chip">{compatKindLabel(item.kind)}</small>
                  <small className="execution-chip">{labelStatus(item.status)}</small>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section className="execution-section">
        <strong>롤백</strong>
        <ExecutionCallout label={`기본 범위 · ${scopeLabel(block.rollbackScope)}`} value={block.rollbackPlan} />
        <TargetList title="롤백 대상" targets={block.rollbackTargets ?? []} index={index} onTargetSelect={onTargetSelect} />
        <div className="execution-row-list">
          {block.rollbackPlans?.map((plan) => (
            <div className={`execution-row ${selectedItemId === plan.id ? "selected" : ""}`} key={plan.id}>
              <span className="execution-row-main">
                <strong>{plan.plan}</strong>
                <em>범위: {scopeLabel(plan.scope)}</em>
              </span>
              <TargetList title="대상" targets={plan.targets} index={index} onTargetSelect={onTargetSelect} />
            </div>
          ))}
        </div>
      </section>
      <section className="execution-section">
        <strong>단계</strong>
        <div className="execution-row-list">
          {block.steps.map((step) => (
            <div className={`execution-row ${selectedItemId === step.id ? "selected" : ""}`} key={step.id}>
              <button className="execution-row-main" onClick={() => onTargetSelect({ type: "block_item", graphId, nodeId, blockId: block.id, itemId: step.id, itemType: "migration_step" })}>
                <strong>{step.label}</strong>
                {step.rollbackScope ? <em>롤백 범위: {scopeLabel(step.rollbackScope)}</em> : null}
                {step.verificationRefs?.length ? <em>검증 참조 {step.verificationRefs.length}개</em> : null}
              </button>
              <TargetList title="검증 대상" targets={step.verificationTargets ?? []} index={index} onTargetSelect={onTargetSelect} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ExecutionCallout({ label, value, description, tone }: { label: string; value: string; description?: string; tone?: string }) {
  return (
    <section className={`execution-callout ${tone ? statusToneClass(tone) : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {description ? <em>{description}</em> : null}
    </section>
  );
}

function TextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="execution-row">
      <span className="execution-row-main">
        <strong>{label}</strong>
        <em>{value}</em>
      </span>
    </div>
  );
}

function TargetList({ title, targets, index, onTargetSelect }: { title: string; targets: GraphPlanTarget[]; index: GraphIndex; onTargetSelect: (target: GraphPlanTarget) => void }) {
  if (targets.length === 0) return null;
  return (
    <section className="execution-target-section">
      <strong>{title}</strong>
      <div className="execution-link-list">
        {targets.map((target) => (
          <button className="execution-link-row" key={JSON.stringify(target)} onClick={() => onTargetSelect(target)}>
            <span>{target.type}</span>
            <em>{breadcrumbForTarget(target, index)}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function MappingList({ mappings, index, onTargetSelect }: { mappings: NonNullable<Extract<GraphPlanBlock, { type: "changelog" }>["entries"][number]["mappings"]>; index: GraphIndex; onTargetSelect: (target: GraphPlanTarget) => void }) {
  if (mappings.length === 0) return null;
  return (
    <section className="execution-target-section">
      <strong>대상 매핑</strong>
      <div className="execution-row-list">
        {mappings.map((mapping) => (
          <div className="execution-mapping-row" key={mapping.id}>
            <span className="execution-chip">{changeKindLabel(mapping.changeKind)}</span>
            {mapping.sourceEventIds?.length ? <span className="execution-chip">이벤트 {mapping.sourceEventIds.length}개</span> : null}
            <TargetList title="이전" targets={mapping.previousTargets} index={index} onTargetSelect={onTargetSelect} />
            <TargetList title="신규" targets={mapping.newTargets} index={index} onTargetSelect={onTargetSelect} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewTrace({ trace, index, onTargetSelect }: { trace?: Extract<GraphPlanBlock, { type: "changelog" }>["reviewTrace"]; index: GraphIndex; onTargetSelect: (target: GraphPlanTarget) => void }) {
  if (!trace) return null;
  return (
    <section className="execution-section">
      <strong>리뷰 처리</strong>
      <div className="execution-row">
        <span className="execution-row-main">
          <strong>{reviewResolutionLabel(trace.resolution ?? "open")}</strong>
          <em>관련 이벤트 {trace.sourceEventIds.length}개</em>
        </span>
        <TargetList title="변경 대상" targets={trace.changedTargets ?? []} index={index} onTargetSelect={onTargetSelect} />
      </div>
    </section>
  );
}

function EvidenceRefList({ refs, index, onTargetSelect }: { refs: EvidenceRef[]; index: GraphIndex; onTargetSelect: (target: GraphPlanTarget) => void }) {
  if (refs.length === 0) return null;
  return (
    <div className="execution-link-list">
      {refs.map((ref) => {
        const target = targetForEvidenceRef(ref);
        return (
          <button className="execution-link-row" disabled={!target} key={evidenceRefKey(ref)} onClick={() => target && onTargetSelect(target)}>
            <span>근거</span>
            <em>{target ? breadcrumbForTarget(target, index) : evidenceRefKey(ref)}</em>
          </button>
        );
      })}
    </div>
  );
}

function targetForEvidenceRef(ref: EvidenceRef): GraphPlanTarget | null {
  if (typeof ref === "string" || !ref.nodeId) return null;
  return { type: "block_item", graphId: ref.graphId, nodeId: ref.nodeId, blockId: ref.blockId, itemId: ref.itemId, itemType: "evidence" };
}

function graphTarget(graphId?: string): GraphPlanTarget[] {
  return graphId ? [{ type: "graph", graphId }] : [];
}

function evidenceRefKey(ref: EvidenceRef): string {
  return typeof ref === "string" ? ref : `${ref.graphId}:${ref.nodeId ?? ""}:${ref.blockId}:${ref.itemId}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function statusToneClass(status: string): string {
  if (["passed", "confirmed", "supports", "active"].includes(status)) return "complete";
  if (["failed", "falsified", "refutes"].includes(status)) return "blocked";
  if (["testing", "pending", "inconclusive"].includes(status)) return "warn";
  if (["waived", "superseded", "retired"].includes(status)) return "muted";
  return "open";
}

function artifactKindLabel(kind: string): string {
  if (kind === "file") return "파일";
  if (kind === "url") return "URL";
  if (kind === "code_ref") return "코드 참조";
  return "생성물";
}

function changeKindLabel(kind: string): string {
  const labels: Record<string, string> = { rename: "이름 변경", split: "분리", merge: "병합", move: "이동", replace: "교체", delete: "삭제", create: "생성" };
  return labels[kind] ?? kind;
}

function reviewResolutionLabel(resolution: string): string {
  if (resolution === "addressed") return "처리됨";
  if (resolution === "deferred") return "보류";
  if (resolution === "rejected") return "거절";
  return "열림";
}

function investigationStatusLabel(status: string): string {
  const labels: Record<string, string> = { open: "열림", testing: "검증 중", confirmed: "확인됨", falsified: "반증됨", superseded: "대체됨" };
  return labels[status] ?? status;
}

function experimentResultLabel(result: string): string {
  const labels: Record<string, string> = { pending: "대기", supports: "지지", refutes: "반박", inconclusive: "불충분" };
  return labels[result] ?? result;
}

function compatKindLabel(kind: string): string {
  const labels: Record<string, string> = { read: "읽기", write: "쓰기", legacy_session: "기존 세션", interop: "상호운용" };
  return labels[kind] ?? kind;
}

function scopeLabel(scope: string): string {
  if (scope === "step") return "단계";
  if (scope === "phase") return "단계군";
  return "전체";
}
