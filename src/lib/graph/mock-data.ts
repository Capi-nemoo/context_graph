// Demo data for the standalone showcase page (no Supabase required).
// Mirrors what a "metformin → diabetes" research run would build up over a few
// pipeline iterations.

import type { GraphEdge, GraphNode } from "./types";

const NOW = new Date().toISOString();

const node = (
  id: string,
  type: GraphNode["type"],
  label: string,
  summary: string,
  agent: string,
): GraphNode => ({
  id,
  ownerId: "demo",
  type,
  label,
  summary,
  sourceResearchId: "demo-research-1",
  sourceJobId: "demo-job-1",
  sourceAgent: agent,
  refCount: Math.ceil(Math.random() * 4) + 1,
  firstSeenAt: NOW,
  lastSeenAt: NOW,
  metadata: {},
});

const edge = (
  id: string,
  from: string,
  to: string,
  relation: string,
  agent: string,
  weight = 1,
): GraphEdge => ({
  id,
  ownerId: "demo",
  fromNode: from,
  toNode: to,
  relation,
  weight,
  sourceResearchId: "demo-research-1",
  sourceJobId: "demo-job-1",
  sourceAgent: agent,
  metadata: {},
  createdAt: NOW,
});

export const MOCK_NODES: GraphNode[] = [
  node("n-metformin", "drug", "metformin", "First-line oral antihyperglycemic for type 2 diabetes; activates AMPK.", "miner"),
  node("n-t2d", "disease", "type 2 diabetes", "Chronic metabolic disorder characterised by insulin resistance.", "miner"),
  node("n-ampk", "pathway", "AMPK signaling", "Energy-sensing kinase pathway upregulated in caloric restriction.", "analysis"),
  node("n-mtor", "pathway", "mTOR signaling", "Growth-regulating pathway downregulated by metformin via AMPK.", "analysis"),
  node("n-glucose", "metric", "fasting glucose", "Plasma glucose after 8h fast; primary outcome in many T2D trials.", "design"),
  node("n-hba1c", "metric", "HbA1c", "Glycated hemoglobin; 90-day average glycemia.", "design"),
  node("n-ukbb", "dataset", "UK Biobank", "500K participants, EHR + genomics + imaging.", "miner"),
  node("n-nhanes", "dataset", "NHANES", "US cross-sectional health and nutrition survey.", "miner"),
  node("n-trial-meta", "study", "DPP trial", "Diabetes Prevention Program — metformin reduced T2D incidence 31%.", "redteam"),
  node("n-rapamycin", "drug", "rapamycin", "mTOR inhibitor; longevity candidate; mechanistic overlap with metformin.", "redteam"),
  node("n-aging", "concept", "biological aging", "Age-related decline reversible by interventions targeting AMPK/mTOR.", "redteam"),
  node("n-claim-1", "claim", "metformin extends healthspan", "Population studies show diabetics on metformin live as long as non-diabetics.", "redteam"),
  node("n-mendelian", "method", "Mendelian randomization", "Genetic variants as instruments to test causality.", "viability"),
  node("n-tame", "study", "TAME trial", "Targeting Aging with Metformin — proposed RCT testing healthspan endpoints.", "redteam"),
  node("n-igf1", "protein", "IGF-1", "Insulin-like growth factor; lower levels associated with longevity.", "analysis"),
];

export const MOCK_EDGES: GraphEdge[] = [
  edge("e1", "n-metformin", "n-t2d", "treats", "miner"),
  edge("e2", "n-metformin", "n-ampk", "activates", "analysis"),
  edge("e3", "n-ampk", "n-mtor", "inhibits", "analysis"),
  edge("e4", "n-t2d", "n-glucose", "measured_by", "design"),
  edge("e5", "n-t2d", "n-hba1c", "measured_by", "design"),
  edge("e6", "n-ukbb", "n-t2d", "associated_with", "miner"),
  edge("e7", "n-nhanes", "n-glucose", "measured_by", "miner"),
  edge("e8", "n-trial-meta", "n-metformin", "supports", "redteam"),
  edge("e9", "n-rapamycin", "n-mtor", "inhibits", "redteam"),
  edge("e10", "n-metformin", "n-aging", "associated_with", "redteam"),
  edge("e11", "n-claim-1", "n-metformin", "supports", "redteam"),
  edge("e12", "n-mendelian", "n-metformin", "measured_by", "viability"),
  edge("e13", "n-tame", "n-metformin", "supports", "redteam"),
  edge("e14", "n-aging", "n-igf1", "correlates_with", "analysis"),
  edge("e15", "n-igf1", "n-mtor", "activates", "analysis"),
  edge("e16", "n-rapamycin", "n-aging", "associated_with", "redteam"),
];
