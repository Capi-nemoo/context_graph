// Type → palette token. Matches main app's --color-agent-* tokens so the
// graph reads as part of the same visual system.

import type { NodeType } from "./types";

export const NODE_COLOR: Record<NodeType, string> = {
  drug: "var(--color-agent-2)",       // electric blue
  disease: "var(--color-agent-7)",    // coral pink
  gene: "var(--color-agent-1)",       // acid green
  protein: "var(--color-agent-8)",    // mint
  pathway: "var(--color-agent-4)",    // purple
  dataset: "var(--color-agent-6)",    // cyan
  study: "var(--color-agent-3)",      // orange
  metric: "var(--color-agent-5)",     // amber
  method: "var(--color-agent-9)",     // magenta
  claim: "var(--color-amber)",        // yellow — claims stand out
  agent_output: "var(--color-ink-muted)", // muted
  concept: "var(--color-ink)",        // bone white
};

export const NODE_LABEL: Record<NodeType, string> = {
  drug: "DRUG",
  disease: "DISEASE",
  gene: "GENE",
  protein: "PROTEIN",
  pathway: "PATHWAY",
  dataset: "DATASET",
  study: "STUDY",
  metric: "METRIC",
  method: "METHOD",
  claim: "CLAIM",
  agent_output: "AGENT",
  concept: "CONCEPT",
};

export const RELATION_COLOR: Record<string, string> = {
  treats: "var(--color-agent-1)",
  inhibits: "var(--color-agent-7)",
  activates: "var(--color-agent-1)",
  expresses: "var(--color-agent-8)",
  correlates_with: "var(--color-agent-2)",
  causes: "var(--color-agent-3)",
  contradicts: "var(--color-coral)",
  supports: "var(--color-agent-1)",
  cites: "var(--color-ink-muted)",
  derived_from: "var(--color-ink-muted)",
  measured_by: "var(--color-agent-6)",
  associated_with: "var(--color-stroke-strong)",
};

export function relationColor(relation: string): string {
  return RELATION_COLOR[relation] ?? "var(--color-stroke-strong)";
}
