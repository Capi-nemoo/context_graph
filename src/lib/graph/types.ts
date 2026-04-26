// Core types for the context graph. Mirrors the schema in
// migrations/0002_context_graph.sql.

export const NODE_TYPES = [
  "drug",
  "disease",
  "gene",
  "protein",
  "pathway",
  "dataset",
  "study",
  "metric",
  "method",
  "claim",
  "agent_output",
  "concept",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const RELATION_TYPES = [
  "treats",
  "inhibits",
  "activates",
  "expresses",
  "correlates_with",
  "causes",
  "contradicts",
  "supports",
  "cites",
  "derived_from",
  "measured_by",
  "associated_with",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number] | string;

export type GraphNode = {
  id: string;
  ownerId: string;
  type: NodeType;
  label: string;
  summary: string | null;
  sourceResearchId: string | null;
  sourceJobId: string | null;
  sourceAgent: string | null;
  refCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  metadata: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  ownerId: string;
  fromNode: string;
  toNode: string;
  relation: RelationType;
  weight: number;
  sourceResearchId: string | null;
  sourceJobId: string | null;
  sourceAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// What the extractor returns before we upsert.
export type ExtractedNode = {
  type: NodeType;
  label: string;
  summary?: string;
};

export type ExtractedEdge = {
  fromLabel: string;
  fromType: NodeType;
  toLabel: string;
  toType: NodeType;
  relation: RelationType;
  weight?: number;
};

export type ExtractionResult = {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
};

export type RelevantNode = {
  id: string;
  type: NodeType;
  label: string;
  summary: string | null;
  similarity: number;
  sourceResearchId: string | null;
  sourceJobId: string | null;
  refCount: number;
  lastSeenAt: string;
};

export type Neighbor = {
  nodeId: string;
  nodeType: NodeType;
  nodeLabel: string;
  nodeSummary: string | null;
  edgeId: string;
  edgeRelation: RelationType;
  edgeWeight: number;
  direction: "in" | "out";
};
