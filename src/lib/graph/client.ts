// Browser-safe graph queries. Uses the cookie-bound Supabase client so RLS
// scopes results to the caller automatically. No service-role key here.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GraphEdge, GraphNode, NodeType } from "./types";

// Fetch every node + edge owned by the current user, optionally scoped to one
// research. The graph for one user fits in memory comfortably below ~10k nodes;
// past that we'd add pagination + viewport-aware loading.
export async function fetchGraph(
  supabase: SupabaseClient,
  opts: { researchId?: string; limit?: number } = {},
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  let nodeQ = supabase
    .from("context_nodes")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(opts.limit ?? 1000);
  if (opts.researchId) nodeQ = nodeQ.eq("source_research_id", opts.researchId);

  const { data: nodes, error: nodeErr } = await nodeQ;
  if (nodeErr) throw nodeErr;

  if (!nodes || nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const ids = nodes.map((n) => n.id);
  const { data: edges, error: edgeErr } = await supabase
    .from("context_edges")
    .select("*")
    .or(`from_node.in.(${ids.join(",")}),to_node.in.(${ids.join(",")})`)
    .limit(2000);
  if (edgeErr) throw edgeErr;

  return {
    nodes: nodes.map(rowToNode),
    edges: (edges ?? []).map(rowToEdge),
  };
}

export async function searchNodes(
  supabase: SupabaseClient,
  query: string,
  opts: { types?: NodeType[]; limit?: number } = {},
): Promise<GraphNode[]> {
  const q = query.trim();
  if (!q) return [];
  let req = supabase
    .from("context_nodes")
    .select("*")
    .ilike("label", `%${q}%`)
    .order("last_seen_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.types && opts.types.length > 0) req = req.in("type", opts.types);
  const { data, error } = await req;
  if (error) throw error;
  return (data ?? []).map(rowToNode);
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

// Subscribe to live INSERT/UPDATE/DELETE on context_nodes + context_edges
// scoped to the current user (RLS handles this automatically). The handler
// gets payloads as fast as the pipeline writes them — exactly what powers the
// "watch the brain build" demo.
export function subscribeToGraph(
  supabase: SupabaseClient,
  onChange: (kind: "node" | "edge", payload: unknown) => void,
): () => void {
  const ch = supabase
    .channel("context_graph")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "context_nodes" },
      (p) => onChange("node", p),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "context_edges" },
      (p) => onChange("edge", p),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}
