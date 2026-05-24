import { z } from "zod";

const localIframeUrlSchema = z.string().url().refine(
  (value) => {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.port.length > 0;
  },
  { message: "Iframe URL must be local http with an explicit port." },
);

export const graphPlanIframeSchema = z.object({
  id: z.string(),
  description: z.string(),
  url: localIframeUrlSchema,
}).strict();

export const graphPlanNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  subGraphs: z.array(z.string()).optional(),
  iframes: z.array(graphPlanIframeSchema).optional(),
}).strict();

export const graphPlanConditionSchema = z.string();

export const graphPlanEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: z.union([z.enum(["sequence", "conditional", "loop", "dependency"]), z.string().regex(/^x-[a-z0-9._-]+$/)]),
  label: z.string().optional(),
  condition: graphPlanConditionSchema.optional(),
}).strict();

export const graphPlanParentSchema = z.object({
  graphId: z.string(),
  nodeId: z.string(),
}).strict();

export const graphPlanGraphSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  parent: graphPlanParentSchema.optional(),
  nodes: z.array(graphPlanNodeSchema),
  edges: z.array(graphPlanEdgeSchema),
}).strict();

export const graphPlanDocumentSchema = z.object({
  schemaVersion: z.literal("graph-plan/v1"),
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  rootGraphId: z.string(),
  graphs: z.array(graphPlanGraphSchema),
  currentRevision: z.number().int().positive(),
}).strict();

export const graphPlanTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan") }).strict(),
  z.object({ type: z.literal("graph"), graphId: z.string() }).strict(),
  z.object({ type: z.literal("node"), graphId: z.string(), nodeId: z.string() }).strict(),
  z.object({ type: z.literal("edge"), graphId: z.string(), edgeId: z.string() }).strict(),
  z.object({ type: z.literal("iframe"), graphId: z.string(), nodeId: z.string(), iframeId: z.string() }).strict(),
]);

export type GraphPlanIframe = z.infer<typeof graphPlanIframeSchema>;
export type GraphPlanNode = z.infer<typeof graphPlanNodeSchema>;
export type GraphPlanEdge = z.infer<typeof graphPlanEdgeSchema>;
export type GraphPlanGraph = z.infer<typeof graphPlanGraphSchema>;
export type GraphPlanDocument = z.infer<typeof graphPlanDocumentSchema>;
export type GraphPlanTarget = z.infer<typeof graphPlanTargetSchema>;
