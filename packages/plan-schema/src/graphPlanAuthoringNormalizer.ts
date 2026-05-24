import { z } from "zod";
import { graphPlanDocumentSchema, type GraphPlanDocument } from "./graphPlan";
import { validateGraphPlan } from "./graphPlanSemanticValidator";
import { type GraphPlanValidationMode, type GraphPlanValidationSummary } from "./graphPlanValidation";

export type GraphPlanSchemaIssue = {
  path: string;
  message: string;
  hint?: string;
};

export type GraphPlanNormalizationResult = {
  graphPlan: unknown;
  changes: string[];
  schemaIssues: GraphPlanSchemaIssue[];
  validation?: GraphPlanValidationSummary;
};

type MutableRecord = Record<string, unknown>;

export function normalizeGraphPlanForAuthoring(input: unknown, mode: GraphPlanValidationMode = "draft"): GraphPlanNormalizationResult {
  const graphPlan = cloneJson(input);
  const changes: string[] = [];

  if (isRecord(graphPlan)) {
    normalizeGraphs(graphPlan, changes);
  }

  const parsed = graphPlanDocumentSchema.safeParse(graphPlan);
  if (!parsed.success) {
    return {
      graphPlan,
      changes,
      schemaIssues: schemaIssuesFromZodError(parsed.error),
    };
  }

  return {
    graphPlan: parsed.data,
    changes,
    schemaIssues: [],
    validation: validateGraphPlan(parsed.data, { mode }),
  };
}

function normalizeGraphs(document: MutableRecord, changes: string[]): void {
  const graphs = document.graphs;
  if (!Array.isArray(graphs)) return;

  graphs.forEach((graph) => {
    if (!isRecord(graph) || !Array.isArray(graph.nodes)) return;
    graph.nodes.forEach((node) => {
      if (!isRecord(node) || !Array.isArray(node.blocks)) return;
      node.blocks.forEach((block) => {
        if (!isRecord(block)) return;
        normalizeBlock(block, changes);
      });
    });
  });
}

function normalizeBlock(block: MutableRecord, changes: string[]): void {
  switch (block.type) {
    case "task_list":
      normalizeItemLabels(block.items, "task_list.items", changes);
      return;
    case "checklist":
      normalizeItemLabels(block.items, "checklist.items", changes);
      return;
    case "criteria":
      normalizeItemLabels(block.criteria, "criteria.criteria", changes);
      return;
    case "review_bundle":
      normalizeItemLabels(block.acceptanceCriteria, "review_bundle.acceptanceCriteria", changes);
      return;
    case "artifact":
      normalizeArtifacts(block.artifacts, changes);
      return;
    case "comparison":
      normalizeComparison(block, changes);
      return;
  }
}

function normalizeItemLabels(items: unknown, label: string, changes: string[]): void {
  if (!Array.isArray(items)) return;
  items.forEach((item) => {
    if (!isRecord(item) || typeof item.label === "string") return;
    if (typeof item.text === "string") {
      item.label = item.text;
      changes.push(`${label}: copied text to label for '${String(item.id ?? "unknown")}'.`);
    }
  });
}

function normalizeArtifacts(artifacts: unknown, changes: string[]): void {
  if (!Array.isArray(artifacts)) return;
  artifacts.forEach((artifact) => {
    if (!isRecord(artifact)) return;
    const artifactId = String(artifact.id ?? "unknown");
    if (typeof artifact.title !== "string" && typeof artifact.label === "string") {
      artifact.title = artifact.label;
      changes.push(`artifact: copied label to title for '${artifactId}'.`);
    }
    if (typeof artifact.ref !== "string" && typeof artifact.uri === "string") {
      artifact.ref = artifact.uri;
      changes.push(`artifact: copied uri to ref for '${artifactId}'.`);
    }
    if ((artifact.kind === "session" || artifact.kind === "mcp_session" || artifact.kind === "external_ref") && typeof artifact.ref === "string" && looksLikeUrl(artifact.ref)) {
      artifact.kind = "url";
      changes.push(`artifact: normalized external reference kind to url for '${artifactId}'.`);
    }
  });
}

function normalizeComparison(block: MutableRecord, changes: string[]): void {
  if (Array.isArray(block.criteria) || !Array.isArray(block.rows)) return;

  const rows = block.rows.filter(isRecord);
  const columns = Array.isArray(block.columns) ? block.columns.filter(isRecordOrString) : [];
  if (rows.length === 0 || columns.length === 0) return;

  block.criteria = rows.map((row, index) => ({
    id: idFrom(row.id, `criterion-${index + 1}`),
    label: textFrom(row.label, row.text, row.title, `Criterion ${index + 1}`),
    required: typeof row.required === "boolean" ? row.required : true,
    status: typeof row.status === "string" ? row.status : "pending",
  }));
  block.options = columns.map((column, index) => ({
    id: idFrom(isRecord(column) ? column.id : undefined, `option-${index + 1}`),
    label: isRecord(column) ? textFrom(column.label, column.text, column.title, `Option ${index + 1}`) : column,
  }));
  block.scores = normalizeComparisonScores(block.cells, block.criteria, block.options);
  changes.push(`comparison: converted columns/rows/cells shorthand for '${String(block.id ?? "unknown")}'.`);
}

function normalizeComparisonScores(cells: unknown, criteria: unknown, options: unknown): MutableRecord[] {
  if (!Array.isArray(cells) || !Array.isArray(criteria) || !Array.isArray(options)) return [];
  return cells.filter(isRecord).flatMap((cell) => {
    const criterionId = idFrom(cell.criterionId ?? cell.rowId, "");
    const optionId = idFrom(cell.optionId ?? cell.columnId, "");
    if (!criterionId || !optionId) return [];
    return [{ optionId, criterionId, rating: cell.rating, note: cell.note }];
  });
}

function schemaIssuesFromZodError(error: z.ZodError): GraphPlanSchemaIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return { path, message: issue.message, hint: hintForSchemaIssue(path, issue.message) };
  });
}

function hintForSchemaIssue(path: string, message: string): string | undefined {
  if (path.endsWith(".kind") && message.includes("Invalid")) return "artifact.kind must be file, url, code_ref, or generated_output.";
  if (path.endsWith(".label")) return "Use label for reviewer-facing item text. The normalizer can copy text to label.";
  if (path.endsWith(".title")) return "Use title for artifact display names. The normalizer can copy label to title.";
  if (path.endsWith(".ref")) return "Use ref for file paths, URLs, or code references. The normalizer can copy uri to ref.";
  if (path.includes(".comparison") || path.endsWith(".criteria") || path.endsWith(".options")) {
    return "comparison blocks use criteria, options, and scores. The normalizer accepts simple columns/rows/cells shorthand.";
  }
  return undefined;
}

function cloneJson(input: unknown): unknown {
  if (input === undefined) return undefined;
  return JSON.parse(JSON.stringify(input)) as unknown;
}

function isRecord(value: unknown): value is MutableRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordOrString(value: unknown): value is MutableRecord | string {
  return isRecord(value) || typeof value === "string";
}

function idFrom(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function textFrom(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
