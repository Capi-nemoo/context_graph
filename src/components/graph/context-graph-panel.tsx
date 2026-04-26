"use client";

// THE drop-in component. Embed inside /research/[id] in the main app:
//
//   <ContextGraphPanel
//     researchId={research.id}
//     defaultScope="this"
//     onAskAgent={(node) => router.push(`/research/${research.id}?focus=${node.id}`)}
//   />
//
// Three panes (matches Obsidian's information layout in our brutalist style):
//   [ list | canvas | detail ]
// Auto-collapses to canvas-only below 900px.

import { Brain, Globe2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas } from "./graph-canvas";
import { NodeDetailPanel } from "./node-detail";
import { SidebarList } from "./sidebar-list";
import { fetchGraph, subscribeToGraph } from "@/lib/graph/client";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";
import { createClient } from "@/lib/supabase/client";

export type Scope = "this" | "all";

type Props = {
  // Optional. When provided + scope="this", filters to nodes/edges for this research.
  researchId?: string;
  // Initial scope. Default "this" (per-research view).
  defaultScope?: Scope;
  // Optional injection: pass a static dataset to skip Supabase entirely (demo mode).
  staticData?: { nodes: GraphNode[]; edges: GraphEdge[] };
  // Hook for "send this node to the agent" actions (optional).
  onAskAgent?: (node: GraphNode) => void;
  className?: string;
  height?: number | string;
};

export function ContextGraphPanel({
  researchId,
  defaultScope = "this",
  staticData,
  onAskAgent,
  className = "",
  height = 600,
}: Props) {
  const [scope, setScope] = useState<Scope>(defaultScope);
  const [nodes, setNodes] = useState<GraphNode[]>(staticData?.nodes ?? []);
  const [edges, setEdges] = useState<GraphEdge[]>(staticData?.edges ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(!staticData);
  // ReactFlow measures the DOM during render and produces output that doesn't
  // match between server and client (different layout, different sizing). To
  // avoid the React 19 hydration warning, render only the static header + a
  // placeholder during SSR, and mount the real body only after the client has
  // taken over.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fetch
  useEffect(() => {
    if (staticData) return;
    const supabase = createClient();
    let cancelled = false;
    setLoading(true);
    fetchGraph(supabase, {
      researchId: scope === "this" ? researchId : undefined,
    })
      .then((g) => {
        if (cancelled) return;
        setNodes(g.nodes);
        setEdges(g.edges);
      })
      .catch(() => {
        if (cancelled) return;
        setNodes([]);
        setEdges([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, researchId, staticData]);

  // Realtime — only when not in static-data mode.
  useEffect(() => {
    if (staticData) return;
    const supabase = createClient();
    return subscribeToGraph(supabase, () => {
      // Refetch on any change. For a real-time feel without sync logic, this
      // is the simplest correct thing — the dataset is small and the SQL is
      // already indexed.
      void fetchGraph(supabase, {
        researchId: scope === "this" ? researchId : undefined,
      }).then((g) => {
        // Diff to mark fresh nodes
        setNodes((prev) => {
          const prevIds = new Set(prev.map((n) => n.id));
          const fresh = new Set<string>();
          for (const n of g.nodes) if (!prevIds.has(n.id)) fresh.add(n.id);
          if (fresh.size > 0) bumpFresh(fresh);
          return g.nodes;
        });
        setEdges(g.edges);
      });
    });
  }, [scope, researchId, staticData]);

  const freshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function bumpFresh(ids: Set<string>) {
    setFreshIds((prev) => new Set([...prev, ...ids]));
    if (freshTimeoutRef.current) clearTimeout(freshTimeoutRef.current);
    freshTimeoutRef.current = setTimeout(() => {
      setFreshIds(new Set());
    }, 4000);
  }

  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null),
    [selectedId, nodes],
  );

  return (
    <div
      className={`relative flex flex-col border ${className}`}
      style={{
        background: "#0a0a0a",
        borderColor: "#2a2a2a",
        height,
        fontFamily: "var(--font-mono)",
      }}
    >
      {/* Header bar */}
      <header
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "#2a2a2a" }}
      >
        <div className="flex items-center gap-2">
          <Brain size={14} style={{ color: "#00e582" }} />
          <span
            className="text-[11px] font-bold tracking-[0.15em]"
            style={{ color: "#f0f0e8" }}
          >
            CONTEXT_GRAPH
          </span>
          <span
            className="text-[10px]"
            style={{ color: "#5a5a55", letterSpacing: "0.1em" }}
          >
            // {nodes.length}n {edges.length}e
          </span>
        </div>

        {/* Scope toggle */}
        {researchId && !staticData && (
          <div className="flex items-center gap-0">
            <ScopeButton
              active={scope === "this"}
              onClick={() => {
                setScope("this");
                setSelectedId(null);
              }}
              icon={<Sparkles size={10} />}
              label="THIS RESEARCH"
            />
            <ScopeButton
              active={scope === "all"}
              onClick={() => {
                setScope("all");
                setSelectedId(null);
              }}
              icon={<Globe2 size={10} />}
              label="ALL"
            />
          </div>
        )}
      </header>

      {/* Body — three panes. Skipped during SSR so ReactFlow doesn't trigger
          a hydration mismatch from its DOM measurements. */}
      <div className="flex min-h-0 flex-1">
        {!mounted ? (
          <div className="flex w-full items-center justify-center">
            <EmptyState message="loading…" />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <SidebarList
                nodes={nodes}
                selectedNodeId={selectedId}
                onSelect={(id) => setSelectedId(id)}
              />
            </div>
            <div className="relative flex-1">
              {loading && nodes.length === 0 ? (
                <EmptyState message="loading…" />
              ) : nodes.length === 0 ? (
                <EmptyState message="graph is empty — run an agent and watch it form" />
              ) : (
                <GraphCanvas
                  nodes={nodes}
                  edges={edges}
                  selectedNodeId={selectedId}
                  freshNodeIds={freshIds}
                  onSelect={setSelectedId}
                />
              )}
            </div>
            {selectedNode && (
              <div className="hidden lg:block">
                <NodeDetailPanel
                  node={selectedNode}
                  edges={edges}
                  allNodes={nodes}
                  onClose={() => setSelectedId(null)}
                  onSelect={(id) => setSelectedId(id)}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Optional 'ask agent' bar — only shown when handler provided + node selected */}
      {onAskAgent && selectedNode && (
        <button
          onClick={() => onAskAgent(selectedNode)}
          className="border-t px-4 py-2 text-left text-[11px] tracking-[0.1em] transition hover:bg-[#0e1f12]"
          style={{ borderColor: "#2a2a2a", color: "#00e582" }}
        >
          [ ASK AGENT ABOUT &quot;{selectedNode.label}&quot; ]
        </button>
      )}
    </div>
  );
}

function ScopeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 border px-2 py-1 text-[9px] font-bold tracking-[0.1em] transition"
      style={{
        background: active ? "#00e582" : "transparent",
        color: active ? "#0a0a0a" : "#a0a09a",
        borderColor: active ? "#00e582" : "#2a2a2a",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center text-[11px] tracking-[0.1em]"
      style={{ color: "#5a5a55" }}
    >
      // {message}
    </div>
  );
}
