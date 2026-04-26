// Builds the "Prior knowledge" markdown block that gets prepended to each
// pipeline agent's user prompt. This is the join point between the graph and
// the agents — the only place graph data flows into LLM input.

import type { Neighbor, RelevantNode } from "./types";

export type ContextBlockOptions = {
  // Top-k semantically similar nodes from the user's accumulated graph.
  relevant: RelevantNode[];
  // 1-hop neighborhoods of selected high-relevance nodes (optional).
  neighborhoods?: Map<string /* nodeId */, Neighbor[]>;
  // Hard cap on total characters injected (defaults to 2000 to keep prompts tight).
  maxChars?: number;
};

export function buildContextBlock(opts: ContextBlockOptions): string {
  const max = opts.maxChars ?? 2000;
  const lines: string[] = [];

  if (opts.relevant.length > 0) {
    lines.push("Prior knowledge from the user's context graph:");
    for (const n of opts.relevant) {
      const sim = (n.similarity * 100).toFixed(0);
      const sum = n.summary ? ` — ${truncate(n.summary, 160)}` : "";
      lines.push(`- [${n.type}] ${n.label}${sum}  (relevance: ${sim}%)`);

      const neighbors = opts.neighborhoods?.get(n.id) ?? [];
      for (const nb of neighbors.slice(0, 3)) {
        const arrow = nb.direction === "out" ? "→" : "←";
        const nbSum = nb.nodeSummary ? ` (${truncate(nb.nodeSummary, 80)})` : "";
        lines.push(
          `    ${arrow} ${nb.edgeRelation} ${arrow} [${nb.nodeType}] ${nb.nodeLabel}${nbSum}`,
        );
      }
    }
  }

  if (lines.length === 0) return "";

  let out = "\n\n" + lines.join("\n");
  if (out.length > max) {
    out = out.slice(0, max - 1) + "…";
  }
  return out;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
