// Server-side graph operations. Uses the service-role Supabase client so the
// pipeline can write across users. Cookie-bound clients should use the
// match_context_nodes RPC + direct table reads (RLS-scoped) instead.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, embedMany } from "./embeddings";
import type {
  ExtractionResult,
  GraphEdge,
  GraphNode,
  Neighbor,
  NodeType,
  RelevantNode,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// upsertGraph: atomic per-node upsert via the upsert_context_node() proc, then
// edges by joining on (owner_id, type, label_norm) → node id. Embeddings are
// computed for newly-inserted-or-updated nodes whose embedding column is NULL.
// ─────────────────────────────────────────────────────────────────────────────

export type UpsertContext = {
  ownerId: string;
  sourceResearchId?: string | null;
  sourceJobId?: string | null;
  sourceAgent?: string | null;
};

export async function upsertGraph(
  admin: SupabaseClient,
  extraction: ExtractionResult,
  ctx: UpsertContext,
): Promise<{ insertedNodes: GraphNode[]; insertedEdges: GraphEdge[] }> {
  if (extraction.nodes.length === 0) {
    return { insertedNodes: [], insertedEdges: [] };
  }

  // 1. Atomic upsert each node (sequential to keep payloads small; the set is
  //    capped at 12 by the extractor).
  const upserted: GraphNode[] = [];
  for (const n of extraction.nodes) {
    const { data, error } = await admin.rpc("upsert_context_node", {
      p_owner_id: ctx.ownerId,
      p_type: n.type,
      p_label: n.label,
      p_summary: n.summary ?? null,
      p_source_research_id: ctx.sourceResearchId ?? null,
      p_source_job_id: ctx.sourceJobId ?? null,
      p_source_agent: ctx.sourceAgent ?? null,
    });
    if (error) {
      console.error("[graph] upsert_context_node failed:", error.message);
      continue;
    }
    if (data) upserted.push(rowToNode(data as Record<string, unknown>));
  }

  // 2. Embed any node missing an embedding (always true for fresh inserts;
  //    duplicates already had one).
  const needEmbedding = upserted.filter(
    (n) => !(n as unknown as { embedding?: unknown }).embedding,
  );
  if (needEmbedding.length > 0) {
    const texts = needEmbedding.map(
      (n) => `${n.label}${n.summary ? ` — ${n.summary}` : ""}`,
    );
    try {
      const vectors = await embedMany(texts);
      await Promise.all(
        needEmbedding.map((n, i) =>
          admin
            .from("context_nodes")
            .update({ embedding: vectorLiteral(vectors[i]) })
            .eq("id", n.id),
        ),
      );
    } catch (e) {
      // Non-fatal: nodes without embeddings just skip semantic search.
      console.error("[graph] embed batch failed:", (e as Error).message);
    }
  }

  // 3. Insert edges by joining on (type, label) → node id we just upserted.
  if (extraction.edges.length === 0) {
    return { insertedNodes: upserted, insertedEdges: [] };
  }

  const idByKey = new Map<string, string>();
  for (const n of upserted) {
    idByKey.set(`${n.type}:${n.label.toLowerCase().trim()}`, n.id);
  }

  const edgeRows = extraction.edges
    .map((e) => {
      const fromId = idByKey.get(`${e.fromType}:${e.fromLabel.toLowerCase().trim()}`);
      const toId = idByKey.get(`${e.toType}:${e.toLabel.toLowerCase().trim()}`);
      if (!fromId || !toId || fromId === toId) return null;
      return {
        owner_id: ctx.ownerId,
        from_node: fromId,
        to_node: toId,
        relation: e.relation,
        weight: e.weight ?? 1,
        source_research_id: ctx.sourceResearchId ?? null,
        source_job_id: ctx.sourceJobId ?? null,
        source_agent: ctx.sourceAgent ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (edgeRows.length === 0) {
    return { insertedNodes: upserted, insertedEdges: [] };
  }

  const { data: edgeData, error: edgeErr } = await admin
    .from("context_edges")
    .upsert(edgeRows, {
      onConflict: "owner_id,from_node,to_node,relation",
      ignoreDuplicates: true,
    })
    .select("*");

  if (edgeErr) {
    console.error("[graph] edge upsert failed:", edgeErr.message);
    return { insertedNodes: upserted, insertedEdges: [] };
  }

  return {
    insertedNodes: upserted,
    insertedEdges: (edgeData ?? []).map((r) =>
      rowToEdge(r as Record<string, unknown>),
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// findRelevantContext — top-k semantic search via match_context_nodes_for().
// ─────────────────────────────────────────────────────────────────────────────

export async function findRelevantContext(
  admin: SupabaseClient,
  query: string,
  opts: {
    ownerId: string;
    k?: number;
    minSimilarity?: number;
    filterTypes?: NodeType[];
  },
): Promise<RelevantNode[]> {
  if (!query.trim()) return [];
  let queryVector: number[];
  try {
    queryVector = await embed(query);
  } catch (e) {
    console.error("[graph] embed query failed:", (e as Error).message);
    return [];
  }

  const { data, error } = await admin.rpc("match_context_nodes_for", {
    p_owner_id: opts.ownerId,
    query_embedding: vectorLiteral(queryVector),
    match_count: opts.k ?? 8,
    min_similarity: opts.minSimilarity ?? 0.25,
    filter_types: opts.filterTypes ?? null,
  });

  if (error) {
    console.error("[graph] match_context_nodes_for failed:", error.message);
    return [];
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    type: r.type as NodeType,
    label: r.label as string,
    summary: (r.summary as string | null) ?? null,
    similarity: r.similarity as number,
    sourceResearchId: (r.source_research_id as string | null) ?? null,
    sourceJobId: (r.source_job_id as string | null) ?? null,
    refCount: r.ref_count as number,
    lastSeenAt: r.last_seen_at as string,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// getNeighborhood — 1-hop in/out neighbors of a node.
// ─────────────────────────────────────────────────────────────────────────────

export async function getNeighborhood(
  admin: SupabaseClient,
  ownerId: string,
  seedNodeId: string,
  maxNeighbors = 25,
): Promise<Neighbor[]> {
  const [outRes, inRes] = await Promise.all([
    admin
      .from("context_edges")
      .select("id, relation, weight, to_node")
      .eq("owner_id", ownerId)
      .eq("from_node", seedNodeId)
      .limit(maxNeighbors),
    admin
      .from("context_edges")
      .select("id, relation, weight, from_node")
      .eq("owner_id", ownerId)
      .eq("to_node", seedNodeId)
      .limit(maxNeighbors),
  ]);

  if (outRes.error || inRes.error) {
    console.error(
      "[graph] neighborhood failed:",
      outRes.error?.message ?? inRes.error?.message,
    );
    return [];
  }

  const neighborIds = new Set<string>();
  for (const e of outRes.data ?? []) neighborIds.add((e as { to_node: string }).to_node);
  for (const e of inRes.data ?? []) neighborIds.add((e as { from_node: string }).from_node);

  if (neighborIds.size === 0) return [];

  const { data: nodes, error: nodeErr } = await admin
    .from("context_nodes")
    .select("id, type, label, summary")
    .eq("owner_id", ownerId)
    .in("id", [...neighborIds]);
  if (nodeErr) return [];

  const nodeById = new Map<string, { id: string; type: NodeType; label: string; summary: string | null }>();
  for (const n of nodes ?? []) {
    nodeById.set((n as { id: string }).id, {
      id: (n as { id: string }).id,
      type: (n as { type: NodeType }).type,
      label: (n as { label: string }).label,
      summary: ((n as { summary: string | null }).summary) ?? null,
    });
  }

  const neighbors: Neighbor[] = [];
  for (const e of outRes.data ?? []) {
    const r = e as { id: string; relation: string; weight: number; to_node: string };
    const n = nodeById.get(r.to_node);
    if (!n) continue;
    neighbors.push({
      nodeId: n.id,
      nodeType: n.type,
      nodeLabel: n.label,
      nodeSummary: n.summary,
      edgeId: r.id,
      edgeRelation: r.relation,
      edgeWeight: r.weight,
      direction: "out",
    });
  }
  for (const e of inRes.data ?? []) {
    const r = e as { id: string; relation: string; weight: number; from_node: string };
    const n = nodeById.get(r.from_node);
    if (!n) continue;
    neighbors.push({
      nodeId: n.id,
      nodeType: n.type,
      nodeLabel: n.label,
      nodeSummary: n.summary,
      edgeId: r.id,
      edgeRelation: r.relation,
      edgeWeight: r.weight,
      direction: "in",
    });
  }
  return neighbors.slice(0, maxNeighbors);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

function rowToNode(r: Record<string, unknown>): GraphNode {
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    type: r.type as NodeType,
    label: r.label as string,
    summary: (r.summary as string | null) ?? null,
    sourceResearchId: (r.source_research_id as string | null) ?? null,
    sourceJobId: (r.source_job_id as string | null) ?? null,
    sourceAgent: (r.source_agent as string | null) ?? null,
    refCount: (r.ref_count as number) ?? 1,
    firstSeenAt: r.first_seen_at as string,
    lastSeenAt: r.last_seen_at as string,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  };
}

function rowToEdge(r: Record<string, unknown>): GraphEdge {
  return {
    id: r.id as string,
    ownerId: r.owner_id as string,
    fromNode: r.from_node as string,
    toNode: r.to_node as string,
    relation: r.relation as string,
    weight: (r.weight as number) ?? 1,
    sourceResearchId: (r.source_research_id as string | null) ?? null,
    sourceJobId: (r.source_job_id as string | null) ?? null,
    sourceAgent: (r.source_agent as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
  };
}
